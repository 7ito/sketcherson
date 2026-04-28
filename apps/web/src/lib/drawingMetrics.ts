import { DRAWING_METRICS_STORAGE_KEY } from './gameKeys';

export type DrawingMetricsTarget = 'match' | 'lobby';
export type DrawingMetricsRole = 'drawer' | 'spectator';

interface PendingRemoteDrawingEvent {
  receivedAtMs: number;
  payloadBytes: number;
}

interface AggregateMetric {
  count: number;
  total: number;
  max: number;
}

const pendingRemoteDrawingEvents = new Map<string, PendingRemoteDrawingEvent>();
const aggregateMetrics = new Map<string, AggregateMetric>();

declare global {
  interface Window {
    __SKETCHROYALE_DRAWING_METRICS__?: boolean;
  }
}

export function estimateSerializedPayloadBytes(payload: unknown): number {
  try {
    const serialized = JSON.stringify(payload);
    if (!serialized) {
      return 0;
    }

    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(serialized).length;
    }

    return serialized.length;
  } catch {
    return 0;
  }
}

export function recordDrawerExtendBatchSent(fields: {
  roomCode?: string;
  target: DrawingMetricsTarget;
  batchId: number;
  strokeId: string;
  pointsCount: number;
  inFlightCount: number;
}): void {
  if (!isDrawingMetricsEnabled()) {
    return;
  }

  logDrawingMetric('drawer.extend_batch_sent', fields);
  recordAggregateMetric('drawer.extend_batch.points', fields.pointsCount, 'points');
  recordAggregateMetric('drawer.extend_batch.in_flight', fields.inFlightCount, 'count');
}

export function recordDrawerExtendBatchAcknowledged(fields: {
  roomCode?: string;
  target: DrawingMetricsTarget;
  batchId: number;
  strokeId: string;
  pointsCount: number;
  inFlightCount: number;
  ackBytes: number;
  ok: boolean;
  durationMs: number;
}): void {
  if (!isDrawingMetricsEnabled()) {
    return;
  }

  logDrawingMetric('drawer.extend_batch_ack', fields);
  recordAggregateMetric('drawer.extend_batch.ack_ms', fields.durationMs, 'ms');
  recordAggregateMetric('drawer.extend_batch.ack_bytes', fields.ackBytes, 'bytes');
}

export function recordDrawingAck(fields: {
  roomCode?: string;
  target: DrawingMetricsTarget;
  actionType: string;
  ok: boolean;
  ackBytes: number;
  revision?: number;
}): void {
  if (!isDrawingMetricsEnabled()) {
    return;
  }

  logDrawingMetric('drawing.ack', fields);
  recordAggregateMetric(`drawing.ack_bytes.${fields.target}.${fields.actionType}`, fields.ackBytes, 'bytes');
}

export function recordRemoteDrawingEventReceived(fields: {
  roomCode: string;
  target: DrawingMetricsTarget;
  revision: number;
  payloadBytes: number;
}): void {
  if (!isDrawingMetricsEnabled()) {
    return;
  }

  pendingRemoteDrawingEvents.set(createPendingEventKey(fields.roomCode, fields.target, fields.revision), {
    receivedAtMs: now(),
    payloadBytes: fields.payloadBytes,
  });

  logDrawingMetric('drawing.event_received', fields);
  recordAggregateMetric(`drawing.event_bytes.${fields.target}`, fields.payloadBytes, 'bytes');
}

export function recordDrawingPaint(fields: {
  roomCode?: string;
  target: DrawingMetricsTarget;
  role: DrawingMetricsRole;
  revision: number;
  renderDurationMs: number;
  committedLayerUpdated: boolean;
  activeLayerUpdated: boolean;
  operationsCount: number;
  activeStrokePointCount: number;
}): void {
  if (!isDrawingMetricsEnabled()) {
    return;
  }

  logDrawingMetric('drawing.paint', fields);
  recordAggregateMetric(`drawing.render_ms.${fields.target}.${fields.role}`, fields.renderDurationMs, 'ms');

  if (!fields.roomCode) {
    return;
  }

  const pendingEventKey = createPendingEventKey(fields.roomCode, fields.target, fields.revision);
  const pendingEvent = pendingRemoteDrawingEvents.get(pendingEventKey);
  if (!pendingEvent) {
    return;
  }

  pendingRemoteDrawingEvents.delete(pendingEventKey);
  const eventToPaintMs = now() - pendingEvent.receivedAtMs;

  logDrawingMetric('drawing.event_to_paint', {
    roomCode: fields.roomCode,
    target: fields.target,
    role: fields.role,
    revision: fields.revision,
    payloadBytes: pendingEvent.payloadBytes,
    eventToPaintMs,
  });
  recordAggregateMetric(`drawing.event_to_paint_ms.${fields.target}.${fields.role}`, eventToPaintMs, 'ms');
}

export function recordDrawingResync(fields: {
  roomCode: string;
  target: DrawingMetricsTarget;
  revision: number;
  reason: 'revision_mismatch';
}): void {
  if (!isDrawingMetricsEnabled()) {
    return;
  }

  logDrawingMetric('drawing.resync_requested', fields);
}

function isDrawingMetricsEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  if (window.__SKETCHROYALE_DRAWING_METRICS__ === true) {
    return true;
  }

  try {
    return window.localStorage.getItem(DRAWING_METRICS_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function recordAggregateMetric(name: string, value: number, unit: string): void {
  const metric = aggregateMetrics.get(name) ?? {
    count: 0,
    total: 0,
    max: 0,
  };

  metric.count += 1;
  metric.total += value;
  metric.max = Math.max(metric.max, value);
  aggregateMetrics.set(name, metric);

  if (metric.count === 1 || metric.count % 25 === 0) {
    logDrawingMetric('drawing.metric_summary', {
      metric: name,
      unit,
      count: metric.count,
      avg: Number((metric.total / metric.count).toFixed(2)),
      max: Number(metric.max.toFixed(2)),
    });
  }
}

function createPendingEventKey(roomCode: string, target: DrawingMetricsTarget, revision: number): string {
  return `${roomCode}:${target}:${revision}`;
}

function logDrawingMetric(event: string, fields: Record<string, unknown>): void {
  console.debug('[drawing-metrics]', event, fields);
}

function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }

  return Date.now();
}
