import type { ApiResult } from './apiResult';

export type { ApiResult } from './apiResult';

export const DRAWING_CANVAS_WIDTH = 800;
export const DRAWING_CANVAS_HEIGHT = 600;
export const DRAWING_SNAPSHOT_WIDTH = DRAWING_CANVAS_WIDTH;
export const DRAWING_SNAPSHOT_HEIGHT = DRAWING_CANVAS_HEIGHT;
export const DRAWING_BACKGROUND_COLOR = '#f7fbff';
export const DRAWING_PEN_SIZE = 6;
export const DRAWING_ERASER_SIZE = 18;
export const DRAWING_COLORS = [
  '#000000', '#808080', '#ffff00', '#ff8c00', '#ff0000', '#a0522d', '#ffc0cb', '#ff00ff', '#0000ff', '#00ffff', '#5cc9a0', '#008000',
  '#ffffff', '#c0c0c0', '#cccc00', '#cc7000', '#990000', '#804000', '#ff99cc', '#800080', '#000080', '#3399ff', '#3a9a78', '#006400',
] as const;
export const DRAWING_BRUSH_SIZES = [3, 8, 14, 22] as const;
export type DrawingBrushSize = (typeof DRAWING_BRUSH_SIZES)[number];
export type DrawingTool = 'pen' | 'eraser' | 'fill';

export interface DrawingPoint {
  x: number;
  y: number;
}

export interface DrawingStrokeOperation {
  kind: 'stroke';
  id: string;
  tool: DrawingTool;
  color: string;
  size: number;
  points: DrawingPoint[];
}

export interface DrawingClearOperation {
  kind: 'clear';
  id: string;
}

export interface DrawingFillOperation {
  kind: 'fill';
  id: string;
  color: string;
  point: DrawingPoint;
}

export type DrawingOperation = DrawingStrokeOperation | DrawingClearOperation | DrawingFillOperation;

export interface DrawingState {
  width: number;
  height: number;
  operations: DrawingOperation[];
  undoneOperations: DrawingOperation[];
  activeStrokes: DrawingStrokeOperation[];
  revision: number;
  snapshotDataUrl: string | null;
}

export interface BeginDrawingStrokeAction {
  type: 'beginStroke';
  strokeId: string;
  tool: DrawingTool;
  color: string;
  size: number;
  point: DrawingPoint;
}

export interface ExtendDrawingStrokeAction {
  type: 'extendStroke';
  strokeId: string;
  point?: DrawingPoint;
  points?: DrawingPoint[];
}

export interface EndDrawingStrokeAction {
  type: 'endStroke';
  strokeId: string;
}

export interface UndoDrawingAction {
  type: 'undo';
}

export interface RedoDrawingAction {
  type: 'redo';
}

export interface ClearDrawingAction {
  type: 'clear';
}

export interface FillDrawingAction {
  type: 'fill';
  color: string;
  point: DrawingPoint;
}

export type DrawingAction =
  | BeginDrawingStrokeAction
  | ExtendDrawingStrokeAction
  | EndDrawingStrokeAction
  | UndoDrawingAction
  | RedoDrawingAction
  | ClearDrawingAction
  | FillDrawingAction;

export interface DrawingActionAppliedEvent {
  code: string;
  action: DrawingAction;
  revision: number;
  stateRevision?: number;
  authoritativeStroke?: DrawingStrokeOperation;
  finalizedStrokes?: DrawingStrokeOperation[];
}

export const DRAWING_MAX_EXTEND_POINTS = 128;
export const DRAWING_MAX_STROKE_POINTS = 4_000;
export const DRAWING_MAX_OPERATIONS = 1_000;
export const DRAWING_MAX_UNDO_OPERATIONS = 50;

const DRAWING_ACTION_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const DRAWING_ACTION_MIN_BRUSH_SIZE = 2;
const DRAWING_ACTION_MAX_BRUSH_SIZE = 32;

