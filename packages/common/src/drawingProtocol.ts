import {
  applyDrawingActionToState,
  DRAWING_CANVAS_HEIGHT,
  DRAWING_CANVAS_WIDTH,
  type ApiResult,
  type DrawingAction,
  type DrawingActionAppliedEvent,
  type DrawingOperation,
  type DrawingPoint,
  type DrawingState,
  type DrawingStrokeOperation,
} from './drawing';

export type DrawingIncrementalUpdate =
  | { type: 'full-rerender' }
  | { type: 'noop' }
  | { type: 'beginStroke'; stroke: DrawingStrokeOperation }
  | { type: 'extendStroke'; stroke: DrawingStrokeOperation }
  | { type: 'appendOperation'; operation: DrawingOperation };

export type RemoteDrawingEventStatus = 'applied' | 'ignored-stale' | 'requires-resync';

export interface ApplyRemoteDrawingEventResult {
  state: DrawingState;
  status: RemoteDrawingEventStatus;
}

export interface FinalizeDrawingStateOptions {
  renderSnapshotDataUrl?: (drawing: DrawingState) => string | null;
}

export function createDrawingState(options?: { width?: number; height?: number }): DrawingState {
  return {
    width: options?.width ?? DRAWING_CANVAS_WIDTH,
    height: options?.height ?? DRAWING_CANVAS_HEIGHT,
    operations: [],
    undoneOperations: [],
    activeStrokes: [],
    revision: 0,
    snapshotDataUrl: null,
  };
}

export function cloneDrawingState(drawing: DrawingState): DrawingState {
  return {
    width: drawing.width,
    height: drawing.height,
    revision: drawing.revision,
    snapshotDataUrl: drawing.snapshotDataUrl,
    operations: drawing.operations.map(cloneDrawingOperation),
    undoneOperations: drawing.undoneOperations.map(cloneDrawingOperation),
    activeStrokes: drawing.activeStrokes.map(cloneStroke),
  };
}

export function applyDrawingActionMutable(drawing: DrawingState, action: DrawingAction): ApiResult<null> {
  return applyDrawingActionToState(drawing, action);
}

export function applyDrawingAction(drawing: DrawingState, action: DrawingAction): ApiResult<DrawingState> {
  const draft = createMutableDrawingDraft(drawing, action);
  const result = applyDrawingActionMutable(draft, action);

  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    data: draft,
  };
}

export function applyRemoteDrawingEvent(drawing: DrawingState, event: DrawingActionAppliedEvent): ApplyRemoteDrawingEventResult {
  if (event.revision <= drawing.revision) {
    return {
      state: drawing,
      status: 'ignored-stale',
    };
  }

  const isCoalescedExtend = event.action.type === 'extendStroke' && event.revision > drawing.revision + 1;
  if (event.revision !== drawing.revision + 1 && !isCoalescedExtend) {
    return {
      state: drawing,
      status: 'requires-resync',
    };
  }

  const result = event.action.type === 'endStroke' && event.authoritativeStroke
    ? applyAuthoritativeEndStrokeEvent(drawing, event)
    : applyDrawingAction(drawing, event.action);
  if (!result.ok) {
    return {
      state: drawing,
      status: 'requires-resync',
    };
  }

  const appliedState = isCoalescedExtend
    ? { ...result.data, revision: event.revision }
    : result.data;

  if (appliedState.revision !== event.revision) {
    return {
      state: drawing,
      status: 'requires-resync',
    };
  }

  return {
    state: appliedState,
    status: 'applied',
  };
}

function applyAuthoritativeEndStrokeEvent(drawing: DrawingState, event: DrawingActionAppliedEvent): ApiResult<DrawingState> {
  if (event.action.type !== 'endStroke' || !event.authoritativeStroke || event.authoritativeStroke.id !== event.action.strokeId) {
    return applyDrawingAction(drawing, event.action);
  }

  const strokeId = event.action.strokeId;
  const draft = {
    ...drawing,
    operations: [...drawing.operations],
    activeStrokes: drawing.activeStrokes.filter((stroke) => stroke.id !== strokeId),
    undoneOperations: [],
    snapshotDataUrl: null,
    revision: drawing.revision + 1,
  };

  draft.operations.push(cloneStroke(event.authoritativeStroke));

  return {
    ok: true,
    data: draft,
  };
}

