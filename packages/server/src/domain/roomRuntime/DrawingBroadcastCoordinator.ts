import { DRAWING_MAX_EXTEND_POINTS, type DrawingActionAppliedEvent, type DrawingPoint } from '@7ito/sketcherson-common/drawing';
import { estimateSerializedPayloadBytes, logDrawingTransportMetric } from '../../drawingMetrics';

export interface DrawingBroadcastSocket {
  id: string;
  connected?: boolean;
  conn?: {
    transport?: {
      writable?: boolean;
    };
  };
  emit(event: string, payload: DrawingActionAppliedEvent, ...args: any[]): boolean;
}

export interface DrawingBroadcastNamespace {
  in(roomCode: string): {
    fetchSockets(): Promise<DrawingBroadcastSocket[]>;
  };
}

interface PendingCoalescedEvent {
  eventName: string;
  payload: DrawingActionAppliedEvent;
  coalescedCount: number;
}

const MAX_PENDING_COALESCED_EXTEND_POINTS = DRAWING_MAX_EXTEND_POINTS * 4;

export class DrawingBroadcastCoordinator {
  private readonly pendingExtendEvents = new Map<string, PendingCoalescedEvent>();
  private readonly pendingFlushTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly inFlightExtendEvents = new Map<string, number>();
  private readonly ackTimeoutTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private nextInFlightToken = 1;

  public constructor(private readonly namespace: DrawingBroadcastNamespace) {}

  public async broadcast(input: {
    roomCode: string;
    eventName: string;
    event: DrawingActionAppliedEvent;
    target: 'match' | 'lobby';
  }): Promise<void> {
    const sockets = await this.namespace.in(input.roomCode).fetchSockets();

    for (const socket of sockets) {
      if (input.event.action.type !== 'extendStroke') {
        if (this.canSendLiveExtend(socket)) {
          this.flushPending(socket, input.roomCode, input.target);
        } else {
          this.dropPending(socket.id, input.roomCode, input.target);
        }
        socket.emit(input.eventName, input.event);
        continue;
      }

      if (this.canSendLiveExtend(socket)) {
        if (this.pendingExtendEvents.has(socket.id)) {
          this.queueLatestExtend(socket, input.eventName, input.event, input.roomCode, input.target, { scheduleFlush: false });
          this.flushPending(socket, input.roomCode, input.target);
        } else {
          this.emitLiveExtend(socket, input.eventName, input.event, input.roomCode, input.target);
        }
        continue;
      }

      this.queueLatestExtend(socket, input.eventName, input.event, input.roomCode, input.target);
    }
  }

  public flushAll(roomCode: string, target: 'match' | 'lobby'): void {
    for (const [socketId, pending] of [...this.pendingExtendEvents]) {
      this.pendingExtendEvents.delete(socketId);
      this.clearPendingTimer(socketId);
      logCoalesced(roomCode, target, pending);
    }
  }

  public clearSocket(socketId: string): void {
    this.pendingExtendEvents.delete(socketId);
    this.clearPendingTimer(socketId);
    this.inFlightExtendEvents.delete(socketId);
    this.clearAckTimeout(socketId);
  }

  private queueLatestExtend(
    socket: DrawingBroadcastSocket,
    eventName: string,
    event: DrawingActionAppliedEvent,
    roomCode: string,
    target: 'match' | 'lobby',
    options?: { scheduleFlush?: boolean },
  ): void {
    const existing = this.pendingExtendEvents.get(socket.id);
    const merged = mergePendingExtendPayload(existing?.payload, event);
    const payload = merged.payload;
    this.pendingExtendEvents.set(socket.id, {
      eventName,
      payload,
      coalescedCount: (existing?.coalescedCount ?? 0) + 1,
    });

    const coalescedCount = (existing?.coalescedCount ?? 0) + 1;

    logDrawingTransportMetric('drawing.extend.coalesced', {
      socketId: socket.id,
      roomCode,
      target,
      revision: payload.revision,
      coalescedCount,
      mergedLiveUpdateCount: Math.max(0, coalescedCount - 1),
      eventBytes: estimateSerializedPayloadBytes(payload),
    });

    if (merged.droppedOverCap) {
      logDrawingTransportMetric('drawing.extend.coalesced_dropped_over_cap', {
        socketId: socket.id,
        roomCode,
        target,
        revision: payload.revision,
        maxPendingPoints: MAX_PENDING_COALESCED_EXTEND_POINTS,
        eventBytes: estimateSerializedPayloadBytes(payload),
      });
    }

    if (options?.scheduleFlush ?? true) {
      this.queuePendingFlush(socket, roomCode, target);
    }
  }

  private flushPending(socket: DrawingBroadcastSocket, roomCode: string, target: 'match' | 'lobby'): void {
    const pending = this.pendingExtendEvents.get(socket.id);
    if (!pending) {
      return;
    }

    if (!this.canSendLiveExtend(socket)) {
      return;
    }

    this.pendingExtendEvents.delete(socket.id);
    this.clearPendingTimer(socket.id);
    this.emitLiveExtend(socket, pending.eventName, pending.payload, roomCode, target);
    logCoalesced(roomCode, target, pending);
  }

