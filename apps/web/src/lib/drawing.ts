import { DRAWING_BACKGROUND_COLOR, type DrawingFillOperation, type DrawingOperation, type DrawingPoint, type DrawingState, type DrawingStrokeOperation } from '@sketcherson/common/drawing';
import {
  getIncrementalDrawingUpdate as getProtocolIncrementalDrawingUpdate,
  type DrawingIncrementalUpdate,
} from '@sketcherson/common/drawingProtocol';

interface DrawingRenderCache {
  renderCanvas: HTMLCanvasElement;
  previousDrawing: DrawingState | null;
}

export interface DrawingRenderStats {
  renderDurationMs: number;
  committedLayerUpdated: boolean;
  activeLayerUpdated: boolean;
  operationsCount: number;
  activeStrokePointCount: number;
}

const drawingRenderCache = new WeakMap<HTMLCanvasElement, DrawingRenderCache>();

export function renderDrawingStateToCanvas(canvas: HTMLCanvasElement | null, drawing: DrawingState | null): DrawingRenderStats | null {
  if (!canvas || !drawing) {
    return null;
  }

  const context = getCanvasContext(canvas);
  if (!context) {
    return null;
  }

  const cache = getOrCreateDrawingRenderCache(canvas, drawing.width, drawing.height);
  const previousDrawing = cache.previousDrawing;
  const incrementalUpdate = getIncrementalDrawingUpdate(previousDrawing, drawing);

  const startedAt = now();

  if (incrementalUpdate.type === 'full-rerender') {
    rerenderDrawingSnapshot(cache.renderCanvas, drawing);
  } else if (incrementalUpdate.type !== 'noop') {
    applyIncrementalDrawingUpdate(cache.renderCanvas, drawing, incrementalUpdate);
  }

  composeDrawingLayers(canvas, context, cache.renderCanvas);
  cache.previousDrawing = drawing;

  return {
    renderDurationMs: now() - startedAt,
    committedLayerUpdated:
      incrementalUpdate.type === 'full-rerender' || incrementalUpdate.type === 'appendOperation',
    activeLayerUpdated:
      incrementalUpdate.type === 'full-rerender' ||
      incrementalUpdate.type === 'beginStroke' ||
      incrementalUpdate.type === 'extendStroke',
    operationsCount: drawing.operations.length,
    activeStrokePointCount: drawing.activeStrokes.reduce((pointCount, stroke) => pointCount + stroke.points.length, 0),
  };
}

function getDevicePixelRatio(): number {
  return typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
}

function getOrCreateDrawingRenderCache(canvas: HTMLCanvasElement, width: number, height: number): DrawingRenderCache {
  const dpr = getDevicePixelRatio();
  const deviceWidth = Math.round(width * dpr);
  const deviceHeight = Math.round(height * dpr);
  const cached = drawingRenderCache.get(canvas);

  if (cached && cached.renderCanvas.width === deviceWidth && cached.renderCanvas.height === deviceHeight) {
    return cached;
  }

  const renderCanvas = createScratchCanvas(deviceWidth, deviceHeight);

  if (!renderCanvas) {
    return {
      renderCanvas: canvas,
      previousDrawing: null,
    };
  }

  const nextCache: DrawingRenderCache = {
    renderCanvas,
    previousDrawing: null,
  };

  drawingRenderCache.set(canvas, nextCache);
  return nextCache;
}

function rerenderDrawingSnapshot(targetCanvas: HTMLCanvasElement, drawing: DrawingState): void {
  const context = getCanvasContext(targetCanvas);
  if (!context) {
    return;
  }

  const dpr = getDevicePixelRatio();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, targetCanvas.width, targetCanvas.height);

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.fillStyle = DRAWING_BACKGROUND_COLOR;
  context.fillRect(0, 0, drawing.width, drawing.height);

  for (const operation of drawing.operations) {
    applyDrawingOperationToCanvasContext(context, targetCanvas, drawing, operation, dpr);
  }

  for (const activeStroke of drawing.activeStrokes) {
    renderStrokeToCanvasContext(context, activeStroke);
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
}

