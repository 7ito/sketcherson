import { describe, expect, it, vi } from 'vitest';
import { applyDrawingAction, createDrawingState, finalizeDrawingState } from '../src/domain/drawing';
import { LOBBY_DRAWING_MAX_OPERATIONS, ServerDrawingChannel } from '../src/domain/roomRuntime/ServerDrawingChannel';
import type { RoomRecord } from '../src/domain/roomRuntime/model';

describe('drawing state', () => {
  it('tracks a live stroke and captures a bitmap snapshot at turn end', () => {
    const drawing = createDrawingState();

    expect(
      applyDrawingAction(drawing, {
        type: 'beginStroke',
        strokeId: 'stroke-1',
        tool: 'pen',
        color: '#101a35',
        size: 6,
        point: { x: 120, y: 80 },
      }).ok,
    ).toBe(true);

    expect(
      applyDrawingAction(drawing, {
        type: 'extendStroke',
        strokeId: 'stroke-1',
        points: [
          { x: 180, y: 120 },
          { x: 220, y: 180 },
        ],
      }).ok,
    ).toBe(true);

    expect(
      applyDrawingAction(drawing, {
        type: 'endStroke',
        strokeId: 'stroke-1',
      }).ok,
    ).toBe(true);

    expect(drawing.operations).toHaveLength(1);
    expect(drawing.activeStrokes).toEqual([]);
    expect(drawing.operations[0]).toMatchObject({ kind: 'stroke' });
    expect(drawing.operations[0]?.kind === 'stroke' ? drawing.operations[0].points : []).toHaveLength(3);

    finalizeDrawingState(drawing);

    expect(drawing.snapshotDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('treats clear as an undoable drawing operation', () => {
    const drawing = createDrawingState();

    applyDrawingAction(drawing, {
      type: 'beginStroke',
      strokeId: 'stroke-1',
      tool: 'pen',
      color: '#2d56ff',
      size: 6,
      point: { x: 40, y: 40 },
    });
    applyDrawingAction(drawing, {
      type: 'endStroke',
      strokeId: 'stroke-1',
    });
    applyDrawingAction(drawing, {
      type: 'clear',
    });

    expect(drawing.operations.map((operation) => operation.kind)).toEqual(['stroke', 'clear']);

    applyDrawingAction(drawing, {
      type: 'undo',
    });

    expect(drawing.operations.map((operation) => operation.kind)).toEqual(['stroke']);
    expect(drawing.undoneOperations.map((operation) => operation.kind)).toEqual(['clear']);

    applyDrawingAction(drawing, {
      type: 'redo',
    });

    expect(drawing.operations.map((operation) => operation.kind)).toEqual(['stroke', 'clear']);
    expect(drawing.undoneOperations).toEqual([]);
  });

  it('allows match drawer to replace a stale active stroke', () => {
    const drawing = createDrawingState();
    applyDrawingAction(drawing, {
      type: 'beginStroke',
      strokeId: 'stale-stroke',
      tool: 'pen',
      color: '#2d56ff',
      size: 6,
      point: { x: 40, y: 40 },
    });
    const room = {
      code: 'ABCDEF',
      stateRevision: 1,
      status: 'round',
      match: {
        activeTurn: {
          drawerPlayerId: 'player-1',
          drawing,
        },
      },
      lobbyDrawing: createDrawingState(),
    } as RoomRecord;
    const channel = createDrawingChannel();

    const result = channel.apply({
      room,
      actor: { playerId: 'player-1', connectionId: 'socket-1' },
      target: 'match',
      action: {
        type: 'beginStroke',
        strokeId: 'fresh-stroke',
        tool: 'pen',
        color: '#ff6600',
        size: 6,
        point: { x: 80, y: 80 },
      },
    });

    expect(result.ok).toBe(true);
    expect(drawing.activeStrokes.map((stroke) => stroke.id)).toEqual(['fresh-stroke']);
  });

  it('rejects lobby strokes beyond the participant active stroke cap', () => {
    const room = createLobbyDrawingRoom(['player-1']);
    room.lobbyDrawing.activeStrokes = [{
      kind: 'stroke',
      id: 'stroke-1',
      tool: 'pen',
      color: '#2d56ff',
      size: 6,
      points: [{ x: 40, y: 40 }],
    }];
    const channel = createDrawingChannel();

    const result = channel.apply({
      room,
      actor: { playerId: 'player-1', connectionId: 'socket-1' },
      target: 'lobby',
      action: {
        type: 'beginStroke',
        strokeId: 'stroke-2',
        tool: 'pen',
        color: '#ff6600',
        size: 6,
        point: { x: 80, y: 80 },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error.message).toBe('Lobby drawing already has the maximum number of active strokes.');
  });

  it('rejects lobby drawing operations beyond the stricter lobby history cap', () => {
    const room = createLobbyDrawingRoom(['player-1']);
    room.lobbyDrawing.operations = Array.from({ length: LOBBY_DRAWING_MAX_OPERATIONS }, (_, index) => ({
      kind: 'fill',
      id: `fill-${index}`,
      color: '#2d56ff',
      point: { x: 40, y: 40 },
    }));
    const channel = createDrawingChannel();

    const result = channel.apply({
      room,
      actor: { playerId: 'player-1', connectionId: 'socket-1' },
      target: 'lobby',
      action: {
        type: 'fill',
        color: '#ff6600',
        point: { x: 80, y: 80 },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error.message).toBe(`Lobby drawing history can only contain ${LOBBY_DRAWING_MAX_OPERATIONS} operations.`);
  });

  it('allows fill while another stroke is active', () => {
    const drawing = createDrawingState();

    applyDrawingAction(drawing, {
      type: 'beginStroke',
      strokeId: 'stroke-1',
      tool: 'pen',
      color: '#2d56ff',
      size: 6,
      point: { x: 40, y: 40 },
    });

    const result = applyDrawingAction(drawing, {
      type: 'fill',
      color: '#ff6600',
      point: { x: 80, y: 80 },
    });

    expect(result.ok).toBe(true);
    expect(drawing.operations.map((operation) => operation.kind)).toEqual(['fill']);
    expect(drawing.activeStrokes).toHaveLength(1);
  });

  it('clears redo history after a new drawing action', () => {
    const drawing = createDrawingState();

    applyDrawingAction(drawing, {
      type: 'beginStroke',
      strokeId: 'stroke-1',
      tool: 'pen',
      color: '#2d56ff',
      size: 6,
      point: { x: 40, y: 40 },
    });
    applyDrawingAction(drawing, {
      type: 'endStroke',
      strokeId: 'stroke-1',
    });
    applyDrawingAction(drawing, {
      type: 'undo',
    });

    expect(drawing.undoneOperations).toHaveLength(1);

    applyDrawingAction(drawing, {
      type: 'beginStroke',
      strokeId: 'stroke-2',
      tool: 'pen',
      color: '#ff6600',
      size: 6,
      point: { x: 80, y: 80 },
    });

    expect(drawing.undoneOperations).toEqual([]);
  });
});

function createDrawingChannel(): ServerDrawingChannel {
  return new ServerDrawingChannel({
    applyDrawingAction,
    consumeDrawingRateLimit: () => null,
    touchRoom: vi.fn(),
    lobbyDrawingEnabled: true,
  });
}

function createLobbyDrawingRoom(playerIds: string[]): RoomRecord {
  return {
    code: 'ABCDEF',
    stateRevision: 1,
    status: 'lobby',
    match: null,
    players: new Map(playerIds.map((playerId) => [playerId, {
      id: playerId,
      nickname: playerId,
      sessionToken: `${playerId}-session`,
      socketId: `${playerId}-socket`,
      connected: true,
      reconnectBy: null,
      reconnectRemainingMs: null,
      reconnectTimer: null,
      canGuessFromTurnNumber: null,
    }])),
    hostPlayerId: playerIds[0] ?? 'player-1',
    settings: {} as RoomRecord['settings'],
    lobbyDrawing: createDrawingState(),
    lobbyFeed: [],
    timer: null,
  };
}
