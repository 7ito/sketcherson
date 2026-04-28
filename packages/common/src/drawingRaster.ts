export interface RasterDrawingPoint {
  x: number;
  y: number;
}

export interface RasterDrawingStrokeOperation {
  kind: 'stroke';
  tool: 'pen' | 'eraser' | 'fill';
  color: string;
  size: number;
  points: RasterDrawingPoint[];
}

export interface RasterDrawingClearOperation {
  kind: 'clear';
}

export interface RasterDrawingFillOperation {
  kind: 'fill';
  color: string;
  point: RasterDrawingPoint;
}

export type RasterDrawingOperation = RasterDrawingStrokeOperation | RasterDrawingClearOperation | RasterDrawingFillOperation;

export interface RasterizableDrawingState {
  width: number;
  height: number;
  operations: RasterDrawingOperation[];
  activeStrokes: RasterDrawingStrokeOperation[];
}

export interface RasterizeDrawingOptions {
  outputWidth?: number;
  outputHeight?: number;
  backgroundColor?: string;
}

export interface RasterizedDrawing {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

const DEFAULT_BACKGROUND_COLOR = '#f7fbff';

export function rasterizeDrawingState(
  drawing: RasterizableDrawingState,
  options?: RasterizeDrawingOptions,
): RasterizedDrawing {
  const width = Math.max(1, Math.round(options?.outputWidth ?? drawing.width));
  const height = Math.max(1, Math.round(options?.outputHeight ?? drawing.height));
  const background = hexToRgba(options?.backgroundColor ?? DEFAULT_BACKGROUND_COLOR);
  const pixels = createPixelBuffer(width, height, background);

  for (const operation of drawing.operations) {
    rasterizeOperation(pixels, width, height, drawing.width, drawing.height, operation, background);
  }

  for (const activeStroke of drawing.activeStrokes) {
    rasterizeOperation(pixels, width, height, drawing.width, drawing.height, activeStroke, background);
  }

  return {
    width,
    height,
    pixels,
  };
}

function rasterizeOperation(
  pixels: Uint8ClampedArray,
  outputWidth: number,
  outputHeight: number,
  logicalWidth: number,
  logicalHeight: number,
  operation: RasterDrawingOperation,
  background: RgbaColor,
): void {
  if (operation.kind === 'clear') {
    clearPixelBuffer(pixels, background);
    return;
  }

  const scaleX = outputWidth / logicalWidth;
  const scaleY = outputHeight / logicalHeight;

  if (operation.kind === 'fill') {
    floodFillBuffer(
      pixels,
      outputWidth,
      outputHeight,
      {
        x: clamp(Math.round(operation.point.x * scaleX), 0, outputWidth - 1),
        y: clamp(Math.round(operation.point.y * scaleY), 0, outputHeight - 1),
      },
      hexToRgba(operation.color),
    );
    return;
  }

  const color = operation.tool === 'eraser' ? background : hexToRgba(operation.color);
  const brushRadius = Math.max(1, Math.round((operation.size * (scaleX + scaleY)) / 4));
  const scaledPoints = operation.points.map((point) => ({
    x: point.x * scaleX,
    y: point.y * scaleY,
  }));

  if (scaledPoints.length === 0) {
    return;
  }

  if (scaledPoints.length === 1) {
    stampCircle(pixels, outputWidth, outputHeight, scaledPoints[0] as RasterDrawingPoint, brushRadius, color);
    return;
  }

  for (let index = 1; index < scaledPoints.length; index += 1) {
    const start = scaledPoints[index - 1] as RasterDrawingPoint;
    const end = scaledPoints[index] as RasterDrawingPoint;
    drawSegment(pixels, outputWidth, outputHeight, start, end, brushRadius, color);
  }
}

function drawSegment(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  start: RasterDrawingPoint,
  end: RasterDrawingPoint,
  brushRadius: number,
  color: RgbaColor,
): void {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const stepCount = Math.max(1, Math.ceil(Math.max(Math.abs(deltaX), Math.abs(deltaY))));

  for (let step = 0; step <= stepCount; step += 1) {
    const ratio = step / stepCount;
    stampCircle(
      pixels,
      width,
      height,
      {
        x: start.x + deltaX * ratio,
        y: start.y + deltaY * ratio,
      },
      brushRadius,
      color,
    );
  }
}

function stampCircle(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  point: RasterDrawingPoint,
  radius: number,
  color: RgbaColor,
): void {
  const centerX = Math.round(point.x);
  const centerY = Math.round(point.y);
  const squaredRadius = radius * radius;

  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      if (offsetX * offsetX + offsetY * offsetY > squaredRadius) {
        continue;
      }

      setPixel(pixels, width, height, centerX + offsetX, centerY + offsetY, color);
    }
  }
}

function createPixelBuffer(width: number, height: number, background: RgbaColor): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  clearPixelBuffer(pixels, background);
  return pixels;
}

function clearPixelBuffer(pixels: Uint8ClampedArray, background: RgbaColor): void {
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = background.r;
    pixels[index + 1] = background.g;
    pixels[index + 2] = background.b;
    pixels[index + 3] = background.a;
  }
}

function setPixel(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  color: RgbaColor,
): void {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return;
  }

  const index = (y * width + x) * 4;
  pixels[index] = color.r;
  pixels[index + 1] = color.g;
  pixels[index + 2] = color.b;
  pixels[index + 3] = color.a;
}

function getPixel(pixels: Uint8ClampedArray, width: number, x: number, y: number): RgbaColor {
  const index = (y * width + x) * 4;
  return {
    r: pixels[index] as number,
    g: pixels[index + 1] as number,
    b: pixels[index + 2] as number,
    a: pixels[index + 3] as number,
  };
}

function colorsMatch(left: RgbaColor, right: RgbaColor): boolean {
  return left.r === right.r && left.g === right.g && left.b === right.b && left.a === right.a;
}

function floodFillBuffer(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  point: RasterDrawingPoint,
  fillColor: RgbaColor,
): void {
  const x = Math.round(point.x);
  const y = Math.round(point.y);
  if (x < 0 || x >= width || y < 0 || y >= height) {
    return;
  }

  const targetColor = getPixel(pixels, width, x, y);
  if (colorsMatch(targetColor, fillColor)) {
    return;
  }

  const stack: number[] = [x, y];
  while (stack.length > 0) {
    const cy = stack.pop() as number;
    const cx = stack.pop() as number;
    if (cx < 0 || cx >= width || cy < 0 || cy >= height) {
      continue;
    }

    if (!colorsMatch(getPixel(pixels, width, cx, cy), targetColor)) {
      continue;
    }

    setPixel(pixels, width, height, cx, cy, fillColor);
    stack.push(cx + 1, cy, cx - 1, cy, cx, cy + 1, cx, cy - 1);
  }
}

function hexToRgba(value: string): RgbaColor {
  const normalized = value.replace('#', '');
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
    a: 255,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
