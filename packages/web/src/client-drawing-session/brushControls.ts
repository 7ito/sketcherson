import { DRAWING_BRUSH_SIZES, type DrawingBrushSize } from '@7ito/sketcherson-common/drawing';

export function getAdjustedBrushSize(currentSize: number, step: -1 | 1): DrawingBrushSize {
  const index = DRAWING_BRUSH_SIZES.indexOf(currentSize as DrawingBrushSize);

  if (index === -1) {
    return currentSize as DrawingBrushSize;
  }

  const nextIndex = Math.max(0, Math.min(DRAWING_BRUSH_SIZES.length - 1, index + step));
  return DRAWING_BRUSH_SIZES[nextIndex];
}
