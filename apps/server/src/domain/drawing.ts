import { deflateSync } from 'node:zlib';
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

  return encodePngDataUrl(raster.pixels, raster.width, raster.height);
}

function encodePngDataUrl(buffer: Uint8ClampedArray, width: number, height: number): string {
  const bytesPerPixel = 4;
  const scanlineStride = width * bytesPerPixel;
  const raw = Buffer.alloc((scanlineStride + 1) * height);

  for (let y = 0; y < height; y += 1) {
    const filterOffset = y * (scanlineStride + 1);
    raw[filterOffset] = 0;

    for (let x = 0; x < scanlineStride; x += 1) {
      raw[filterOffset + 1 + x] = buffer[y * scanlineStride + x] as number;
    }
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const png = Buffer.concat([
    signature,
    createPngChunk('IHDR', header),
    createPngChunk('IDAT', deflateSync(raw)),
    createPngChunk('IEND', Buffer.alloc(0)),
  ]);

  return `data:image/png;base64,${png.toString('base64')}`;
}

function createPngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);

  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(calculateCrc32(Buffer.concat([typeBuffer, data])), 8 + data.length);

  return chunk;
}

function calculateCrc32(buffer: Buffer): number {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