export function finalizeDrawingStateMutable(drawing: DrawingState, options?: FinalizeDrawingStateOptions): DrawingState {
  if (drawing.activeStrokes.length > 0) {
    clearDrawingRedoHistory(drawing);

    for (const activeStroke of drawing.activeStrokes) {
      drawing.operations.push(cloneStroke(activeStroke));
    }

    drawing.activeStrokes = [];
  }

  drawing.snapshotDataUrl = options?.renderSnapshotDataUrl?.(drawing) ?? drawing.snapshotDataUrl;
  drawing.revision += 1;
  return drawing;
}

export function finalizeDrawingState(drawing: DrawingState, options?: FinalizeDrawingStateOptions): DrawingState {
  return finalizeDrawingStateMutable(cloneDrawingState(drawing), options);
}

export function getIncrementalDrawingUpdate(
  previousDrawing: DrawingState | null,
  nextDrawing: DrawingState,
): DrawingIncrementalUpdate {
  if (!previousDrawing) {
    return { type: 'full-rerender' };
  }

  if (previousDrawing.width !== nextDrawing.width || previousDrawing.height !== nextDrawing.height) {
    return { type: 'full-rerender' };
  }

  if (nextDrawing.revision === previousDrawing.revision) {
    return areDrawingOperationsEquivalent(previousDrawing.operations, nextDrawing.operations) &&
      areStrokeOperationListsEquivalent(previousDrawing.activeStrokes, nextDrawing.activeStrokes)
      ? { type: 'noop' }
      : { type: 'full-rerender' };
  }

  if (nextDrawing.revision !== previousDrawing.revision + 1) {
    return { type: 'full-rerender' };
  }

  const operationsUnchanged = areDrawingOperationsEquivalent(previousDrawing.operations, nextDrawing.operations);

  if (operationsUnchanged) {
    const addedStroke = findAddedActiveStroke(previousDrawing.activeStrokes, nextDrawing.activeStrokes);
    if (addedStroke && areStrokeListsEquivalentWithoutId(previousDrawing.activeStrokes, nextDrawing.activeStrokes, addedStroke.id)) {
      return {
        type: 'beginStroke',
        stroke: cloneStroke(addedStroke),
      };
    }

    const extendedStroke = findExtendedActiveStroke(previousDrawing.activeStrokes, nextDrawing.activeStrokes);
    if (extendedStroke) {
      return extendedStroke;
    }

    if (areStrokeOperationListsEquivalent(previousDrawing.activeStrokes, nextDrawing.activeStrokes)) {
      return { type: 'noop' };
    }

    return { type: 'full-rerender' };
  }

  if (
    nextDrawing.operations.length === previousDrawing.operations.length + 1 &&
    areDrawingOperationsEquivalent(previousDrawing.operations, nextDrawing.operations.slice(0, -1))
  ) {
    const appendedOperation = nextDrawing.operations.at(-1);
    if (!appendedOperation) {
      return { type: 'full-rerender' };
    }

    if (
      appendedOperation.kind === 'stroke' &&
      isEndStrokeTransition(previousDrawing.activeStrokes, nextDrawing.activeStrokes, appendedOperation.id)
    ) {
      return { type: 'noop' };
    }

    return {
      type: 'appendOperation',
      operation: cloneDrawingOperation(appendedOperation),
    };
  }

  return { type: 'full-rerender' };
}

