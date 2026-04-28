import type { DrawingPoint, DrawingState } from '@sketcherson/common/drawing';

export interface CanvasPointerLike {
  clientX: number;
  clientY: number;
}

export function getCanvasPoint(
  canvas: HTMLCanvasElement | null,
  drawing: DrawingState | null,
  event: CanvasPointerLike,
): DrawingPoint | null {
  if (!canvas || !drawing) {
    return null;
  }

  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const x = ((event.clientX - rect.left) / rect.width) * drawing.width;
  const y = ((event.clientY - rect.top) / rect.height) * drawing.height;

  return {
    x: Math.max(0, Math.min(drawing.width, Math.round(x))),
    y: Math.max(0, Math.min(drawing.height, Math.round(y))),
  };
}
