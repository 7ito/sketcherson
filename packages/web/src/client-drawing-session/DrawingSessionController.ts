import type { ApiResult } from '@7ito/sketcherson-common/room';
import { DRAWING_MAX_EXTEND_POINTS, type DrawingPoint } from '@7ito/sketcherson-common/drawing';
import {
  getBaseExtendFlushIntervalMs,
  getScheduledExtendFlushIntervalMs,
  updateExtendFlushIntervalFromAck,
} from '../lib/drawingBackpressure';

export interface ExtendBatchSuccess {
  revision: number;
}

export interface DrawingSessionExtendBatch {
  batchId: number;
  strokeId: string;
  points: DrawingPoint[];
  pointsCount: number;
  inFlightCount: number;
  sentAtMs: number;
}

export interface DrawingSessionExtendAck extends DrawingSessionExtendBatch {
  result: ApiResult<ExtendBatchSuccess>;
  durationMs: number;
}

export interface DrawingSessionControllerOptions {
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(timerId: number): void;
  now(): number;
  isStrokeActive(strokeId: string): boolean;
  sendExtendBatch(batch: DrawingSessionExtendBatch): Promise<ApiResult<ExtendBatchSuccess>>;
  onExtendBatchAcknowledged?(ack: DrawingSessionExtendAck): void;
}

export interface ActiveStrokeState {
  strokeId: string;
  lastPoint: DrawingPoint;
}

export interface ExtendActiveStrokeResult {
  strokeId: string;
  previousPoint: DrawingPoint;
  point: DrawingPoint;
}

const MIN_EXTEND_POINT_DISTANCE_SQUARED = 0.25;

export class DrawingSessionController {
  private activeStroke: ActiveStrokeState | null = null;
  private pointerActive = false;
  private pendingExtendPoints: DrawingPoint[] = [];
  private flushTimer: number | null = null;
  private extendBatchId = 0;
  private inFlightExtendBatchCount = 0;
  private extendFlushIntervalMs = getBaseExtendFlushIntervalMs();

  constructor(private readonly options: DrawingSessionControllerOptions) {}

  beginStroke(strokeId: string, point: DrawingPoint): ActiveStrokeState {
    this.pointerActive = true;
    this.activeStroke = { strokeId, lastPoint: point };
    return this.activeStroke;
  }

  extendActiveStroke(point: DrawingPoint): ExtendActiveStrokeResult | null {
    if (!this.pointerActive || !this.activeStroke) {
      return null;
    }

    const previousPoint = this.activeStroke.lastPoint;
    if (getPointDistanceSquared(previousPoint, point) < MIN_EXTEND_POINT_DISTANCE_SQUARED) {
      return null;
    }

    this.activeStroke.lastPoint = point;
    this.queueExtendPoint(this.activeStroke.strokeId, point);

    return {
      strokeId: this.activeStroke.strokeId,
      previousPoint,
      point,
    };
  }

  endActiveStroke(): string | null {
    if (!this.activeStroke) {
      this.pointerActive = false;
      return null;
    }

    const strokeId = this.activeStroke.strokeId;
    this.pointerActive = false;
    this.activeStroke = null;
    this.flushPendingExtend(strokeId);
    return strokeId;
  }

  abortActiveStroke(): void {
    this.pointerActive = false;
    this.activeStroke = null;
    this.resetPendingExtend();
  }

  isPointerActive(): boolean {
    return this.pointerActive;
  }

  getActiveStrokeId(): string | null {
    return this.activeStroke?.strokeId ?? null;
  }

  queueExtendPoint(strokeId: string, point: DrawingPoint): void {
    this.pendingExtendPoints.push(point);

    if (this.flushTimer !== null) {
      return;
    }

    const flushIntervalMs = getScheduledExtendFlushIntervalMs(
      this.extendFlushIntervalMs,
      this.inFlightExtendBatchCount,
    );

    this.flushTimer = this.options.setTimeout(() => {
      this.flushTimer = null;
      this.flushPendingExtend(strokeId);
    }, flushIntervalMs);
  }

  flushPendingExtend(strokeId: string | null | undefined): void {
    this.clearPendingExtendFlush();

    if (!strokeId || this.pendingExtendPoints.length === 0) {
      return;
    }

    const points = this.pendingExtendPoints;
    this.pendingExtendPoints = [];

    for (let index = 0; index < points.length; index += DRAWING_MAX_EXTEND_POINTS) {
      this.sendExtendPointBatch(strokeId, points.slice(index, index + DRAWING_MAX_EXTEND_POINTS));
    }
  }

  resetPendingExtend(): void {
    this.pendingExtendPoints = [];
    this.clearPendingExtendFlush();
  }

  dispose(): void {
    this.abortActiveStroke();
  }

  getPendingExtendPointCount(): number {
    return this.pendingExtendPoints.length;
  }

  private clearPendingExtendFlush(): void {
    if (this.flushTimer !== null) {
      this.options.clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private sendExtendPointBatch(strokeId: string, points: DrawingPoint[]): void {
    const batchId = this.extendBatchId + 1;
    this.extendBatchId = batchId;
    const sentAtMs = this.options.now();
    this.inFlightExtendBatchCount += 1;

    const batch: DrawingSessionExtendBatch = {
      batchId,
      strokeId,
      points,
      pointsCount: points.length,
      inFlightCount: this.inFlightExtendBatchCount,
      sentAtMs,
    };

    void this.options.sendExtendBatch(batch).then((result) => {
      const ackAtMs = this.options.now();
      this.inFlightExtendBatchCount = Math.max(0, this.inFlightExtendBatchCount - 1);
      this.extendFlushIntervalMs = updateExtendFlushIntervalFromAck({
        currentIntervalMs: this.extendFlushIntervalMs,
        inFlightCount: this.inFlightExtendBatchCount,
        ackDurationMs: ackAtMs - sentAtMs,
        ok: result.ok,
      });

      this.options.onExtendBatchAcknowledged?.({
        ...batch,
        result,
        durationMs: ackAtMs - sentAtMs,
        inFlightCount: this.inFlightExtendBatchCount,
      });

      if (!result.ok && this.options.isStrokeActive(strokeId)) {
        this.pendingExtendPoints = [...points, ...this.pendingExtendPoints];
      }
    });
  }
}

function getPointDistanceSquared(previous: DrawingPoint, next: DrawingPoint): number {
  const dx = next.x - previous.x;
  const dy = next.y - previous.y;
  return dx * dx + dy * dy;
}
