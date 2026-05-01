import type { RoomState } from '@sketcherson/common/room';
import { applyDrawingActionToState, type DrawingActionAppliedEvent, type DrawingState } from '@sketcherson/common/drawing';
import { describe, expect, it } from 'vitest';
import { createRoomDrawingSync } from '../client-room-runtime/RoomDrawingSync';

function buildDrawingState(overrides?: Partial<DrawingState>): DrawingState {
  return {
    width: 800,
    height: 600,
    operations: [],
    undoneOperations: [],
    activeStrokes: [],
    revision: 0,
    snapshotDataUrl: null,
    ...overrides,
  };
}

function buildRoomState(options?: {
  lobbyDrawing?: DrawingState | null;
  matchDrawing?: DrawingState | null;
  turnNumber?: number;
  drawerPlayerId?: string;
  stateRevision?: number;
}): RoomState {
  const matchDrawing = options?.matchDrawing;

  return {
    code: 'ABC123',
    shareUrl: 'http://localhost:5173/room/ABC123',
    stateRevision: options?.stateRevision,
    status: matchDrawing ? 'round' : 'lobby',
    serverReferenceArtEnabled: true,
    players: [
      {
        id: 'player-1',
        nickname: 'Host',
        connected: true,
        reconnectBy: null,
        reconnectRemainingMs: null,
        isHost: true,
        canGuessFromTurnNumber: null,
      },
    ],
    settings: {
      roundTimerSeconds: 60,
      firstCorrectGuessTimeCapSeconds: 30,
      guessingDelaySeconds: 0,
      turnsPerPlayer: 1,
      artEnabled: true,
      enabledCollectionIds: ['base'],
    },
    lobbyDrawing: options?.lobbyDrawing ?? buildDrawingState(),
    lobbyFeed: [],
    match: matchDrawing
      ? {
          phaseEndsAt: null,
          currentTurn: {
            turnNumber: options?.turnNumber ?? 1,
            totalTurns: 2,
            drawerPlayerId: options?.drawerPlayerId ?? 'player-1',
            drawerNickname: 'Host',
            prompt: 'apple',
            promptVisibility: 'assigned',
            referenceArtUrl: null,
            rerollsRemaining: 1,
            rerolledFrom: null,
            correctGuessPlayerIds: [],
            guessingDelayRemainingMs: 0,
            drawing: matchDrawing,
          },
          completedTurns: [],
          feed: [],
          scoreboard: [],
          pause: null,
          pauseCooldownEndsAt: null,
        }
      : null,
  };
}

describe('RoomDrawingSync', () => {
  it('preserves newer local lobby drawing when a stale snapshot arrives', () => {
    const localDrawing = buildDrawingState({ revision: 5 });
    const staleSnapshotDrawing = buildDrawingState({ revision: 3 });
    const sync = createRoomDrawingSync();

    sync.bindRoom(buildRoomState({ lobbyDrawing: localDrawing, stateRevision: 8 }));
    const view = sync.applySnapshot(buildRoomState({ lobbyDrawing: staleSnapshotDrawing, stateRevision: 7 }));

    expect(view.room?.lobbyDrawing).toBe(localDrawing);
    expect(view.drawings.lobby).toBe(localDrawing);
    expect(view.room?.stateRevision).toBe(8);
  });

  it('preserves newer match drawing only for the same turn', () => {
    const localDrawing = buildDrawingState({ revision: 7 });
    const staleSnapshotDrawing = buildDrawingState({ revision: 4 });
    const sync = createRoomDrawingSync();

    sync.bindRoom(buildRoomState({ matchDrawing: localDrawing, turnNumber: 2, drawerPlayerId: 'player-1' }));
    const sameTurn = sync.applySnapshot(buildRoomState({ matchDrawing: staleSnapshotDrawing, turnNumber: 2, drawerPlayerId: 'player-1' }));
    expect(sameTurn.room?.match?.currentTurn?.drawing).toBe(localDrawing);
    expect(sameTurn.drawings.match).toBe(localDrawing);

    const incomingDrawing = buildDrawingState({ revision: 1 });
    const newTurn = sync.applySnapshot(buildRoomState({ matchDrawing: incomingDrawing, turnNumber: 3, drawerPlayerId: 'player-2' }));
    expect(newTurn.room?.match?.currentTurn?.drawing).toBe(incomingDrawing);
    expect(newTurn.drawings.match).toBe(incomingDrawing);
  });

  it('keeps lobby and match targets independent', () => {
    const lobbyDrawing = buildDrawingState({ revision: 0 });
    const matchDrawing = buildDrawingState({ revision: 0 });
    const sync = createRoomDrawingSync();

    sync.bindRoom(buildRoomState({ lobbyDrawing, matchDrawing }));
    const lobbyResult = sync.applyEvent('lobby', {
      code: 'ABC123',
      revision: 1,
      action: {
        type: 'beginStroke',
        strokeId: 'lobby-stroke',
        tool: 'pen',
        color: '#101a35',
        size: 6,
        point: { x: 10, y: 20 },
      },
    });

    expect(lobbyResult.status).toBe('applied');
    expect(lobbyResult.view.drawings.lobby?.activeStrokes[0]?.id).toBe('lobby-stroke');
    expect(lobbyResult.view.drawings.match).toBe(matchDrawing);

    const matchResult = sync.applyEvent('match', {
      code: 'ABC123',
      revision: 1,
      action: {
        type: 'beginStroke',
        strokeId: 'match-stroke',
        tool: 'pen',
        color: '#101a35',
        size: 6,
        point: { x: 30, y: 40 },
      },
    });

    expect(matchResult.status).toBe('applied');
    expect(matchResult.view.drawings.lobby?.activeStrokes[0]?.id).toBe('lobby-stroke');
    expect(matchResult.view.drawings.match?.activeStrokes[0]?.id).toBe('match-stroke');
  });

  it('ignores duplicate events, applies next events, and reports gaps', () => {
    const drawing = buildDrawingState();
    applyDrawingActionToState(drawing, {
      type: 'beginStroke',
      strokeId: 'stroke-1',
      tool: 'pen',
      color: '#101a35',
      size: 6,
      point: { x: 100, y: 100 },
    });

    const room = buildRoomState({ matchDrawing: drawing, stateRevision: 10 });
    const sync = createRoomDrawingSync();
    sync.bindRoom(room);

    const duplicateEvent: DrawingActionAppliedEvent = {
      code: room.code,
      revision: 1,
      action: {
        type: 'beginStroke',
        strokeId: 'stroke-1',
        tool: 'pen',
        color: '#101a35',
        size: 6,
        point: { x: 100, y: 100 },
      },
    };
    expect(sync.applyEvent('match', duplicateEvent)).toEqual({
      view: {
        room,
        drawings: {
          lobby: room.lobbyDrawing,
          match: room.match?.currentTurn?.drawing ?? null,
        },
      },
      status: 'ignored-stale',
    });

    const next = sync.applyEvent('match', {
      code: room.code,
      revision: 2,
      stateRevision: 11,
      action: {
        type: 'extendStroke',
        strokeId: 'stroke-1',
        points: [{ x: 120, y: 130 }],
      },
    });
    expect(next.status).toBe('applied');
    expect(next.view.room?.stateRevision).toBe(11);
    expect(next.view.drawings.match?.activeStrokes[0]?.points).toEqual([
      { x: 100, y: 100 },
      { x: 120, y: 130 },
    ]);

    const gap = sync.applyEvent('match', {
      code: room.code,
      revision: 4,
      action: { type: 'clear' },
    });
    expect(gap.status).toBe('requires-resync');
  });
});
