import { DRAWING_BACKGROUND_COLOR, type DrawingPoint, type DrawingState, type DrawingTool } from '@sketcherson/common/drawing';

export interface OptimisticStroke {
  id: string;
  tool: Exclude<DrawingTool, 'fill'>;
  color: string;
  size: number;
  points: DrawingPoint[];
}

export function createStrokeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `stroke-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function renderOptimisticStrokeOverlay(
  canvas: HTMLCanvasElement | null,
  drawing: DrawingState | null,
  stroke: OptimisticStroke | null,
  startIndex?: number,
): void {
  if (!canvas || !drawing || !stroke) {
    return;
  }

  let context: CanvasRenderingContext2D | null = null;

  try {
    context = canvas.getContext('2d');
  } catch {
    context = null;
  }

  if (!context) {
    return;
  }

  const serverPointCount = drawing.activeStrokes.find((activeStroke) => activeStroke.id === stroke.id)?.points.length ?? 0;
  const firstUnsyncedPointIndex = Math.max(serverPointCount, startIndex ?? 0);

  if (firstUnsyncedPointIndex >= stroke.points.length) {
    return;
  }

  const scaleX = canvas.width / drawing.width;
  const scaleY = canvas.height / drawing.height;
  const scaledLineWidth = Math.max(1, stroke.size * ((scaleX + scaleY) / 2));
  const drawColor = stroke.tool === 'eraser' ? DRAWING_BACKGROUND_COLOR : stroke.color;

  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = drawColor;
  context.fillStyle = drawColor;
  context.lineWidth = scaledLineWidth;

  if (stroke.points.length === 1) {
    drawStrokeDot(context, stroke.points[0] as DrawingPoint, scaledLineWidth / 2, scaleX, scaleY);
    context.restore();
    return;
  }

  const rangeStart = Math.max(0, firstUnsyncedPointIndex);
  const previousPoint = rangeStart > 0 ? stroke.points[rangeStart - 1] : null;
  const currentPoint = stroke.points[rangeStart];

  if (previousPoint && currentPoint) {
    context.beginPath();
    context.moveTo(previousPoint.x * scaleX, previousPoint.y * scaleY);
    context.lineTo(currentPoint.x * scaleX, currentPoint.y * scaleY);

    for (let index = rangeStart + 1; index < stroke.points.length; index += 1) {
      const point = stroke.points[index] as DrawingPoint;
      context.lineTo(point.x * scaleX, point.y * scaleY);
    }

    context.stroke();
    context.restore();
    return;
  }

  for (let index = rangeStart; index < stroke.points.length; index += 1) {
    drawStrokeDot(context, stroke.points[index] as DrawingPoint, scaledLineWidth / 2, scaleX, scaleY);
  }

  context.restore();
}

function drawStrokeDot(
  context: CanvasRenderingContext2D,
  point: DrawingPoint,
  radius: number,
  scaleX: number,
  scaleY: number,
): void {
  context.beginPath();
  context.arc(point.x * scaleX, point.y * scaleY, Math.max(1, radius), 0, Math.PI * 2);
  context.fill();
}
