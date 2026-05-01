import { DRAWING_BRUSH_SIZES, type DrawingState } from '@sketcherson/common/drawing';
import { getAdjustedBrushSize, getCanvasPoint } from '../client-drawing-session';

function buildDrawingState(overrides?: Partial<DrawingState>): DrawingState {
  return {
    width: 800,
    height: 600,
    operations: [],
    undoneOperations: [],
    activeStrokes: [],
    revision: 0,
    snapshotDataUrl: null,
    ...overrides,
  };
}

describe('client drawing session utilities', () => {
  it('adjusts brush size within the configured brush size ladder', () => {
    expect(getAdjustedBrushSize(DRAWING_BRUSH_SIZES[1], 1)).toBe(DRAWING_BRUSH_SIZES[2]);
    expect(getAdjustedBrushSize(DRAWING_BRUSH_SIZES[1], -1)).toBe(DRAWING_BRUSH_SIZES[0]);
    expect(getAdjustedBrushSize(DRAWING_BRUSH_SIZES[0], -1)).toBe(DRAWING_BRUSH_SIZES[0]);
    expect(getAdjustedBrushSize(DRAWING_BRUSH_SIZES[DRAWING_BRUSH_SIZES.length - 1], 1)).toBe(
      DRAWING_BRUSH_SIZES[DRAWING_BRUSH_SIZES.length - 1],
    );
  });

  it('maps pointer coordinates into drawing coordinates and clamps outside points', () => {
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({
        left: 10,
        top: 20,
        right: 410,
        bottom: 320,
        width: 400,
        height: 300,
        x: 10,
        y: 20,
        toJSON: () => undefined,
      }),
    });

    expect(getCanvasPoint(canvas, buildDrawingState(), { clientX: 210, clientY: 170 })).toEqual({ x: 400, y: 300 });
    expect(getCanvasPoint(canvas, buildDrawingState(), { clientX: -100, clientY: 500 })).toEqual({ x: 0, y: 600 });
  });
});
