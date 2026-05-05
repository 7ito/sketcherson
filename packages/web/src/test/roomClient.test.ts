import type { RoomState } from '@7ito/sketcherson-common/room';
import type { DrawingActionAppliedEvent, DrawingState } from '@7ito/sketcherson-common/drawing';
import type { RoomClientEventName, RoomDrawingClientEventName, RoomDrawingRequest, RoomDrawingResponse, RoomRequest, RoomResponse, RoomServerEventName, RoomServerPayload } from '@7ito/sketcherson-common/roomEvents';
import { createRoomClient, type JoinedSession, type JoinedSessionStore, type PreferredNicknameStore, type RoomDrawingTransport, type RoomTransport } from '../client-room-runtime';
import type { RoomConnectionEvents } from '../client-room-runtime';

class InMemoryRoomTransport implements RoomTransport {
  public readonly emitted: Array<{ event: RoomClientEventName; payload: RoomRequest<RoomClientEventName> }> = [];
  private readonly handlers = new Map<RoomServerEventName, Set<(payload: unknown) => void>>();
  private readonly connectionHandlers = new Map<keyof RoomConnectionEvents, Set<(payload: unknown) => void>>();
  private responders = new Map<RoomClientEventName, (payload: unknown) => unknown>();
  public connectionId: string | undefined;

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

  public getConnectionId(): string | undefined {
    return this.connectionId;
  }
}

class InMemoryRoomDrawingTransport implements RoomDrawingTransport {
  public readonly emitted: Array<{ event: RoomDrawingClientEventName; payload: RoomDrawingRequest<RoomDrawingClientEventName> }> = [];
  private readonly handlers = new Map<RoomServerEventName, Set<(payload: unknown) => void>>();
  private readonly connectionHandlers = new Map<keyof RoomConnectionEvents, Set<(payload: unknown) => void>>();
  private responders = new Map<RoomDrawingClientEventName, (payload: unknown) => unknown>();

  public respond<E extends RoomDrawingClientEventName>(event: E, responder: (payload: RoomDrawingRequest<E>) => RoomDrawingResponse<E> | Promise<RoomDrawingResponse<E>>): void {
    this.responders.set(event, responder as (payload: unknown) => unknown);
  }

