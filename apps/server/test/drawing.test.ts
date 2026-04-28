import { describe, expect, it } from 'vitest';
import { applyDrawingAction, createDrawingState, finalizeDrawingState } from '../src/domain/drawing';

describe('drawing state', () => {
  it('tracks a live stroke and captures a bitmap snapshot at turn end', () => {
    const drawing = createDrawingState();

    expect(
      applyDrawingAction(drawing, {
        type: 'beginStroke',
        strokeId: 'stroke-1',
        tool: 'pen',
        color: '#101a35',
        size: 6,
        point: { x: 120, y: 80 },
      }).ok,
    ).toBe(true);

    expect(
      applyDrawingAction(drawing, {
        type: 'extendStroke',
        strokeId: 'stroke-1',
        points: [
          { x: 180, y: 120 },
          { x: 220, y: 180 },
        ],
      }).ok,
    ).toBe(true);

    expect(
      applyDrawingAction(drawing, {
        type: 'endStroke',
        strokeId: 'stroke-1',
      }).ok,
    ).toBe(true);

    expect(drawing.operations).toHaveLength(1);
    expect(drawing.activeStrokes).toEqual([]);
    expect(drawing.operations[0]).toMatchObject({ kind: 'stroke' });
    expect(drawing.operations[0]?.kind === 'stroke' ? drawing.operations[0].points : []).toHaveLength(3);

    finalizeDrawingState(drawing);

    expect(drawing.snapshotDataUrl).toMatch(/^data:image\/bmp;base64,/);
  });

  it('treats clear as an undoable drawing operation', () => {
    const drawing = createDrawingState();

    applyDrawingAction(drawing, {
      type: 'beginStroke',
      strokeId: 'stroke-1',
      tool: 'pen',
      color: '#2d56ff',
      size: 6,
      point: { x: 40, y: 40 },
    });
    applyDrawingAction(drawing, {
      type: 'endStroke',
      strokeId: 'stroke-1',
    });
    applyDrawingAction(drawing, {
      type: 'clear',
    });

    expect(drawing.operations.map((operation) => operation.kind)).toEqual(['stroke', 'clear']);

    applyDrawingAction(drawing, {
      type: 'undo',
    });

    expect(drawing.operations.map((operation) => operation.kind)).toEqual(['stroke']);
    expect(drawing.undoneOperations.map((operation) => operation.kind)).toEqual(['clear']);

    applyDrawingAction(drawing, {
      type: 'redo',
    });

    expect(drawing.operations.map((operation) => operation.kind)).toEqual(['stroke', 'clear']);
    expect(drawing.undoneOperations).toEqual([]);
  });

  it('clears redo history after a new drawing action', () => {
    const drawing = createDrawingState();

    applyDrawingAction(drawing, {
      type: 'beginStroke',
      strokeId: 'stroke-1',
      tool: 'pen',
      color: '#2d56ff',
      size: 6,
      point: { x: 40, y: 40 },
    });
    applyDrawingAction(drawing, {
      type: 'endStroke',
      strokeId: 'stroke-1',
    });
    applyDrawingAction(drawing, {
      type: 'undo',
    });

    expect(drawing.undoneOperations).toHaveLength(1);

    applyDrawingAction(drawing, {
      type: 'beginStroke',
      strokeId: 'stroke-2',
      tool: 'pen',
      color: '#ff6600',
      size: 6,
      point: { x: 80, y: 80 },
    });

    expect(drawing.undoneOperations).toEqual([]);
  });
});
