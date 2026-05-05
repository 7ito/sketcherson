import type { DrawingActionAppliedEvent } from '@7ito/sketcherson-common/drawing';
import { estimateSerializedPayloadBytes, logDrawingTransportMetric } from '../../drawingMetrics';

export interface DrawingBroadcastSocket {
  id: string;
  connected?: boolean;
  conn?: {
    transport?: {
      writable?: boolean;
    };
  };
  emit(event: string, payload: DrawingActionAppliedEvent): boolean;
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

export class DrawingBroadcastCoordinator {
  private readonly pendingExtendEvents = new Map<string, PendingCoalescedEvent>();

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
        this.flushPending(socket, input.roomCode, input.target);
        socket.emit(input.eventName, input.event);
        continue;
      }

      if (this.isWritable(socket)) {
        this.flushPending(socket, input.roomCode, input.target);
        socket.emit(input.eventName, input.event);
        continue;
      }

      this.queueLatestExtend(socket, input.eventName, input.event, input.roomCode, input.target);
    }
  }

  public flushAll(roomCode: string, target: 'match' | 'lobby'): void {
    for (const [socketId, pending] of [...this.pendingExtendEvents]) {
      this.pendingExtendEvents.delete(socketId);
      logCoalesced(roomCode, target, pending);
    }
  }

  private queueLatestExtend(
    socket: DrawingBroadcastSocket,
    eventName: string,
    event: DrawingActionAppliedEvent,
    roomCode: string,
    target: 'match' | 'lobby',
  ): void {
    const existing = this.pendingExtendEvents.get(socket.id);
    this.pendingExtendEvents.set(socket.id, {
      eventName,
      payload: event,
      coalescedCount: (existing?.coalescedCount ?? 0) + 1,
    });

    logDrawingTransportMetric('drawing.extend.coalesced', {
      socketId: socket.id,
      roomCode,
      target,
      revision: event.revision,
      coalescedCount: (existing?.coalescedCount ?? 0) + 1,
      eventBytes: estimateSerializedPayloadBytes(event),
    });
  }

  private flushPending(socket: DrawingBroadcastSocket, roomCode: string, target: 'match' | 'lobby'): void {
    const pending = this.pendingExtendEvents.get(socket.id);
    if (!pending) {
      return;
    }

    this.pendingExtendEvents.delete(socket.id);
    socket.emit(pending.eventName, pending.payload);
    logCoalesced(roomCode, target, pending);
  }

  private isWritable(socket: DrawingBroadcastSocket): boolean {
    return socket.connected !== false && socket.conn?.transport?.writable !== false;
  }
}

function logCoalesced(roomCode: string, target: 'match' | 'lobby', pending: PendingCoalescedEvent): void {
  logDrawingTransportMetric('drawing.extend.coalesced_flushed', {
    roomCode,
    target,
    revision: pending.payload.revision,
    coalescedCount: pending.coalescedCount,
    eventBytes: estimateSerializedPayloadBytes(pending.payload),
  });
}