function createMutableDrawingDraft(drawing: DrawingState, action: DrawingAction): DrawingState {
  switch (action.type) {
    case 'beginStroke':
      return {
        ...drawing,
        activeStrokes: [...drawing.activeStrokes],
      };

    case 'extendStroke': {
      const activeStrokeIndex = drawing.activeStrokes.findIndex((stroke) => stroke.id === action.strokeId);
      if (activeStrokeIndex === -1) {
        return { ...drawing };
      }

      const activeStrokes = [...drawing.activeStrokes];
      activeStrokes[activeStrokeIndex] = cloneStroke(activeStrokes[activeStrokeIndex] as DrawingStrokeOperation);

      return {
        ...drawing,
        activeStrokes,
      };
    }

    case 'endStroke':
      return {
        ...drawing,
        operations: [...drawing.operations],
        activeStrokes: [...drawing.activeStrokes],
      };

    case 'undo':
      return {
        ...drawing,
        operations: drawing.activeStrokes.length > 0 ? drawing.operations : [...drawing.operations],
        undoneOperations: [...drawing.undoneOperations],
        activeStrokes: drawing.activeStrokes.length > 0 ? [...drawing.activeStrokes] : drawing.activeStrokes,
      };

    case 'redo':
      return {
        ...drawing,
        operations: [...drawing.operations],
        undoneOperations: [...drawing.undoneOperations],
      };

    case 'clear':
    case 'fill':
      return {
        ...drawing,
        operations: [...drawing.operations],
      };
  }
}

function cloneDrawingOperation(operation: DrawingOperation): DrawingOperation {
  if (operation.kind === 'stroke') {
    return cloneStroke(operation);
  }

  if (operation.kind === 'fill') {
    return {
      kind: 'fill',
      id: operation.id,
      color: operation.color,
      point: { ...operation.point },
    };
  }

  return {
    kind: 'clear',
    id: operation.id,
  };
}

function cloneStroke(stroke: DrawingStrokeOperation): DrawingStrokeOperation {
  return {
    kind: 'stroke',
    id: stroke.id,
    tool: stroke.tool,
    color: stroke.color,
    size: stroke.size,
    points: stroke.points.map((point) => ({ ...point })),
  };
}

function clearDrawingRedoHistory(drawing: DrawingState): void {
  if (drawing.undoneOperations.length > 0) {
    drawing.undoneOperations = [];
  }
}

function areDrawingOperationsEquivalent(previous: DrawingOperation[], next: DrawingOperation[]): boolean {
  if (previous.length !== next.length) {
    return false;
  }

  for (let index = 0; index < previous.length; index += 1) {
    if (!areDrawingOperationsPairEquivalent(previous[index] as DrawingOperation, next[index] as DrawingOperation)) {
      return false;
    }
  }

  return true;
}

function areDrawingOperationsPairEquivalent(previous: DrawingOperation, next: DrawingOperation): boolean {
  if (previous.kind !== next.kind || previous.id !== next.id) {
    return false;
  }

  if (previous.kind === 'clear' && next.kind === 'clear') {
    return true;
  }

  if (previous.kind === 'fill' && next.kind === 'fill') {
    return previous.color === next.color && areDrawingPointsEquivalent(previous.point, next.point);
  }

  if (previous.kind === 'stroke' && next.kind === 'stroke') {
    return areStrokeOperationsEquivalent(previous, next);
  }

  return false;
}

function areStrokeOperationListsEquivalent(previous: DrawingStrokeOperation[], next: DrawingStrokeOperation[]): boolean {
  if (previous.length !== next.length) {
    return false;
  }

  for (let index = 0; index < previous.length; index += 1) {
    if (!areStrokeOperationsEquivalent(previous[index] as DrawingStrokeOperation, next[index] as DrawingStrokeOperation)) {
      return false;
    }
  }

  return true;
}

function areStrokeOperationsEquivalent(previous: DrawingStrokeOperation, next: DrawingStrokeOperation): boolean {
  if (!previous || !next) {
    return previous === next;
  }

  if (
    previous.id !== next.id ||
    previous.tool !== next.tool ||
    previous.color !== next.color ||
    previous.size !== next.size ||
    previous.points.length !== next.points.length
  ) {
    return false;
  }

  if (previous.points.length === 0) {
    return true;
  }

  const previousFirstPoint = previous.points[0] as DrawingPoint;
  const nextFirstPoint = next.points[0] as DrawingPoint;
  const previousLastPoint = previous.points[previous.points.length - 1] as DrawingPoint;
  const nextLastPoint = next.points[next.points.length - 1] as DrawingPoint;

  return areDrawingPointsEquivalent(previousFirstPoint, nextFirstPoint) && areDrawingPointsEquivalent(previousLastPoint, nextLastPoint);
}

