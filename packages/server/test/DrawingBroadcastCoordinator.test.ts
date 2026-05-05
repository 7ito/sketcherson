import { DRAWING_MAX_EXTEND_POINTS, type DrawingActionAppliedEvent } from '@7ito/sketcherson-common/drawing';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

function largeExtendEvent(revision: number, offset: number): DrawingActionAppliedEvent {
  return {
    code: 'ABCD',
    revision,
    action: {
      type: 'extendStroke',
      strokeId: 'stroke-1',
      points: Array.from({ length: DRAWING_MAX_EXTEND_POINTS * 3 }, (_, index) => ({
        x: offset + index,
        y: offset + index,
      })),
    },
  };
}

function createSocket(id: string, writable: boolean, options?: { autoAck?: boolean }): DrawingBroadcastSocket & { emitted: DrawingActionAppliedEvent[]; pendingAcks: Array<() => void> } {
  const emitted: DrawingActionAppliedEvent[] = [];
  const pendingAcks: Array<() => void> = [];
  return {
    id,
    connected: true,
    conn: { transport: { writable } },
    emitted,
    pendingAcks,
    emit: vi.fn((_eventName: string, payload: DrawingActionAppliedEvent, ack?: () => void) => {
      emitted.push(payload);
      if (ack && options?.autoAck !== false) {
        ack();
      } else if (ack) {
        pendingAcks.push(ack);
      }
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
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends live stroke extensions immediately to writable spectators', async () => {
    const fastSocket = createSocket('fast', true);
    const coordinator = new DrawingBroadcastCoordinator(createNamespace([fastSocket]));

    await coordinator.broadcast({ roomCode: 'ABCD', eventName: 'room:drawingActionApplied', event: extendEvent(1), target: 'match' });
    await coordinator.broadcast({ roomCode: 'ABCD', eventName: 'room:drawingActionApplied', event: extendEvent(2), target: 'match' });

    expect(fastSocket.emitted.map((event) => event.revision)).toEqual([1, 2]);
  });

  it('coalesces writable spectators while a live extend ack remains outstanding', async () => {
    vi.useFakeTimers();
    const slowSocket = createSocket('slow', true, { autoAck: false });
    const coordinator = new DrawingBroadcastCoordinator(createNamespace([slowSocket]));

    await coordinator.broadcast({ roomCode: 'ABCD', eventName: 'room:drawingActionApplied', event: extendEvent(1), target: 'match' });
    await coordinator.broadcast({ roomCode: 'ABCD', eventName: 'room:drawingActionApplied', event: extendEvent(2), target: 'match' });
    await coordinator.broadcast({ roomCode: 'ABCD', eventName: 'room:drawingActionApplied', event: extendEvent(3), target: 'match' });

    expect(slowSocket.emitted.map((event) => event.revision)).toEqual([1]);

    slowSocket.pendingAcks.shift()?.();
    vi.advanceTimersByTime(0);

    expect(slowSocket.emitted.map((event) => event.revision)).toEqual([1, 3]);
    expect(slowSocket.emitted[1]?.action).toEqual({
      type: 'extendStroke',
      strokeId: 'stroke-1',
      points: [{ x: 2, y: 2 }, { x: 3, y: 3 }],
    });
  });

  it('clears pending live extensions when a socket is unbound', async () => {
    vi.useFakeTimers();
    const slowSocket = createSocket('slow', false);
    const coordinator = new DrawingBroadcastCoordinator(createNamespace([slowSocket]));

    await coordinator.broadcast({ roomCode: 'ABCD', eventName: 'room:drawingActionApplied', event: extendEvent(1), target: 'match' });
    coordinator.clearSocket(slowSocket.id);

    slowSocket.conn!.transport!.writable = true;
    vi.advanceTimersByTime(100);

    expect(slowSocket.emitted).toEqual([]);
  });

  it('clears queued live extensions behind an outstanding ack when a socket is unbound', async () => {
    vi.useFakeTimers();
    const slowSocket = createSocket('slow', true, { autoAck: false });
    const coordinator = new DrawingBroadcastCoordinator(createNamespace([slowSocket]));

    await coordinator.broadcast({ roomCode: 'ABCD', eventName: 'room:drawingActionApplied', event: extendEvent(1), target: 'match' });
    await coordinator.broadcast({ roomCode: 'ABCD', eventName: 'room:drawingActionApplied', event: extendEvent(2), target: 'match' });

    coordinator.clearSocket(slowSocket.id);
    slowSocket.pendingAcks.shift()?.();
    vi.advanceTimersByTime(100);

    expect(slowSocket.emitted.map((event) => event.revision)).toEqual([1]);
  });

  it('ignores stale acks after a socket is unbound and rebound', async () => {
    vi.useFakeTimers();
    const slowSocket = createSocket('slow', true, { autoAck: false });
    const coordinator = new DrawingBroadcastCoordinator(createNamespace([slowSocket]));

    await coordinator.broadcast({ roomCode: 'ABCD', eventName: 'room:drawingActionApplied', event: extendEvent(1), target: 'match' });
    await coordinator.broadcast({ roomCode: 'ABCD', eventName: 'room:drawingActionApplied', event: extendEvent(2), target: 'match' });
    coordinator.clearSocket(slowSocket.id);

    await coordinator.broadcast({ roomCode: 'ABCD', eventName: 'room:drawingActionApplied', event: extendEvent(3), target: 'match' });
    await coordinator.broadcast({ roomCode: 'ABCD', eventName: 'room:drawingActionApplied', event: extendEvent(4), target: 'match' });

    slowSocket.pendingAcks.shift()?.();
    vi.advanceTimersByTime(0);

    expect(slowSocket.emitted.map((event) => event.revision)).toEqual([1, 3]);

    slowSocket.pendingAcks.shift()?.();
    vi.advanceTimersByTime(0);

    expect(slowSocket.emitted.map((event) => event.revision)).toEqual([1, 3, 4]);
  });

  it('coalesces live stroke extensions for backlogged spectators and flushes the latest before reliable actions', async () => {
    const slowSocket = createSocket('slow', false);
    const coordinator = new DrawingBroadcastCoordinator(createNamespace([slowSocket]));

    await coordinator.broadcast({ roomCode: 'ABCD', eventName: 'room:drawingActionApplied', event: extendEvent(1), target: 'match' });
    await coordinator.broadcast({ roomCode: 'ABCD', eventName: 'room:drawingActionApplied', event: extendEvent(2), target: 'match' });
    slowSocket.conn!.transport!.writable = true;
    await coordinator.broadcast({ roomCode: 'ABCD', eventName: 'room:drawingActionApplied', event: reliableEvent(3), target: 'match' });

    expect(slowSocket.emitted.map((event) => event.revision)).toEqual([2, 3]);
    expect(slowSocket.emitted[0]?.action).toEqual({
      type: 'extendStroke',
      strokeId: 'stroke-1',
      points: [{ x: 1, y: 1 }, { x: 2, y: 2 }],
    });
    expect(slowSocket.emitted[1]?.action.type).toBe('endStroke');
  });

  it('caps coalesced live extension payload growth for long-blocked spectators', async () => {
    vi.useFakeTimers();
    const slowSocket = createSocket('slow', false);
    const coordinator = new DrawingBroadcastCoordinator(createNamespace([slowSocket]));

    await coordinator.broadcast({ roomCode: 'ABCD', eventName: 'room:drawingActionApplied', event: largeExtendEvent(1, 1_000), target: 'match' });
    await coordinator.broadcast({ roomCode: 'ABCD', eventName: 'room:drawingActionApplied', event: largeExtendEvent(2, 2_000), target: 'match' });

    slowSocket.conn!.transport!.writable = true;
    vi.advanceTimersByTime(100);

    expect(slowSocket.emitted.map((event) => event.revision)).toEqual([2]);
    expect(slowSocket.emitted[0]?.action).toMatchObject({ type: 'extendStroke', strokeId: 'stroke-1' });
    if (slowSocket.emitted[0]?.action.type !== 'extendStroke') {
      return;
    }

    expect(slowSocket.emitted[0].action.points).toHaveLength(DRAWING_MAX_EXTEND_POINTS * 3);
    expect(slowSocket.emitted[0].action.points?.[0]).toEqual({ x: 2_000, y: 2_000 });
  });

  it('keeps reliable drawing actions reliable for backlogged spectators', async () => {
    const slowSocket = createSocket('slow', false);
    const coordinator = new DrawingBroadcastCoordinator(createNamespace([slowSocket]));

    await coordinator.broadcast({ roomCode: 'ABCD', eventName: 'room:drawingActionApplied', event: reliableEvent(1), target: 'match' });
    await coordinator.broadcast({ roomCode: 'ABCD', eventName: 'room:drawingActionApplied', event: reliableEvent(2), target: 'match' });

    expect(slowSocket.emitted.map((event) => event.revision)).toEqual([1, 2]);
  });

  it('holds coalesced live extensions while a spectator is not writable and flushes only the latest after recovery', async () => {
    vi.useFakeTimers();
    const slowSocket = createSocket('slow', false);
    const coordinator = new DrawingBroadcastCoordinator(createNamespace([slowSocket]));

    await coordinator.broadcast({ roomCode: 'ABCD', eventName: 'room:drawingActionApplied', event: extendEvent(1), target: 'match' });
    await coordinator.broadcast({ roomCode: 'ABCD', eventName: 'room:drawingActionApplied', event: extendEvent(2), target: 'match' });

    expect(slowSocket.emitted).toEqual([]);

    vi.advanceTimersByTime(100);

    expect(slowSocket.emitted).toEqual([]);

    await coordinator.broadcast({ roomCode: 'ABCD', eventName: 'room:drawingActionApplied', event: extendEvent(3), target: 'match' });
    slowSocket.conn!.transport!.writable = true;
    vi.advanceTimersByTime(100);

    expect(slowSocket.emitted.map((event) => event.revision)).toEqual([3]);
    expect(slowSocket.emitted[0]?.action).toEqual({
      type: 'extendStroke',
      strokeId: 'stroke-1',
      points: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }],
    });
  });
});
