import type { DrawingActionAppliedEvent } from '@7ito/sketcherson-common/drawing';
import { describe, expect, it, vi } from 'vitest';
import { DrawingBroadcastCoordinator, type DrawingBroadcastNamespace, type DrawingBroadcastSocket } from '../src/domain/roomRuntime/DrawingBroadcastCoordinator';

function extendEvent(revision: number): DrawingActionAppliedEvent {
  return {
    code: 'ABCD',
    revision,
    action: { type: 'extendStroke', strokeId: 'stroke-1', points: [{ x: revision, y: revision }] },
  };
}

function reliableEvent(revision: number): DrawingActionAppliedEvent {
  return {
    code: 'ABCD',
    revision,
    action: { type: 'endStroke', strokeId: 'stroke-1' },
  };
}

function createSocket(id: string, writable: boolean): DrawingBroadcastSocket & { emitted: DrawingActionAppliedEvent[] } {
  const emitted: DrawingActionAppliedEvent[] = [];
  return {
    id,
    connected: true,
    conn: { transport: { writable } },
    emitted,
    emit: vi.fn((_eventName: string, payload: DrawingActionAppliedEvent) => {
      emitted.push(payload);
      return true;
    }),
  };
}

function createNamespace(sockets: DrawingBroadcastSocket[]): DrawingBroadcastNamespace {
  return {
    in: () => ({
      fetchSockets: async () => sockets,
    }),
  };
}

describe('DrawingBroadcastCoordinator', () => {
  it('sends live stroke extensions immediately to writable spectators', async () => {
    const fastSocket = createSocket('fast', true);
    const coordinator = new DrawingBroadcastCoordinator(createNamespace([fastSocket]));

    await coordinator.broadcast({ roomCode: 'ABCD', eventName: 'room:drawingActionApplied', event: extendEvent(1), target: 'match' });
    await coordinator.broadcast({ roomCode: 'ABCD', eventName: 'room:drawingActionApplied', event: extendEvent(2), target: 'match' });

    expect(fastSocket.emitted.map((event) => event.revision)).toEqual([1, 2]);
  });

  it('coalesces live stroke extensions for backlogged spectators and flushes the latest before reliable actions', async () => {
    const slowSocket = createSocket('slow', false);
    const coordinator = new DrawingBroadcastCoordinator(createNamespace([slowSocket]));

    await coordinator.broadcast({ roomCode: 'ABCD', eventName: 'room:drawingActionApplied', event: extendEvent(1), target: 'match' });
    await coordinator.broadcast({ roomCode: 'ABCD', eventName: 'room:drawingActionApplied', event: extendEvent(2), target: 'match' });
    slowSocket.conn!.transport!.writable = true;
    await coordinator.broadcast({ roomCode: 'ABCD', eventName: 'room:drawingActionApplied', event: reliableEvent(3), target: 'match' });

    expect(slowSocket.emitted.map((event) => event.revision)).toEqual([2, 3]);
    expect(slowSocket.emitted[0]?.action.type).toBe('extendStroke');
    expect(slowSocket.emitted[1]?.action.type).toBe('endStroke');
  });

  it('keeps reliable drawing actions reliable for backlogged spectators', async () => {
    const slowSocket = createSocket('slow', false);
    const coordinator = new DrawingBroadcastCoordinator(createNamespace([slowSocket]));

    await coordinator.broadcast({ roomCode: 'ABCD', eventName: 'room:drawingActionApplied', event: reliableEvent(1), target: 'match' });
    await coordinator.broadcast({ roomCode: 'ABCD', eventName: 'room:drawingActionApplied', event: reliableEvent(2), target: 'match' });

    expect(slowSocket.emitted.map((event) => event.revision)).toEqual([1, 2]);
  });
});
