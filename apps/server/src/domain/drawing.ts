import type { ApiResult } from '@sketcherson/common/room';
import { DRAWING_BACKGROUND_COLOR, DRAWING_SNAPSHOT_HEIGHT, DRAWING_SNAPSHOT_WIDTH, type DrawingAction, type DrawingState } from '@sketcherson/common/drawing';
import { rasterizeDrawingState } from '@sketcherson/common/drawingRaster';
import {
  applyDrawingActionMutable,
  createDrawingState,
  finalizeDrawingStateMutable,
} from '@sketcherson/common/drawingProtocol';

export { createDrawingState };

export function applyDrawingAction(drawing: DrawingState, action: DrawingAction): ApiResult<null> {
  return applyDrawingActionMutable(drawing, action);
}

export function finalizeDrawingState(
  drawing: DrawingState,
  renderDrawingSnapshot: (drawing: DrawingState) => string | null = renderSnapshotDataUrl,
): DrawingState {
  return finalizeDrawingStateMutable(drawing, {
    renderSnapshotDataUrl: renderDrawingSnapshot,
  });
}

function renderSnapshotDataUrl(drawing: DrawingState): string {
  const raster = rasterizeDrawingState(drawing, {
    outputWidth: DRAWING_SNAPSHOT_WIDTH,
    outputHeight: DRAWING_SNAPSHOT_HEIGHT,
    backgroundColor: DRAWING_BACKGROUND_COLOR,
  });

  return encodeBitmapDataUrl(raster.pixels, raster.width, raster.height);
}

function encodeBitmapDataUrl(buffer: Uint8ClampedArray, width: number, height: number): string {
  const bytesPerPixel = 3;
  const rowStride = Math.ceil((width * bytesPerPixel) / 4) * 4;
  const pixelArraySize = rowStride * height;
  const fileSize = 54 + pixelArraySize;
  const bitmap = Buffer.alloc(fileSize);

  bitmap.write('BM', 0, 'ascii');
  bitmap.writeUInt32LE(fileSize, 2);
  bitmap.writeUInt32LE(54, 10);
  bitmap.writeUInt32LE(40, 14);
  bitmap.writeInt32LE(width, 18);
  bitmap.writeInt32LE(height, 22);
  bitmap.writeUInt16LE(1, 26);
  bitmap.writeUInt16LE(24, 28);
  bitmap.writeUInt32LE(pixelArraySize, 34);

  for (let y = 0; y < height; y += 1) {
    const sourceRow = height - 1 - y;
    const destinationOffset = 54 + y * rowStride;

    for (let x = 0; x < width; x += 1) {
      const sourceIndex = (sourceRow * width + x) * 4;
      const destinationIndex = destinationOffset + x * bytesPerPixel;

      bitmap[destinationIndex] = buffer[sourceIndex + 2] as number;
      bitmap[destinationIndex + 1] = buffer[sourceIndex + 1] as number;
      bitmap[destinationIndex + 2] = buffer[sourceIndex] as number;
    }
  }

  return `data:image/bmp;base64,${bitmap.toString('base64')}`;
}

