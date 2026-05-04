import { performance } from 'node:perf_hooks';
import { Worker } from 'node:worker_threads';
import { deflateSync } from 'node:zlib';
import type { ApiResult } from '@7ito/sketcherson-common/room';
import { DRAWING_BACKGROUND_COLOR, DRAWING_SNAPSHOT_HEIGHT, DRAWING_SNAPSHOT_WIDTH, type DrawingAction, type DrawingState } from '@7ito/sketcherson-common/drawing';
import { rasterizeDrawingState } from '@7ito/sketcherson-common/drawingRaster';
import {
  applyDrawingActionMutable,
  createDrawingState,
  finalizeDrawingStateMutable,
} from '@7ito/sketcherson-common/drawingProtocol';
import { logDrawingTransportMetric } from '../drawingMetrics';

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

export interface AsyncSnapshotRenderer {
  render(drawing: DrawingState): Promise<string | null>;
}

export function createAsyncSnapshotRenderer(options?: { timeoutMs?: number; maxQueueDepth?: number }): AsyncSnapshotRenderer {
  const timeoutMs = options?.timeoutMs ?? 2_000;
  const maxQueueDepth = options?.maxQueueDepth ?? 8;
  let nextId = 1;
  let worker: Worker | null = null;
  const pending = new Map<number, { startedAt: number; queuedAt: number; resolve: (value: string | null) => void; timeout: NodeJS.Timeout }>();

  function getWorker(): Worker {
    if (worker) {
      return worker;
    }

    const workerPath = import.meta.url.endsWith('.ts') ? './drawingSnapshotWorker.ts' : './domain/drawingSnapshotWorker.js';
    worker = new Worker(new URL(workerPath, import.meta.url));
    worker.unref();
    worker.on('message', (message: { id: number; dataUrl?: string; error?: string }) => {
      const request = pending.get(message.id);
      if (!request) {
        return;
      }

      clearTimeout(request.timeout);
      pending.delete(message.id);
      logDrawingTransportMetric(message.error ? 'drawing.snapshot.failed' : 'drawing.snapshot.rendered', {
        durationMs: Math.round((performance.now() - request.startedAt) * 100) / 100,
        queueWaitMs: Math.round((request.startedAt - request.queuedAt) * 100) / 100,
        outputBytes: message.dataUrl ? Buffer.byteLength(message.dataUrl, 'utf8') : 0,
        queueDepth: pending.size,
      });
      request.resolve(message.error ? null : message.dataUrl ?? null);
    });
    worker.on('error', () => {
      for (const [id, request] of pending) {
        clearTimeout(request.timeout);
        pending.delete(id);
        request.resolve(null);
      }
      worker = null;
    });

    return worker;
  }

  return {
    render(drawing: DrawingState): Promise<string | null> {
      if (pending.size >= maxQueueDepth) {
        logDrawingTransportMetric('drawing.snapshot.queue_rejected', { queueDepth: pending.size });
        return Promise.resolve(null);
      }

      const id = nextId;
      nextId += 1;
      const queuedAt = performance.now();
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          pending.delete(id);
          logDrawingTransportMetric('drawing.snapshot.timeout', { queueDepth: pending.size, timeoutMs });
          resolve(null);
        }, timeoutMs);
        timeout.unref();
        pending.set(id, { startedAt: performance.now(), queuedAt, resolve, timeout });
        getWorker().postMessage({ id, drawing });
      });
    },
  };
}

export function renderSnapshotDataUrl(drawing: DrawingState): string {
  const startedAt = performance.now();
  const raster = rasterizeDrawingState(drawing, {
    outputWidth: DRAWING_SNAPSHOT_WIDTH,
    outputHeight: DRAWING_SNAPSHOT_HEIGHT,
    backgroundColor: DRAWING_BACKGROUND_COLOR,
  });
  const dataUrl = encodePngDataUrl(raster.pixels, raster.width, raster.height);

  logDrawingTransportMetric('drawing.snapshot.rendered', {
    durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    outputBytes: Buffer.byteLength(dataUrl, 'utf8'),
    operationCount: drawing.operations.length,
    activeStrokeCount: drawing.activeStrokes.length,
    undoneOperationCount: drawing.undoneOperations.length,
  });

  return dataUrl;
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

