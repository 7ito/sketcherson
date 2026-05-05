import type { RoomState } from '@7ito/sketcherson-common/room';
import type { DrawingActionAppliedEvent, DrawingState } from '@7ito/sketcherson-common/drawing';
import type { RoomClientEventName, RoomRequest, RoomResponse, RoomServerEventName, RoomServerPayload } from '@7ito/sketcherson-common/roomEvents';
import { createRoomClient, type JoinedSession, type JoinedSessionStore, type PreferredNicknameStore, type RoomTransport } from '../client-room-runtime';
import type { RoomConnectionEvents } from '../client-room-runtime';

class InMemoryRoomTransport implements RoomTransport {
  public readonly emitted: Array<{ event: RoomClientEventName; payload: RoomRequest<RoomClientEventName> }> = [];
  private readonly handlers = new Map<RoomServerEventName, Set<(payload: unknown) => void>>();
  private readonly connectionHandlers = new Map<keyof RoomConnectionEvents, Set<(payload: unknown) => void>>();
  private responders = new Map<RoomClientEventName, (payload: unknown) => unknown>();

  public respond<E extends RoomClientEventName>(event: E, responder: (payload: RoomRequest<E>) => RoomResponse<E>): void {
    this.responders.set(event, responder as (payload: unknown) => unknown);
  }

  public async emitWithAck<E extends RoomClientEventName>(event: E, payload: RoomRequest<E>): Promise<RoomResponse<E>> {
    this.emitted.push({ event, payload });
    const responder = this.responders.get(event);
    if (!responder) {
      throw new Error(`No responder registered for ${event}`);
    }

    return responder(payload) as RoomResponse<E>;
  }

  public on<E extends RoomServerEventName>(event: E, handler: (payload: RoomServerPayload<E>) => void): () => void {
    const handlers = this.handlers.get(event) ?? new Set<(payload: unknown) => void>();
    const wrappedHandler = handler as (payload: unknown) => void;
    handlers.add(wrappedHandler);
    this.handlers.set(event, handlers);

    return () => {
      handlers.delete(wrappedHandler);
    };
  }

  public onConnectionEvent<E extends keyof RoomConnectionEvents>(event: E, handler: (payload: RoomConnectionEvents[E]) => void): () => void {
    const handlers = this.connectionHandlers.get(event) ?? new Set<(payload: unknown) => void>();
    const wrappedHandler = handler as (payload: unknown) => void;
    handlers.add(wrappedHandler);
    this.connectionHandlers.set(event, handlers);

    return () => {
      handlers.delete(wrappedHandler);
    };
  }

  public emitServerEvent<E extends RoomServerEventName>(event: E, payload: RoomServerPayload<E>): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(payload);
    }
  }

  public emitConnectionEvent<E extends keyof RoomConnectionEvents>(event: E, payload: RoomConnectionEvents[E]): void {
    for (const handler of this.connectionHandlers.get(event) ?? []) {
      handler(payload);
    }
  }
}

class MemoryJoinedSessionStore implements JoinedSessionStore {
  public session: JoinedSession | null = null;

  public read(): JoinedSession | null {
    return this.session;
  }

  public write(session: JoinedSession | null): void {
    this.session = session;
  }
}

class MemoryPreferredNicknameStore implements PreferredNicknameStore {
  public nickname: string | null = null;

  public write(nickname: string): void {
    this.nickname = nickname;
  }
}

function createDrawingState(revision = 0): DrawingState {
  return {
    width: 800,
    height: 600,
    operations: [],
    undoneOperations: [],
    activeStrokes: [],
    revision,
    snapshotDataUrl: null,
  };
}

function buildRoomState(code = 'ABCDEF', nickname = 'Guest', drawing: DrawingState | null = null): RoomState {
  return {
    code,
    shareUrl: `https://example.test/room/${code}`,
    status: 'lobby',
    players: [
      {
        id: 'player-1',
        nickname,
        connected: true,
        reconnectBy: null,
        isHost: true,
      },
    ],
    settings: {
      roundTimerSeconds: 90,
      firstCorrectGuessTimeCapSeconds: 30,
      turnsPerPlayer: 1,
      artEnabled: true,
    },
    match: null,
    lobbyDrawing: drawing,
  };
}

