import { describe, expect, it } from 'vitest';
import type { DrawingState } from './drawing';
import { createDrawingState } from './drawingProtocol';
import { createDrawingRealtimeCore } from './drawingRealtime';

interface TestRoom {
  code: string;
  stateRevision?: number;
  lobbyDrawing: DrawingState | null;
  matchDrawing: DrawingState | null;
  turnId: string;
}

const core = createDrawingRealtimeCore<TestRoom>({
  getCode: (room) => room.code,
  getDrawing: (room, target) => (target === 'lobby' ? room.lobbyDrawing : room.matchDrawing),
  replaceDrawing(room, target, drawing) {
    return target === 'lobby' ? { ...room, lobbyDrawing: drawing } : { ...room, matchDrawing: drawing };
  },
  getRevision: (room) => room.stateRevision,
  setRevision: (room, revision) => ({ ...room, stateRevision: revision }),
  shouldPreserveDrawing: ({ current, incoming, target }) => target === 'lobby' || current.turnId === incoming.turnId,
});

function room(overrides?: Partial<TestRoom>): TestRoom {
  return {
    code: 'ABCDEF',
    stateRevision: 1,
    lobbyDrawing: createDrawingState(),
    matchDrawing: createDrawingState(),
    turnId: 'turn-1',
    ...overrides,
  };
}

describe('drawingRealtime', () => {
  it('applies local actions and advances drawing plus room revisions', () => {
    const result = core.applyLocalAction({
      room: room(),
      target: 'lobby',
      action: {
        type: 'beginStroke',
        strokeId: 'stroke-1',
        tool: 'pen',
        color: '#000000',
        size: 8,
        point: { x: 10, y: 20 },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.revision).toBe(1);
    expect(result.data.room.stateRevision).toBe(2);
    expect(result.data.room.lobbyDrawing?.activeStrokes[0]?.id).toBe('stroke-1');
  });

  it('applies next remote events, ignores stale events, and reports revision gaps', () => {
    const initialRoom = room();
    const next = core.applyRemoteEvent({
      room: initialRoom,
      target: 'match',
      event: {
        code: 'ABCDEF',
        revision: 1,
        stateRevision: 4,
        action: {
          type: 'beginStroke',
          strokeId: 'stroke-1',
          tool: 'pen',
          color: '#000000',
          size: 8,
          point: { x: 10, y: 20 },
        },
      },
    });

    expect(next.status).toBe('applied');
    expect(next.room?.stateRevision).toBe(4);
    expect(next.room?.matchDrawing?.revision).toBe(1);

    const stale = core.applyRemoteEvent({
      room: next.room,
      target: 'match',
      event: {
        code: 'ABCDEF',
        revision: 1,
        action: { type: 'clear' },
      },
    });
    expect(stale.status).toBe('ignored-stale');

    const gap = core.applyRemoteEvent({
      room: next.room,
      target: 'match',
      event: {
        code: 'ABCDEF',
        revision: 3,
        action: { type: 'clear' },
      },
    });
    expect(gap.status).toBe('requires-resync');
  });

  it('preserves newer snapshot drawing per target policy', () => {
    const newerLobby = createDrawingState();
    newerLobby.revision = 3;
    const newerMatch = createDrawingState();
    newerMatch.revision = 3;

    const mergedSameTurn = core.mergeSnapshot({
      current: room({ stateRevision: 4, lobbyDrawing: newerLobby, matchDrawing: newerMatch }),
      incoming: room({ stateRevision: 4, lobbyDrawing: createDrawingState(), matchDrawing: createDrawingState() }),
    });

    expect(mergedSameTurn.lobbyDrawing).toBe(newerLobby);
    expect(mergedSameTurn.matchDrawing).toBe(newerMatch);

    const mergedNewTurn = core.mergeSnapshot({
      current: room({ stateRevision: 4, matchDrawing: newerMatch, turnId: 'turn-1' }),
      incoming: room({ stateRevision: 4, matchDrawing: createDrawingState(), turnId: 'turn-2' }),
    });

    expect(mergedNewTurn.matchDrawing).not.toBe(newerMatch);
  });
});
