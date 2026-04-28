import { describe, expect, it } from 'vitest';
import type { DrawingActionAppliedEvent, DrawingState, DrawingStrokeOperation } from './drawing';
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