export function applyDrawingActionToState(drawing: DrawingState, action: DrawingAction): ApiResult<null> {
  switch (action.type) {
    case 'beginStroke': {
      if (!isDrawingStrokeIdValid(action.strokeId)) {
        return invalidDrawingActionResult('Drawing stroke id is invalid.');
      }

      if (!isDrawingToolValid(action.tool)) {
        return invalidDrawingActionResult('Drawing tool is invalid.');
      }

      if (!isDrawingColorValid(action.color)) {
        return invalidDrawingActionResult('Drawing color is invalid.');
      }

      if (
        !Number.isFinite(action.size) ||
        action.size < DRAWING_ACTION_MIN_BRUSH_SIZE ||
        action.size > DRAWING_ACTION_MAX_BRUSH_SIZE
      ) {
        return invalidDrawingActionResult('Drawing brush size is invalid.');
      }

      if (!isDrawingPointWithinBounds(action.point, drawing.width, drawing.height)) {
        return invalidDrawingActionResult('Drawing point is outside the canvas bounds.');
      }

      if (findActiveStrokeById(drawing, action.strokeId)) {
        return invalidDrawingActionResult('Drawing stroke id is already active.');
      }

      clearDrawingRedoHistory(drawing);
      drawing.activeStrokes.push({
        kind: 'stroke',
        id: action.strokeId,
        tool: action.tool,
        color: action.color,
        size: Math.round(action.size),
        points: [clampDrawingPoint(action.point, drawing.width, drawing.height)],
      });
      drawing.snapshotDataUrl = null;
      drawing.revision += 1;
      return { ok: true, data: null };
    }

    case 'extendStroke': {
      const activeStroke = findActiveStrokeById(drawing, action.strokeId);
      if (!activeStroke) {
        return invalidDrawingActionResult('The drawing stroke could not be continued.');
      }

      const inputPoints = getExtendDrawingStrokePoints(action);
      if (!inputPoints) {
        return invalidDrawingActionResult('Drawing point is outside the canvas bounds.');
      }

      if (inputPoints.length > DRAWING_MAX_EXTEND_POINTS) {
        return invalidDrawingActionResult(`Drawing strokes can only send ${DRAWING_MAX_EXTEND_POINTS} points at a time.`);
      }

      const clampedPoints = inputPoints.map((point) => {
        if (!isDrawingPointWithinBounds(point, drawing.width, drawing.height)) {
          return null;
        }

        return clampDrawingPoint(point, drawing.width, drawing.height);
      });

      if (clampedPoints.some((point) => point === null)) {
        return invalidDrawingActionResult('Drawing point is outside the canvas bounds.');
      }

      const nextPoints = clampedPoints.filter((point): point is DrawingPoint => point !== null);
      const uniquePoints: DrawingPoint[] = [];
      let previousPoint = activeStroke.points.at(-1) ?? null;

      for (const nextPoint of nextPoints) {
        if (previousPoint && previousPoint.x === nextPoint.x && previousPoint.y === nextPoint.y) {
          continue;
        }

        uniquePoints.push(nextPoint);
        previousPoint = nextPoint;
      }

      if (uniquePoints.length === 0) {
        return { ok: true, data: null };
      }

      if (activeStroke.points.length + uniquePoints.length > DRAWING_MAX_STROKE_POINTS) {
        return invalidDrawingActionResult(`Drawing strokes can only contain ${DRAWING_MAX_STROKE_POINTS} points.`);
      }

      clearDrawingRedoHistory(drawing);
      activeStroke.points.push(...uniquePoints);
      drawing.snapshotDataUrl = null;
      drawing.revision += 1;
      return { ok: true, data: null };
    }

    case 'endStroke': {
      const activeStrokeIndex = drawing.activeStrokes.findIndex((stroke) => stroke.id === action.strokeId);
      if (activeStrokeIndex === -1) {
        return invalidDrawingActionResult('The drawing stroke could not be completed.');
      }

      if (drawing.operations.length >= DRAWING_MAX_OPERATIONS) {
        return invalidDrawingActionResult(`Drawing history can only contain ${DRAWING_MAX_OPERATIONS} operations.`);
      }

      const [activeStroke] = drawing.activeStrokes.splice(activeStrokeIndex, 1);

      clearDrawingRedoHistory(drawing);
      drawing.operations.push(cloneDrawingStrokeOperation(activeStroke as DrawingStrokeOperation));
      drawing.snapshotDataUrl = null;
      drawing.revision += 1;
      return { ok: true, data: null };
    }

    case 'undo': {
      const activeStroke = drawing.activeStrokes.pop();
      if (activeStroke) {
        drawing.undoneOperations.push(cloneDrawingStrokeOperation(activeStroke));
      } else {
        const operation = drawing.operations.pop();
        if (operation) {
          drawing.undoneOperations.push(cloneDrawingOperation(operation));
        }
      }

      capDrawingUndoHistory(drawing);
      drawing.snapshotDataUrl = null;
      drawing.revision += 1;
      return { ok: true, data: null };
    }

    case 'redo': {
      const operation = drawing.undoneOperations.pop();
      if (!operation) {
        return { ok: true, data: null };
      }

      if (drawing.operations.length >= DRAWING_MAX_OPERATIONS) {
        drawing.undoneOperations.push(operation);
        return invalidDrawingActionResult(`Drawing history can only contain ${DRAWING_MAX_OPERATIONS} operations.`);
      }

      drawing.activeStrokes = [];
      drawing.operations.push(cloneDrawingOperation(operation));
      drawing.snapshotDataUrl = null;
      drawing.revision += 1;
      return { ok: true, data: null };
    }

    case 'clear': {
      if (drawing.operations.length >= DRAWING_MAX_OPERATIONS) {
        return invalidDrawingActionResult(`Drawing history can only contain ${DRAWING_MAX_OPERATIONS} operations.`);
      }

      clearDrawingRedoHistory(drawing);
      drawing.activeStrokes = [];
      drawing.operations.push({
        kind: 'clear',
        id: createSyntheticDrawingOperationId(drawing.revision),
      });
      drawing.snapshotDataUrl = null;
      drawing.revision += 1;
      return { ok: true, data: null };
    }

    case 'fill': {
      if (!isDrawingColorValid(action.color)) {
        return invalidDrawingActionResult('Drawing color is invalid.');
      }

      if (!isDrawingPointWithinBounds(action.point, drawing.width, drawing.height)) {
        return invalidDrawingActionResult('Fill point is outside the canvas bounds.');
      }

      if (drawing.operations.length >= DRAWING_MAX_OPERATIONS) {
        return invalidDrawingActionResult(`Drawing history can only contain ${DRAWING_MAX_OPERATIONS} operations.`);
      }

      clearDrawingRedoHistory(drawing);
      drawing.operations.push({
        kind: 'fill',
        id: createSyntheticDrawingOperationId(drawing.revision),
        color: action.color,
        point: clampDrawingPoint(action.point, drawing.width, drawing.height),
      });
      drawing.snapshotDataUrl = null;
      drawing.revision += 1;
      return { ok: true, data: null };
    }
  }
}