  private dropPending(socketId: string, roomCode: string, target: 'match' | 'lobby'): void {
    const pending = this.pendingExtendEvents.get(socketId);
    if (!pending) {
      return;
    }

    this.pendingExtendEvents.delete(socketId);
    this.clearPendingTimer(socketId);
    logCoalesced(roomCode, target, pending);
  }

  private emitLiveExtend(
    socket: DrawingBroadcastSocket,
    eventName: string,
    event: DrawingActionAppliedEvent,
    roomCode: string,
    target: 'match' | 'lobby',
  ): void {
    const token = this.nextInFlightToken;
    this.nextInFlightToken += 1;
    this.inFlightExtendEvents.set(socket.id, token);
    this.clearAckTimeout(socket.id);

    let acknowledged = false;
    const complete = () => {
      if (acknowledged) {
        return;
      }

      acknowledged = true;
      if (this.inFlightExtendEvents.get(socket.id) !== token) {
        return;
      }

      this.inFlightExtendEvents.delete(socket.id);
      this.clearAckTimeout(socket.id);

      if (this.pendingExtendEvents.has(socket.id)) {
        this.clearPendingTimer(socket.id);
        this.queuePendingFlush(socket, roomCode, target, 0);
      }
    };

    socket.emit(eventName, event, complete);
    this.ackTimeoutTimers.set(socket.id, setTimeout(complete, 100));
  }

  private queuePendingFlush(socket: DrawingBroadcastSocket, roomCode: string, target: 'match' | 'lobby', delayMs = 100): void {
    if (this.pendingFlushTimers.has(socket.id)) {
      return;
    }

    this.pendingFlushTimers.set(socket.id, setTimeout(() => {
      this.pendingFlushTimers.delete(socket.id);
      if (this.canSendLiveExtend(socket)) {
        this.flushPending(socket, roomCode, target);
      } else if (!this.isConnected(socket)) {
        this.dropPending(socket.id, roomCode, target);
      } else if (this.pendingExtendEvents.has(socket.id)) {
        this.queuePendingFlush(socket, roomCode, target);
      }
    }, delayMs));
  }

  private clearPendingTimer(socketId: string): void {
    const timer = this.pendingFlushTimers.get(socketId);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    this.pendingFlushTimers.delete(socketId);
  }

  private clearAckTimeout(socketId: string): void {
    const timer = this.ackTimeoutTimers.get(socketId);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    this.ackTimeoutTimers.delete(socketId);
  }

  private canSendLiveExtend(socket: DrawingBroadcastSocket): boolean {
    return this.isWritable(socket) && !this.inFlightExtendEvents.has(socket.id);
  }

  private isWritable(socket: DrawingBroadcastSocket): boolean {
    return this.isConnected(socket) && socket.conn?.transport?.writable !== false;
  }

  private isConnected(socket: DrawingBroadcastSocket): boolean {
    return socket.connected !== false;
  }
}

function mergePendingExtendPayload(
  previous: DrawingActionAppliedEvent | undefined,
  next: DrawingActionAppliedEvent,
): { payload: DrawingActionAppliedEvent; droppedOverCap: boolean } {
  if (
    !previous ||
    previous.action.type !== 'extendStroke' ||
    next.action.type !== 'extendStroke' ||
    previous.action.strokeId !== next.action.strokeId
  ) {
    return { payload: next, droppedOverCap: false };
  }

  const previousPoints = getExtendActionPoints(previous.action);
  const nextPoints = getExtendActionPoints(next.action);
  if (!previousPoints || !nextPoints) {
    return { payload: next, droppedOverCap: false };
  }

  const mergedPoints = mergeExtendPoints(previousPoints, nextPoints);
  if (mergedPoints.length > MAX_PENDING_COALESCED_EXTEND_POINTS) {
    return { payload: next, droppedOverCap: true };
  }

  return {
    payload: {
      ...next,
      action: {
        type: 'extendStroke',
        strokeId: next.action.strokeId,
        points: mergedPoints,
      },
    },
    droppedOverCap: false,
  };
}

function getExtendActionPoints(action: Extract<DrawingActionAppliedEvent['action'], { type: 'extendStroke' }>): DrawingPoint[] | null {
  if (action.point && action.points) {
    return null;
  }

  if (action.point) {
    return [action.point];
  }

  if (!action.points || action.points.length === 0) {
    return null;
  }

  return action.points;
}

function mergeExtendPoints(previous: DrawingPoint[], next: DrawingPoint[]): DrawingPoint[] {
  const merged = previous.map((point) => ({ ...point }));
  for (const point of next) {
    const lastPoint = merged.at(-1);
    if (lastPoint && lastPoint.x === point.x && lastPoint.y === point.y) {
      continue;
    }

    merged.push({ ...point });
  }

  return merged;
}

function logCoalesced(roomCode: string, target: 'match' | 'lobby', pending: PendingCoalescedEvent): void {
  logDrawingTransportMetric('drawing.extend.coalesced_flushed', {
    roomCode,
    target,
    revision: pending.payload.revision,
    coalescedCount: pending.coalescedCount,
    mergedLiveUpdateCount: Math.max(0, pending.coalescedCount - 1),
    eventBytes: estimateSerializedPayloadBytes(pending.payload),
  });
}
