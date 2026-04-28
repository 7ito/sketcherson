import { describe, expect, it } from 'vitest';
import { DRAWING_BACKGROUND_COLOR, rasterizeDrawingState, type DrawingState } from '../src/index';

function getPixelHex(pixels: Uint8ClampedArray, width: number, x: number, y: number): string {
  const index = (y * width + x) * 4;
  const r = pixels[index]?.toString(16).padStart(2, '0') ?? '00';
  const g = pixels[index + 1]?.toString(16).padStart(2, '0') ?? '00';
  const b = pixels[index + 2]?.toString(16).padStart(2, '0') ?? '00';
  return `#${r}${g}${b}`;
}

describe('rasterizeDrawingState', () => {
  it('fills a region enclosed by a pen stroke without leaking into the background', () => {
    const drawing: DrawingState = {
      width: 100,
      height: 100,
      revision: 2,
      snapshotDataUrl: null,
      undoneOperations: [],
      activeStrokes: [],
      operations: [
        {
          kind: 'stroke',
          id: 'stroke-1',
          tool: 'pen',
          color: '#3498db',
          size: 6,
          points: [
            { x: 20, y: 20 },
            { x: 80, y: 20 },
            { x: 80, y: 80 },
            { x: 20, y: 80 },
            { x: 20, y: 20 },
          ],
        },
        {
          kind: 'fill',
          id: 'fill-1',
          color: '#8b4513',
          point: { x: 50, y: 50 },
        },
      ],
    };

    const fullSize = rasterizeDrawingState(drawing, {
      backgroundColor: DRAWING_BACKGROUND_COLOR,
    });
    const halfSize = rasterizeDrawingState(drawing, {
      outputWidth: 50,
      outputHeight: 50,
      backgroundColor: DRAWING_BACKGROUND_COLOR,
    });

    expect(getPixelHex(fullSize.pixels, fullSize.width, 50, 50)).toBe('#8b4513');
    expect(getPixelHex(fullSize.pixels, fullSize.width, 10, 10)).toBe(DRAWING_BACKGROUND_COLOR);
    expect(getPixelHex(fullSize.pixels, fullSize.width, 20, 50)).toBe('#3498db');

    expect(getPixelHex(halfSize.pixels, halfSize.width, 25, 25)).toBe('#8b4513');
    expect(getPixelHex(halfSize.pixels, halfSize.width, 5, 5)).toBe(DRAWING_BACKGROUND_COLOR);
  });

  it('clamps fill points that land on the far canvas edge', () => {
    const drawing: DrawingState = {
      width: 12,
      height: 8,
      revision: 1,
      snapshotDataUrl: null,
      undoneOperations: [],
      activeStrokes: [],
      operations: [
        {
          kind: 'fill',
          id: 'fill-1',
          color: '#2ecc71',
          point: { x: 12, y: 8 },
        },
      ],
    };

    const raster = rasterizeDrawingState(drawing, {
      backgroundColor: DRAWING_BACKGROUND_COLOR,
    });

    expect(getPixelHex(raster.pixels, raster.width, 11, 7)).toBe('#2ecc71');
    expect(getPixelHex(raster.pixels, raster.width, 0, 0)).toBe('#2ecc71');
  });
});