function getExtendDrawingStrokePoints(action: ExtendDrawingStrokeAction): DrawingPoint[] | null {
  if (action.point && action.points) {
    return null;
  }

  if (action.point) {
    return [action.point];
  }

  if (!action.points || action.points.length === 0) {
    return null;
  }

  return action.points;
}

function isDrawingStrokeIdValid(value: string): boolean {
  return value.trim().length > 0 && value.length <= 64;
}

function isDrawingToolValid(value: string): boolean {
  return value === 'pen' || value === 'eraser' || value === 'fill';
}

function isDrawingColorValid(value: string): boolean {
  return DRAWING_ACTION_COLOR_PATTERN.test(value);
}

function isDrawingPointWithinBounds(point: DrawingPoint, width: number, height: number): boolean {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x >= 0 &&
    point.x <= width &&
    point.y >= 0 &&
    point.y <= height
  );
}

function clampDrawingPoint(point: DrawingPoint, width: number, height: number): DrawingPoint {
  return {
    x: clampDrawingValue(point.x, 0, width),
    y: clampDrawingValue(point.y, 0, height),
  };
}

function clampDrawingValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function cloneDrawingStrokeOperation(operation: DrawingStrokeOperation): DrawingStrokeOperation {
  return {
    ...operation,
    points: operation.points.map((point) => ({ ...point })),
  };
}

function findActiveStrokeById(drawing: DrawingState, strokeId: string): DrawingStrokeOperation | null {
  return drawing.activeStrokes.find((stroke) => stroke.id === strokeId) ?? null;
}

function cloneDrawingOperation(operation: DrawingOperation): DrawingOperation {
  return operation.kind === 'stroke'
    ? cloneDrawingStrokeOperation(operation)
    : operation.kind === 'fill'
      ? {
          ...operation,
          point: { ...operation.point },
        }
      : { ...operation };
}

function clearDrawingRedoHistory(drawing: DrawingState): void {
  if (drawing.undoneOperations.length > 0) {
    drawing.undoneOperations = [];
  }
}

function capDrawingUndoHistory(drawing: DrawingState): void {
  if (drawing.undoneOperations.length > DRAWING_MAX_UNDO_OPERATIONS) {
    drawing.undoneOperations = drawing.undoneOperations.slice(-DRAWING_MAX_UNDO_OPERATIONS);
  }
}

function createSyntheticDrawingOperationId(revision: number): string {
  return `operation-${revision + 1}`;
}

function invalidDrawingActionResult(message: string): ApiResult<null> {
  return {
    ok: false,
    error: {
      code: 'INVALID_DRAW_ACTION',
      message,
    },
  };
}
