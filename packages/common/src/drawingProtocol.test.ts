import { describe, expect, it } from 'vitest';
import {
  DRAWING_MAX_EXTEND_POINTS,
  DRAWING_MAX_OPERATIONS,
  DRAWING_MAX_STROKE_POINTS,
  DRAWING_MAX_UNDO_OPERATIONS,
  type DrawingActionAppliedEvent,
  type DrawingState,
  type DrawingStrokeOperation,
} from './drawing';
import {
  applyDrawingAction,
  applyDrawingActionMutable,
  applyRemoteDrawingEvent,
  createDrawingState,
  finalizeDrawingState,
  getIncrementalDrawingUpdate,
} from './drawingProtocol';

function stroke(overrides?: Partial<DrawingStrokeOperation>): DrawingStrokeOperation {
  return {
    kind: 'stroke',
    id: 'stroke-1',
    tool: 'pen',
    color: '#000000',
    size: 8,
    points: [{ x: 10, y: 20 }],
    ...overrides,
  };
}

function eventFor(state: DrawingState, action: DrawingActionAppliedEvent['action'], revision = state.revision + 1): DrawingActionAppliedEvent {
  return {
    code: 'ABCDEF',
    action,
    revision,
  };
}

describe('drawingProtocol', () => {
  it('creates the default drawing state', () => {
    expect(createDrawingState()).toMatchObject({
      width: 800,
      height: 600,
      operations: [],
      undoneOperations: [],
      activeStrokes: [],
      revision: 0,
      snapshotDataUrl: null,
    });
  });

  it('applies drawing actions immutably while preserving untouched nested objects', () => {
    const initial = createDrawingState();
    const begin = applyDrawingAction(initial, {
      type: 'beginStroke',
      strokeId: 'stroke-1',
      tool: 'pen',
      color: '#000000',
      size: 8,
      point: { x: 10, y: 20 },
    });

    expect(begin.ok).toBe(true);
    if (!begin.ok) return;

    expect(initial.revision).toBe(0);
    expect(begin.data.revision).toBe(1);
    expect(begin.data.activeStrokes[0]?.points).toEqual([{ x: 10, y: 20 }]);
  });

  it('applies drawing actions mutably for server-side authoritative state', () => {
    const drawing = createDrawingState();
    const result = applyDrawingActionMutable(drawing, {
      type: 'beginStroke',
      strokeId: 'stroke-1',
      tool: 'pen',
      color: '#000000',
      size: 8,
      point: { x: 10, y: 20 },
    });

    expect(result.ok).toBe(true);
    expect(drawing.revision).toBe(1);
    expect(drawing.activeStrokes).toHaveLength(1);
  });

  it('rejects oversized drawing stroke batches before mutating state', () => {
    const drawing = createDrawingState();
    drawing.activeStrokes = [stroke()];

    const result = applyDrawingActionMutable(drawing, {
      type: 'extendStroke',
      strokeId: 'stroke-1',
      points: Array.from({ length: DRAWING_MAX_EXTEND_POINTS + 1 }, (_, index) => ({ x: index, y: 20 })),
    });

    expect(result.ok).toBe(false);
    expect(drawing.activeStrokes[0]?.points).toHaveLength(1);
    expect(drawing.revision).toBe(0);
  });

  it('rejects strokes and drawing history that exceed retained state caps', () => {
    const drawing = createDrawingState();
    drawing.activeStrokes = [stroke({ points: Array.from({ length: DRAWING_MAX_STROKE_POINTS }, (_, index) => ({ x: index % 800, y: 20 })) })];

    const extendResult = applyDrawingActionMutable(drawing, {
      type: 'extendStroke',
      strokeId: 'stroke-1',
      point: { x: 100, y: 21 },
    });

    expect(extendResult.ok).toBe(false);
    expect(drawing.activeStrokes[0]?.points).toHaveLength(DRAWING_MAX_STROKE_POINTS);

    drawing.activeStrokes = [stroke()];
    drawing.operations = Array.from({ length: DRAWING_MAX_OPERATIONS }, (_, index) => stroke({ id: `operation-${index}` }));

    const endResult = applyDrawingActionMutable(drawing, {
      type: 'endStroke',
      strokeId: 'stroke-1',
    });

    expect(endResult.ok).toBe(false);
    expect(drawing.operations).toHaveLength(DRAWING_MAX_OPERATIONS);
    expect(drawing.activeStrokes).toHaveLength(1);
  });

  it('caps retained undo history', () => {
    const drawing = createDrawingState();
    drawing.operations = Array.from({ length: DRAWING_MAX_UNDO_OPERATIONS + 1 }, (_, index) => stroke({ id: `operation-${index}` }));

    for (let index = 0; index < DRAWING_MAX_UNDO_OPERATIONS + 1; index += 1) {
      const result = applyDrawingActionMutable(drawing, { type: 'undo' });
      expect(result.ok).toBe(true);
    }

    expect(drawing.undoneOperations).toHaveLength(DRAWING_MAX_UNDO_OPERATIONS);
    expect(drawing.undoneOperations[0]?.id).toBe('operation-49');
  });

  it('applies remote events, ignores stale events, and detects revision gaps', () => {
    const drawing = createDrawingState();
    const applied = applyRemoteDrawingEvent(
      drawing,
      eventFor(drawing, {
        type: 'beginStroke',
        strokeId: 'stroke-1',
        tool: 'pen',
        color: '#000000',
        size: 8,
        point: { x: 10, y: 20 },
      }),
    );

    expect(applied.status).toBe('applied');
    expect(applied.state.revision).toBe(1);

    const stale = applyRemoteDrawingEvent(applied.state, eventFor(applied.state, { type: 'undo' }, 1));
    expect(stale.status).toBe('ignored-stale');
    expect(stale.state).toBe(applied.state);

    const gap = applyRemoteDrawingEvent(applied.state, eventFor(applied.state, { type: 'undo' }, 3));
    expect(gap.status).toBe('requires-resync');
    expect(gap.state).toBe(applied.state);
  });

  it('applies coalesced remote extend gaps without dropping merged points', () => {
    const drawing = createDrawingState();
    drawing.activeStrokes = [stroke()];
    drawing.revision = 1;
    const points = Array.from({ length: DRAWING_MAX_EXTEND_POINTS + 2 }, (_, index) => ({ x: index + 11, y: 20 }));

    const applied = applyRemoteDrawingEvent(drawing, {
      code: 'ABCDEF',
      action: { type: 'extendStroke', strokeId: 'stroke-1', points },
      revision: 4,
    });

    expect(applied.status).toBe('applied');
    expect(applied.state.revision).toBe(4);
    expect(applied.state.activeStrokes[0]?.points).toEqual([{ x: 10, y: 20 }, ...points]);
  });

  it('uses authoritative stroke completion to reconcile missed live extensions', () => {
    const drawing = createDrawingState();
    drawing.activeStrokes = [stroke({ points: [{ x: 10, y: 20 }, { x: 20, y: 30 }] })];
    drawing.revision = 2;

    const finalStroke = stroke({ points: [{ x: 10, y: 20 }, { x: 20, y: 30 }, { x: 40, y: 50 }, { x: 80, y: 90 }] });
    const applied = applyRemoteDrawingEvent(drawing, {
      code: 'ABCDEF',
      action: { type: 'endStroke', strokeId: 'stroke-1' },
      revision: 5,
      authoritativeStroke: finalStroke,
    });

    expect(applied.status).toBe('applied');
    expect(applied.state.revision).toBe(5);
    expect(applied.state.activeStrokes).toEqual([]);
    expect(applied.state.operations).toEqual([finalStroke]);
    expect(drawing.activeStrokes[0]?.points).toHaveLength(2);
  });

  it('requires resync when authoritative stroke completion arrives without the reliable stroke begin', () => {
    const drawing = createDrawingState();
    drawing.revision = 2;

    const applied = applyRemoteDrawingEvent(drawing, {
      code: 'ABCDEF',
      action: { type: 'endStroke', strokeId: 'stroke-1' },
      revision: 5,
      authoritativeStroke: stroke(),
    });

    expect(applied.status).toBe('requires-resync');
    expect(applied.state).toBe(drawing);
  });

  it('finalizes active strokes into committed operations and can render a snapshot', () => {
    const drawing = createDrawingState();
    drawing.activeStrokes = [stroke()];
    drawing.undoneOperations = [stroke({ id: 'undone' })];

    const finalized = finalizeDrawingState(drawing, {
      renderSnapshotDataUrl: () => 'data:image/test;base64,abc',
    });

    expect(drawing.activeStrokes).toHaveLength(1);
    expect(finalized.activeStrokes).toEqual([]);
    expect(finalized.operations).toEqual([stroke()]);
    expect(finalized.undoneOperations).toEqual([]);
    expect(finalized.snapshotDataUrl).toBe('data:image/test;base64,abc');
    expect(finalized.revision).toBe(1);
  });

  it('classifies incremental render updates', () => {
    const previous = createDrawingState();
    const next = {
      ...previous,
      revision: 1,
      activeStrokes: [stroke()],
    };

    expect(getIncrementalDrawingUpdate(null, previous)).toEqual({ type: 'full-rerender' });
    expect(getIncrementalDrawingUpdate(previous, previous)).toEqual({ type: 'noop' });
    expect(getIncrementalDrawingUpdate(previous, next)).toEqual({ type: 'beginStroke', stroke: stroke() });
    expect(getIncrementalDrawingUpdate(previous, { ...previous, revision: 3 })).toEqual({ type: 'full-rerender' });
  });
});