function findAddedActiveStroke(previous: DrawingStrokeOperation[], next: DrawingStrokeOperation[]): DrawingStrokeOperation | null {
  if (next.length !== previous.length + 1) {
    return null;
  }

  const previousIds = new Set(previous.map((stroke) => stroke.id));
  const added = next.filter((stroke) => !previousIds.has(stroke.id));
  return added.length === 1 ? (added[0] as DrawingStrokeOperation) : null;
}

function areStrokeListsEquivalentWithoutId(
  previous: DrawingStrokeOperation[],
  next: DrawingStrokeOperation[],
  excludedStrokeId: string,
): boolean {
  const filteredPrevious = previous.filter((stroke) => stroke.id !== excludedStrokeId);
  const filteredNext = next.filter((stroke) => stroke.id !== excludedStrokeId);
  return areStrokeOperationListsEquivalent(filteredPrevious, filteredNext);
}

function findExtendedActiveStroke(previous: DrawingStrokeOperation[], next: DrawingStrokeOperation[]): DrawingIncrementalUpdate | null {
  if (previous.length !== next.length) {
    return null;
  }

  let extendedStroke: DrawingStrokeOperation | null = null;
  let extendedStrokePreviousPointCount = 0;

  for (let index = 0; index < previous.length; index += 1) {
    const previousStroke = previous[index] as DrawingStrokeOperation;
    const nextStroke = next[index] as DrawingStrokeOperation;

    if (
      previousStroke.id === nextStroke.id &&
      previousStroke.tool === nextStroke.tool &&
      previousStroke.color === nextStroke.color &&
      previousStroke.size === nextStroke.size &&
      nextStroke.points.length > previousStroke.points.length &&
      areDrawingPointArraysEquivalent(previousStroke.points, nextStroke.points.slice(0, previousStroke.points.length))
    ) {
      if (extendedStroke) {
        return null;
      }

      extendedStroke = nextStroke;
      extendedStrokePreviousPointCount = previousStroke.points.length;
      continue;
    }

    if (!areStrokeOperationsEquivalent(previousStroke, nextStroke)) {
      return null;
    }
  }

  if (!extendedStroke) {
    return null;
  }

  const previousAnchorPoint = extendedStroke.points[extendedStrokePreviousPointCount - 1];
  const nextTailPoints = extendedStroke.points.slice(extendedStrokePreviousPointCount);

  if (!previousAnchorPoint || nextTailPoints.length === 0) {
    return null;
  }

  return {
    type: 'extendStroke',
    stroke: {
      kind: 'stroke',
      id: extendedStroke.id,
      tool: extendedStroke.tool,
      color: extendedStroke.color,
      size: extendedStroke.size,
      points: [{ ...previousAnchorPoint }, ...nextTailPoints.map((point) => ({ ...point }))],
    },
  };
}

function areDrawingPointArraysEquivalent(previous: DrawingPoint[], next: DrawingPoint[]): boolean {
  if (previous.length !== next.length) {
    return false;
  }

  for (let index = 0; index < previous.length; index += 1) {
    if (!areDrawingPointsEquivalent(previous[index] as DrawingPoint, next[index] as DrawingPoint)) {
      return false;
    }
  }

  return true;
}

function isEndStrokeTransition(previous: DrawingStrokeOperation[], next: DrawingStrokeOperation[], strokeId: string): boolean {
  if (previous.length !== next.length + 1) {
    return false;
  }

  return areStrokeOperationListsEquivalent(
    previous.filter((stroke) => stroke.id !== strokeId),
    next,
  );
}

function areDrawingPointsEquivalent(previous: DrawingPoint, next: DrawingPoint): boolean {
  return previous.x === next.x && previous.y === next.y;
}