function applyIncrementalDrawingUpdate(
  targetCanvas: HTMLCanvasElement,
  drawing: DrawingState,
  update: Exclude<DrawingIncrementalUpdate, { type: 'full-rerender' } | { type: 'noop' }>,
): void {
  const context = getCanvasContext(targetCanvas);
  if (!context) {
    return;
  }

  const dpr = getDevicePixelRatio();
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (update.type === 'appendOperation') {
    applyDrawingOperationToCanvasContext(context, targetCanvas, drawing, update.operation, dpr);
  } else {
    renderStrokeToCanvasContext(context, update.stroke);
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
}

function applyDrawingOperationToCanvasContext(
  context: CanvasRenderingContext2D,
  targetCanvas: HTMLCanvasElement,
  drawing: DrawingState,
  operation: DrawingOperation,
  dpr: number,
): void {
  if (operation.kind === 'clear') {
    context.fillStyle = DRAWING_BACKGROUND_COLOR;
    context.fillRect(0, 0, drawing.width, drawing.height);
    return;
  }

  if (operation.kind === 'fill') {
    canvasFloodFill(context, targetCanvas.width, targetCanvas.height, operation, dpr);
    return;
  }

  renderStrokeToCanvasContext(context, operation);
}

function composeDrawingLayers(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  renderCanvas: HTMLCanvasElement,
): void {
  const deviceWidth = renderCanvas.width;
  const deviceHeight = renderCanvas.height;

  if (canvas.width !== deviceWidth || canvas.height !== deviceHeight) {
    canvas.width = deviceWidth;
    canvas.height = deviceHeight;
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, deviceWidth, deviceHeight);
  context.drawImage(renderCanvas, 0, 0);
}

export function getIncrementalDrawingUpdate(
  previousDrawing: DrawingState | null,
  nextDrawing: DrawingState,
): DrawingIncrementalUpdate {
  return getProtocolIncrementalDrawingUpdate(previousDrawing, nextDrawing);
}

function getCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  try {
    return canvas.getContext('2d');
  } catch {
    return null;
  }
}

function createScratchCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function canvasFloodFill(
  context: CanvasRenderingContext2D,
  deviceWidth: number,
  deviceHeight: number,
  operation: DrawingFillOperation,
  dpr: number,
): void {
  const savedTransform = context.getTransform();
  context.setTransform(1, 0, 0, 1, 0, 0);

  const imageData = context.getImageData(0, 0, deviceWidth, deviceHeight);
  const pixels = imageData.data;
  const x = Math.round(operation.point.x * dpr);
  const y = Math.round(operation.point.y * dpr);

  if (x < 0 || x >= deviceWidth || y < 0 || y >= deviceHeight) {
    context.setTransform(savedTransform);
    return;
  }

  const fillColor = hexToRgba(operation.color);
  const targetIndex = (y * deviceWidth + x) * 4;
  const targetR = pixels[targetIndex] as number;
  const targetG = pixels[targetIndex + 1] as number;
  const targetB = pixels[targetIndex + 2] as number;
  const targetA = pixels[targetIndex + 3] as number;

  if (targetR === fillColor.r && targetG === fillColor.g && targetB === fillColor.b && targetA === fillColor.a) {
    context.setTransform(savedTransform);
    return;
  }

  const stack: number[] = [x, y];
  while (stack.length > 0) {
    const cy = stack.pop() as number;
    const cx = stack.pop() as number;
    if (cx < 0 || cx >= deviceWidth || cy < 0 || cy >= deviceHeight) continue;

    const idx = (cy * deviceWidth + cx) * 4;
    if (pixels[idx] !== targetR || pixels[idx + 1] !== targetG || pixels[idx + 2] !== targetB || pixels[idx + 3] !== targetA) continue;

    pixels[idx] = fillColor.r;
    pixels[idx + 1] = fillColor.g;
    pixels[idx + 2] = fillColor.b;
    pixels[idx + 3] = fillColor.a;
    stack.push(cx + 1, cy, cx - 1, cy, cx, cy + 1, cx, cy - 1);
  }

  context.putImageData(imageData, 0, 0);
  context.setTransform(savedTransform);
}

function hexToRgba(value: string): { r: number; g: number; b: number; a: number } {
  const normalized = value.replace('#', '');
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
    a: 255,
  };
}

function renderStrokeToCanvasContext(context: CanvasRenderingContext2D, stroke: DrawingStrokeOperation): void {
  const drawColor = stroke.tool === 'eraser' ? DRAWING_BACKGROUND_COLOR : stroke.color;

  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = drawColor;
  context.fillStyle = drawColor;
  context.lineWidth = Math.max(1, stroke.size);

  if (stroke.points.length === 1) {
    const point = stroke.points[0] as DrawingPoint;
    drawStrokeDot(context, point, stroke.size / 2);
    context.restore();
    return;
  }

  const firstPoint = stroke.points[0];
  if (firstPoint) {
    context.beginPath();
    context.moveTo(firstPoint.x, firstPoint.y);

    for (let index = 1; index < stroke.points.length; index += 1) {
      const point = stroke.points[index] as DrawingPoint;
      context.lineTo(point.x, point.y);
    }

    context.stroke();
  }

  context.restore();
}

function drawStrokeDot(context: CanvasRenderingContext2D, point: DrawingPoint, radius: number): void {
  context.beginPath();
  context.arc(point.x, point.y, Math.max(1, radius), 0, Math.PI * 2);
  context.fill();
}

function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }

  return Date.now();
}