  public async emitWithAck<E extends RoomDrawingClientEventName>(event: E, payload: RoomDrawingRequest<E>): Promise<RoomDrawingResponse<E>> {
    this.emitted.push({ event, payload });
    const responder = this.responders.get(event);
    if (!responder) {
      throw new Error(`No responder registered for ${event}`);
    }

    return await responder(payload) as RoomDrawingResponse<E>;
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

function createTestClient(options?: { storedSession?: JoinedSession | null; useSeparateDrawingTransport?: boolean }) {
  const transport = new InMemoryRoomTransport();
  transport.connectionId = options?.useSeparateDrawingTransport ? 'control-connection' : undefined;
  const drawingTransport = options?.useSeparateDrawingTransport ? new InMemoryRoomDrawingTransport() : null;
  drawingTransport?.respond('room:bindDrawingTransport', (payload) => ({ ok: true, data: { roomCode: payload.code } }));
  const joinedSessionStore = new MemoryJoinedSessionStore();
  joinedSessionStore.session = options?.storedSession ?? null;
  const preferredNicknameStore = new MemoryPreferredNicknameStore();
  const client = createRoomClient({
    transport,
    drawingTransport: drawingTransport ?? undefined,
    joinedSessionStore,
    preferredNicknameStore,
  });

  return { client, transport, drawingTransport, joinedSessionStore, preferredNicknameStore };
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

  it('waits for the dedicated drawing transport bind before submitting drawing actions', async () => {
    const { client, transport, drawingTransport } = createTestClient({ useSeparateDrawingTransport: true });
    const room = buildRoomState('ABCDEF', 'Guest');
    let resolveBind: ((value: RoomDrawingResponse<'room:bindDrawingTransport'>) => void) | null = null;
    drawingTransport?.respond('room:bindDrawingTransport', () => new Promise((resolve) => {
      resolveBind = resolve;
    }));
    drawingTransport?.respond('room:lobbyDrawingAction', () => ({ ok: true, data: { roomCode: 'ABCDEF', revision: 1 } }));
    transport.respond('room:create', () => ({
      ok: true,
      data: {
        playerId: 'player-1',
        sessionToken: 'session-1',
        room,
      },
    }));

    await client.createRoom('Guest');
    const actionPromise = client.submitLobbyDrawingAction('ABCDEF', {
      type: 'beginStroke',
      strokeId: 'stroke-1',
      tool: 'pen',
      color: '#000000',
      size: 8,
      point: { x: 1, y: 2 },
    });

    await Promise.resolve();
    expect(drawingTransport?.emitted.map((entry) => entry.event)).toEqual(['room:bindDrawingTransport']);

    resolveBind?.({ ok: true, data: { roomCode: 'ABCDEF' } });
    await actionPromise;

    expect(drawingTransport?.emitted.map((entry) => entry.event)).toEqual(['room:bindDrawingTransport', 'room:lobbyDrawingAction']);
  });

  it('rebinds before submitting after the drawing socket disconnects', async () => {
    const { client, transport, drawingTransport } = createTestClient({ useSeparateDrawingTransport: true });
    const room = buildRoomState('ABCDEF', 'Guest');
    drawingTransport?.respond('room:lobbyDrawingAction', () => ({ ok: true, data: { roomCode: 'ABCDEF', revision: 1 } }));
    transport.respond('room:create', () => ({
      ok: true,
      data: {
        playerId: 'player-1',
        sessionToken: 'session-1',
        room,
      },
    }));

    await client.createRoom('Guest');
    drawingTransport?.emitConnectionEvent('disconnect', 'transport close');
    await client.submitLobbyDrawingAction('ABCDEF', {
      type: 'beginStroke',
      strokeId: 'stroke-1',
      tool: 'pen',
      color: '#000000',
      size: 8,
      point: { x: 1, y: 2 },
    });

    expect(drawingTransport?.emitted.map((entry) => entry.event)).toEqual([
      'room:bindDrawingTransport',
      'room:bindDrawingTransport',
      'room:lobbyDrawingAction',
    ]);
  });

  it('does not treat a dedicated drawing transport as bound while control is disconnected', async () => {
    const { client, transport, drawingTransport } = createTestClient({ useSeparateDrawingTransport: true });
    const room = buildRoomState('ABCDEF', 'Guest');
    drawingTransport?.respond('room:lobbyDrawingAction', () => ({ ok: true, data: { roomCode: 'ABCDEF', revision: 1 } }));
    transport.respond('room:create', () => ({
      ok: true,
      data: {
        playerId: 'player-1',
        sessionToken: 'session-1',
        room,
      },
    }));

    await client.createRoom('Guest');
    transport.connectionId = undefined;
    transport.emitConnectionEvent('disconnect', 'transport close');

    const result = await client.submitLobbyDrawingAction('ABCDEF', {
      type: 'beginStroke',
      strokeId: 'stroke-1',
      tool: 'pen',
      color: '#000000',
      size: 8,
      point: { x: 1, y: 2 },
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'SESSION_EXPIRED' } });
    expect(drawingTransport?.emitted.map((entry) => entry.event)).toEqual(['room:bindDrawingTransport']);
  });

  it('rebinds the dedicated drawing transport after the drawing socket reconnects', async () => {
    const { client, transport, drawingTransport } = createTestClient({ useSeparateDrawingTransport: true });
    const room = buildRoomState('ABCDEF', 'Guest');
    transport.respond('room:create', () => ({
      ok: true,
      data: {
        playerId: 'player-1',
        sessionToken: 'session-1',
        room,
      },
    }));

    await client.createRoom('Guest');
    drawingTransport?.emitConnectionEvent('connect', undefined);

    await vi.waitFor(() => {
      expect(drawingTransport?.emitted).toEqual([
        { event: 'room:bindDrawingTransport', payload: { code: 'ABCDEF', controlConnectionId: 'control-connection' } },
        { event: 'room:bindDrawingTransport', payload: { code: 'ABCDEF', controlConnectionId: 'control-connection' } },
      ]);
    });
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

  it('requests a match drawing snapshot when a metadata update starts a new turn with drawing omitted', async () => {
    const { client, transport } = createTestClient();
    const turnOneDrawing = createDrawingState(4);
    const turnTwoDrawing = createDrawingState();
    const baseRoom = buildRoomState('ABCDEF', 'Guest');
    const turnOneRoom: RoomState = {
      ...baseRoom,
      status: 'round',
      stateRevision: 10,
      match: {
        phaseEndsAt: null,
        currentTurn: {
          turnNumber: 1,
          totalTurns: 2,
          drawerPlayerId: 'player-1',
          drawerNickname: 'Guest',
          prompt: 'cat',
          promptVisibility: 'assigned',
          rerollsRemaining: 0,
          rerolledFrom: null,
          correctGuessPlayerIds: [],
          drawing: turnOneDrawing,
        },
        completedTurns: [],
        feed: [],
        scoreboard: [],
      },
    };
    const turnTwoRoom: RoomState = {
      ...turnOneRoom,
      stateRevision: 11,
      match: turnOneRoom.match
        ? {
            ...turnOneRoom.match,
            currentTurn: turnOneRoom.match.currentTurn
              ? {
                  ...turnOneRoom.match.currentTurn,
                  turnNumber: 2,
                  drawing: null,
                }
              : null,
          }
        : null,
    };
    transport.respond('room:getDrawingSnapshot', () => ({
      ok: true,
      data: { roomCode: 'ABCDEF', target: 'match', revision: 0, stateRevision: 11, drawing: turnTwoDrawing },
    }));

    transport.emitServerEvent('room:state', turnOneRoom);
    transport.emitServerEvent('room:state', turnTwoRoom);

    await vi.waitFor(() => {
      expect(client.getSnapshot().matchDrawing).toBe(turnTwoDrawing);
    });
    expect(transport.emitted).toContainEqual({
      event: 'room:getDrawingSnapshot',
      payload: { code: 'ABCDEF', target: 'match' },
    });
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