function createTestClient(options?: { storedSession?: JoinedSession | null }) {
  const transport = new InMemoryRoomTransport();
  const joinedSessionStore = new MemoryJoinedSessionStore();
  joinedSessionStore.session = options?.storedSession ?? null;
  const preferredNicknameStore = new MemoryPreferredNicknameStore();
  const client = createRoomClient({ transport, joinedSessionStore, preferredNicknameStore });

  return { client, transport, joinedSessionStore, preferredNicknameStore };
}

describe('room client runtime', () => {
  it('stores the joined session, preferred nickname, and room snapshot after creating a room', async () => {
    const { client, transport, joinedSessionStore, preferredNicknameStore } = createTestClient();
    const room = buildRoomState('ABCDEF', 'Guest');
    transport.respond('room:create', () => ({
      ok: true,
      data: {
        playerId: 'player-1',
        sessionToken: 'session-1',
        room,
      },
    }));

    await client.createRoom('  Guest  ');

    expect(joinedSessionStore.session).toEqual({
      playerId: 'player-1',
      roomCode: 'ABCDEF',
      nickname: 'Guest',
      sessionToken: 'session-1',
    });
    expect(preferredNicknameStore.nickname).toBe('Guest');
    expect(client.getSnapshot().activeRoom).toBe(room);
    expect(client.getSnapshot().joinedSession?.roomCode).toBe('ABCDEF');
  });

  it('clears the active room and stored session when the player is kicked', () => {
    const storedSession: JoinedSession = {
      playerId: 'player-1',
      roomCode: 'ABCDEF',
      nickname: 'Guest',
      sessionToken: 'session-1',
    };
    const { client, transport, joinedSessionStore } = createTestClient({ storedSession });
    transport.emitServerEvent('room:state', buildRoomState('ABCDEF', 'Guest'));

    transport.emitServerEvent('room:kicked', { roomCode: 'ABCDEF', message: 'Removed by host.' });

    expect(joinedSessionStore.session).toBeNull();
    expect(client.getSnapshot().activeRoom).toBeNull();
    expect(client.getSnapshot().joinedSession).toBeNull();
    expect(client.getSnapshot().roomExitNotice).toEqual({ roomCode: 'ABCDEF', message: 'Removed by host.' });
  });

  it('applies incremental lobby drawing events without replacing the public room snapshot', () => {
    const { client, transport } = createTestClient();
    const room = buildRoomState('ABCDEF', 'Guest', createDrawingState());
    transport.emitServerEvent('room:state', room);

    const event: DrawingActionAppliedEvent = {
      code: 'ABCDEF',
      revision: 1,
      stateRevision: 2,
      action: {
        type: 'beginStroke',
        strokeId: 'stroke-1',
        tool: 'pen',
        color: '#000000',
        size: 6,
        point: { x: 10, y: 20 },
      },
    };
    transport.emitServerEvent('room:lobbyDrawingActionApplied', event);

    expect(client.getSnapshot().activeRoom).toBe(room);
    expect(client.getSnapshot().lobbyDrawing?.revision).toBe(1);
    expect(client.getSnapshot().lobbyDrawing?.activeStrokes[0]?.points).toEqual([{ x: 10, y: 20 }]);
  });

  it('reclaims the stored active session after reconnecting', async () => {
    const storedSession: JoinedSession = {
      playerId: 'player-1',
      roomCode: 'ABCDEF',
      nickname: 'Guest',
      sessionToken: 'session-1',
    };
    const { client, transport } = createTestClient({ storedSession });
    const room = buildRoomState('ABCDEF', 'Guest');
    const reclaimedRoom = buildRoomState('ABCDEF', 'Guest');
    reclaimedRoom.stateRevision = 2;
    transport.respond('room:reclaim', (payload) => ({
      ok: true,
      data: {
        playerId: 'player-1',
        sessionToken: payload.sessionToken,
        room: reclaimedRoom,
      },
    }));
    transport.emitServerEvent('room:state', room);

    transport.emitConnectionEvent('connect', undefined);

    await vi.waitFor(() => {
      expect(client.getSnapshot().activeRoom).toBe(reclaimedRoom);
    });
    expect(transport.emitted).toContainEqual({
      event: 'room:reclaim',
      payload: { code: 'ABCDEF', sessionToken: 'session-1' },
    });
  });

  it('clears a stored session and exposes a recovery notice when reclaim fails', async () => {
    const storedSession: JoinedSession = {
      playerId: 'player-1',
      roomCode: 'ABCDEF',
      nickname: 'Guest',
      sessionToken: 'session-1',
    };
    const { client, transport, joinedSessionStore } = createTestClient({ storedSession });
    const room = buildRoomState('ABCDEF', 'Guest');
    transport.respond('room:reclaim', () => ({
      ok: false,
      error: { code: 'ROOM_NOT_FOUND', message: 'Room not found or expired.' },
    }));
    transport.emitServerEvent('room:state', room);

    const result = await client.reclaimStoredSession('ABCDEF');

    expect(result?.ok).toBe(false);
    expect(joinedSessionStore.session).toBeNull();
    expect(client.getSnapshot().joinedSession).toBeNull();
    expect(client.getSnapshot().activeRoom).toBeNull();
    expect(client.getSnapshot().sessionRecoveryError).toEqual({
      roomCode: 'ABCDEF',
      message: 'Your previous room session could not be restored. The room may have expired or the server may have restarted.',
    });
  });

  it('requests resync when an end stroke action is rejected', async () => {
    const { client, transport } = createTestClient();
    const room = buildRoomState('ABCDEF', 'Guest', createDrawingState());
    const resyncedDrawing = createDrawingState(2);
    transport.emitServerEvent('room:state', room);
    transport.respond('room:lobbyDrawingAction', () => ({
      ok: false,
      error: { code: 'INVALID_DRAW_ACTION', message: 'The drawing stroke could not be completed.' },
    }));
    transport.respond('room:getDrawingSnapshot', () => ({
      ok: true,
      data: { roomCode: 'ABCDEF', target: 'lobby', revision: resyncedDrawing.revision, stateRevision: 2, drawing: resyncedDrawing },
    }));

    const result = await client.submitLobbyDrawingAction('ABCDEF', { type: 'endStroke', strokeId: 'stroke-1' });

    expect(result.ok).toBe(false);
    await vi.waitFor(() => {
      expect(client.getSnapshot().lobbyDrawing?.revision).toBe(2);
    });
    expect(transport.emitted.map((entry) => entry.event)).toEqual(['room:lobbyDrawingAction', 'room:getDrawingSnapshot']);
  });

  it('requests one resync when a drawing event revision gap is detected', async () => {
    const { client, transport } = createTestClient();
    const room = buildRoomState('ABCDEF', 'Guest', createDrawingState());
    const resyncedDrawing = createDrawingState(3);
    transport.respond('room:getDrawingSnapshot', () => ({
      ok: true,
      data: { roomCode: 'ABCDEF', target: 'lobby', revision: resyncedDrawing.revision, stateRevision: 3, drawing: resyncedDrawing },
    }));
    transport.emitServerEvent('room:state', room);

    const gapEvent: DrawingActionAppliedEvent = {
      code: 'ABCDEF',
      revision: 3,
      action: {
        type: 'clear',
      },
    };
    transport.emitServerEvent('room:lobbyDrawingActionApplied', gapEvent);
    transport.emitServerEvent('room:lobbyDrawingActionApplied', gapEvent);

    await vi.waitFor(() => {
      expect(client.getSnapshot().lobbyDrawing?.revision).toBe(3);
    });
    expect(transport.emitted.filter((entry) => entry.event === 'room:getDrawingSnapshot')).toHaveLength(1);
  });
});
