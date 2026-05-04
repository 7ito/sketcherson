import { applyDrawingActionToState, type DrawingActionAppliedEvent } from '@7ito/sketcherson-common/drawing';
import { createServerGameRuntime } from '@7ito/sketcherson-common/game';
import type { ApiResult, CreateRoomSuccess, DrawingActionSuccess, JoinRoomSuccess, ReclaimRoomSuccess, RoomState, RerollTurnSuccess, StartRoomSuccess, SubmitMessageSuccess, UpdateLobbySettingsSuccess } from '@7ito/sketcherson-common/room';
import { io as ioClient, type Socket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import { createGameServer, type GameServer } from '../src/createServer';
import { DEMO_GAME_PACK } from '@sketcherson/demo-game';

function waitForState(
  socket: Socket,
  predicate: (roomState: RoomState) => boolean,
  timeoutMs = 2_000,
  history: RoomState[] = [],
): Promise<RoomState> {
  const existingState = history.find(predicate);
  if (existingState) {
    return Promise.resolve(existingState);
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      clearInterval(pollInterval);
      socket.off('room:state', handleState);
    };

    const resolveIfHistoryMatches = () => {
      const matchingState = history.find(predicate);
      if (!matchingState) {
        return false;
      }

      cleanup();
      resolve(matchingState);
      return true;
    };

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for room state'));
    }, timeoutMs);

    const pollInterval = setInterval(() => {
      resolveIfHistoryMatches();
    }, 10);

    const handleState = (roomState: RoomState) => {
      if (!predicate(roomState)) {
        return;
      }

      cleanup();
      resolve(roomState);
    };

    socket.on('room:state', handleState);
  });
}

function applyDrawingEventToRoomHistory(history: RoomState[], event: DrawingActionAppliedEvent): void {
  const currentState = history.at(-1);
  if (!currentState?.match?.currentTurn || currentState.code !== event.code) {
    return;
  }

  const nextState = structuredClone(currentState) as RoomState;
  const result = applyDrawingActionToState(nextState.match.currentTurn.drawing, event.action);
  if (!result.ok) {
    return;
  }

  if (event.stateRevision !== undefined) {
    nextState.stateRevision = event.stateRevision;
  } else if (nextState.stateRevision !== undefined) {
    nextState.stateRevision += 1;
  }

  history.push(nextState);
}

const GAME_RUNTIME = createServerGameRuntime(DEMO_GAME_PACK);

function createRealtimeGameServer(options: Parameters<typeof createGameServer>[0] = {}): GameServer {
  return createGameServer({
    ...options,
    gameRuntime: options.gameRuntime ?? GAME_RUNTIME,
  });
}

describe('room realtime flow', () => {
  let server: GameServer | null = null;
  const sockets: Socket[] = [];

  afterEach(async () => {
    await Promise.all(
      sockets.map(
        (socket) =>
          new Promise<void>((resolve) => {
            if (!socket.connected) {
              resolve();
              return;
            }

            socket.once('disconnect', () => resolve());
            socket.disconnect();
          }),
      ),
    );
    sockets.length = 0;

    if (server) {
      await server.stop();
      server = null;
    }
  });

  it('broadcasts the same lobby state after a second player joins', async () => {
    server = createRealtimeGameServer({
      appOrigin: 'http://localhost:4173',
      corsOrigin: '*',
    });
    const port = await server.start(0);
    const baseUrl = `http://127.0.0.1:${port}`;

    const hostSocket = ioClient(baseUrl, { transports: ['websocket'] });
    const guestSocket = ioClient(baseUrl, { transports: ['websocket'] });
    sockets.push(hostSocket, guestSocket);

    await Promise.all([
      new Promise<void>((resolve) => hostSocket.on('connect', () => resolve())),
      new Promise<void>((resolve) => guestSocket.on('connect', () => resolve())),
    ]);

    const createResult = await new Promise<{ ok: true; data: CreateRoomSuccess }>((resolve) => {
      hostSocket.emit('room:create', { nickname: 'Host' }, resolve);
    });

    const hostLobbyUpdatePromise = waitForState(hostSocket, (roomState) => roomState.players.length === 2);
    const guestLobbyUpdatePromise = waitForState(guestSocket, (roomState) => roomState.players.length === 2);

    const joinResult = await new Promise<{ ok: true; data: JoinRoomSuccess }>((resolve) => {
      guestSocket.emit('room:join', { code: createResult.data.room.code, nickname: 'Guest' }, resolve);
    });
    const [hostLobbyState, guestLobbyState] = await Promise.all([hostLobbyUpdatePromise, guestLobbyUpdatePromise]);

    expect(joinResult.data.room.players).toHaveLength(2);
    expect(hostLobbyState).toEqual(guestLobbyState);
    expect(hostLobbyState.players.map((player) => player.nickname)).toEqual(['Host', 'Guest']);
    expect(hostLobbyState.players.every((player) => player.reconnectBy === null)).toBe(true);
  });

  it('plays through the full match skeleton and lets the active drawer reroll once', async () => {
    server = createRealtimeGameServer({
      appOrigin: 'http://localhost:4173',
      corsOrigin: '*',
      countdownMs: 25,
      revealMs: 25,
      roundDurationOverrideMs: 40,
    });
    const port = await server.start(0);
    const baseUrl = `http://127.0.0.1:${port}`;

    const hostSocket = ioClient(baseUrl, { transports: ['websocket'] });
    const guestSocket = ioClient(baseUrl, { transports: ['websocket'] });
    sockets.push(hostSocket, guestSocket);

    await Promise.all([
      new Promise<void>((resolve) => hostSocket.on('connect', () => resolve())),
      new Promise<void>((resolve) => guestSocket.on('connect', () => resolve())),
    ]);

    const hostStates: RoomState[] = [];
    const guestStates: RoomState[] = [];
    hostSocket.on('room:state', (roomState: RoomState) => hostStates.push(roomState));
    guestSocket.on('room:state', (roomState: RoomState) => guestStates.push(roomState));
    hostSocket.on('room:drawingActionApplied', (event: DrawingActionAppliedEvent) => applyDrawingEventToRoomHistory(hostStates, event));
    guestSocket.on('room:drawingActionApplied', (event: DrawingActionAppliedEvent) => applyDrawingEventToRoomHistory(guestStates, event));

    const createResult = await new Promise<{ ok: true; data: CreateRoomSuccess }>((resolve) => {
      hostSocket.emit('room:create', { nickname: 'Host' }, resolve);
    });

    await new Promise<{ ok: true; data: JoinRoomSuccess }>((resolve) => {
      guestSocket.emit('room:join', { code: createResult.data.room.code, nickname: 'Guest' }, resolve);
    });

    await new Promise<ApiResult<UpdateLobbySettingsSuccess>>((resolve) => {
      hostSocket.emit(
        'room:updateSettings',
        {
          code: createResult.data.room.code,
          settings: {
            roundTimerSeconds: 60,
            firstCorrectGuessTimeCapSeconds: 30,
            turnsPerPlayer: 1,
            artEnabled: false,
          },
        },
        resolve,
      );
    });

    const startResult = await new Promise<ApiResult<StartRoomSuccess>>((resolve) => {
      hostSocket.emit('room:start', { code: createResult.data.room.code }, resolve);
    });

    expect(startResult.ok).toBe(true);

    if (!startResult.ok || !startResult.data.room.match?.currentTurn) {
      return;
    }

    const drawerPlayerId = startResult.data.room.match.currentTurn.drawerPlayerId;
    const drawerSocket = drawerPlayerId === createResult.data.playerId ? hostSocket : guestSocket;
    const otherSocket = drawerSocket === hostSocket ? guestSocket : hostSocket;

    const drawerCountdownState = await waitForState(
      drawerSocket,
      (roomState) => roomState.status === 'countdown' && roomState.match?.currentTurn?.promptVisibility === 'assigned',
      2_000,
      drawerSocket === hostSocket ? hostStates : guestStates,
    );
    const otherCountdownState = await waitForState(
      otherSocket,
      (roomState) => roomState.status === 'countdown' && roomState.match?.currentTurn?.promptVisibility === 'hidden',
      2_000,
      otherSocket === hostSocket ? hostStates : guestStates,
    );

    expect(drawerCountdownState.match?.currentTurn?.prompt).toBeTruthy();
    expect(otherCountdownState.match?.currentTurn?.prompt).toBeNull();

    const firstPrompt = drawerCountdownState.match?.currentTurn?.prompt;

    const rerollResult = await new Promise<ApiResult<RerollTurnSuccess>>((resolve) => {
      drawerSocket.emit('room:reroll', { code: createResult.data.room.code }, resolve);
    });

    expect(rerollResult.ok).toBe(true);

    if (!rerollResult.ok || !rerollResult.data.room.match?.currentTurn) {
      return;
    }

    expect(rerollResult.data.room.match.currentTurn.rerollsRemaining).toBe(0);
    expect(rerollResult.data.room.match.currentTurn.rerolledFrom).toBe(firstPrompt);
    expect(rerollResult.data.room.match.currentTurn.prompt).not.toBe(firstPrompt);

    const [hostPostgameState, guestPostgameState] = await Promise.all([
      waitForState(hostSocket, (roomState) => roomState.status === 'postgame', 2_000, hostStates),
      waitForState(guestSocket, (roomState) => roomState.status === 'postgame', 2_000, guestStates),
    ]);

    expect(hostPostgameState.match?.completedTurns).toHaveLength(2);
    expect(guestPostgameState.match?.completedTurns).toHaveLength(2);
    expect(hostPostgameState.match?.completedTurns.map((turn) => turn.drawerNickname).sort()).toEqual(['Guest', 'Host']);

    expect(hostStates.some((roomState) => roomState.status === 'countdown')).toBe(true);
    expect(hostStates.some((roomState) => roomState.status === 'round')).toBe(true);
    expect(hostStates.some((roomState) => roomState.status === 'reveal')).toBe(true);
    expect(hostStates.some((roomState) => roomState.status === 'postgame')).toBe(true);
    expect(guestStates.some((roomState) => roomState.status === 'countdown')).toBe(true);
    expect(guestStates.some((roomState) => roomState.status === 'round')).toBe(true);
    expect(guestStates.some((roomState) => roomState.status === 'reveal')).toBe(true);
    expect(guestStates.some((roomState) => roomState.status === 'postgame')).toBe(true);
  });

  it('returns viewer-specific prompt and art fields from room:getState for joined players', async () => {
    server = createRealtimeGameServer({
      appOrigin: 'http://localhost:4173',
      corsOrigin: '*',
      countdownMs: 25,
      revealMs: 25,
      roundDurationOverrideMs: 120,
      random: () => 0,
    });
    const port = await server.start(0);
    const baseUrl = `http://127.0.0.1:${port}`;

    const hostSocket = ioClient(baseUrl, { transports: ['websocket'] });
    const guestSocket = ioClient(baseUrl, { transports: ['websocket'] });
    sockets.push(hostSocket, guestSocket);

    await Promise.all([
      new Promise<void>((resolve) => hostSocket.on('connect', () => resolve())),
      new Promise<void>((resolve) => guestSocket.on('connect', () => resolve())),
    ]);

    const createResult = await new Promise<{ ok: true; data: CreateRoomSuccess }>((resolve) => {
      hostSocket.emit('room:create', { nickname: 'Host' }, resolve);
    });

    await new Promise<{ ok: true; data: JoinRoomSuccess }>((resolve) => {
      guestSocket.emit('room:join', { code: createResult.data.room.code, nickname: 'Guest' }, resolve);
    });

    const startResult = await new Promise<ApiResult<StartRoomSuccess>>((resolve) => {
      hostSocket.emit('room:start', { code: createResult.data.room.code }, resolve);
    });

    expect(startResult.ok).toBe(true);

    if (!startResult.ok || !startResult.data.room.match?.currentTurn) {
      return;
    }

    const drawerSocket =
      startResult.data.room.match.currentTurn.drawerPlayerId === createResult.data.playerId ? hostSocket : guestSocket;
    const otherSocket = drawerSocket === hostSocket ? guestSocket : hostSocket;

    const drawerState = await new Promise<ApiResult<{ room: RoomState }>>((resolve) => {
      drawerSocket.emit('room:getState', { code: createResult.data.room.code }, resolve);
    });
    const otherState = await new Promise<ApiResult<{ room: RoomState }>>((resolve) => {
      otherSocket.emit('room:getState', { code: createResult.data.room.code }, resolve);
    });

    expect(drawerState.ok).toBe(true);
    expect(otherState.ok).toBe(true);

    if (!drawerState.ok || !otherState.ok) {
      return;
    }

    expect(drawerState.data.room.match?.currentTurn?.promptVisibility).toBe('assigned');
    expect(drawerState.data.room.match?.currentTurn?.prompt).toBeTruthy();
    expect(drawerState.data.room.match?.currentTurn?.referenceArtUrl).toMatch(/^\/demo-assets\/.+\.svg$/);

    expect(otherState.data.room.match?.currentTurn?.promptVisibility).toBe('hidden');
    expect(otherState.data.room.match?.currentTurn?.prompt).toBeNull();
    expect(otherState.data.room.match?.currentTurn?.referenceArtUrl ?? null).toBeNull();
  });

  it('streams drawing updates live and exposes a final bitmap capture during reveal', async () => {
    server = createRealtimeGameServer({
      appOrigin: 'http://localhost:4173',
      corsOrigin: '*',
      countdownMs: 25,
      // Snapshot rendering uses a worker in this path, so the reveal window must outlive worker startup on CI.
      revealMs: 2_000,
      roundDurationOverrideMs: 120,
    });
    const port = await server.start(0);
    const baseUrl = `http://127.0.0.1:${port}`;

    const hostSocket = ioClient(baseUrl, { transports: ['websocket'] });
    const guestSocket = ioClient(baseUrl, { transports: ['websocket'] });
    sockets.push(hostSocket, guestSocket);

    await Promise.all([
      new Promise<void>((resolve) => hostSocket.on('connect', () => resolve())),
      new Promise<void>((resolve) => guestSocket.on('connect', () => resolve())),
    ]);

    const hostStates: RoomState[] = [];
    const guestStates: RoomState[] = [];
    hostSocket.on('room:state', (roomState: RoomState) => hostStates.push(roomState));
    guestSocket.on('room:state', (roomState: RoomState) => guestStates.push(roomState));
    hostSocket.on('room:drawingActionApplied', (event: DrawingActionAppliedEvent) => applyDrawingEventToRoomHistory(hostStates, event));
    guestSocket.on('room:drawingActionApplied', (event: DrawingActionAppliedEvent) => applyDrawingEventToRoomHistory(guestStates, event));

    const createResult = await new Promise<{ ok: true; data: CreateRoomSuccess }>((resolve) => {
      hostSocket.emit('room:create', { nickname: 'Host' }, resolve);
    });

    await new Promise<{ ok: true; data: JoinRoomSuccess }>((resolve) => {
      guestSocket.emit('room:join', { code: createResult.data.room.code, nickname: 'Guest' }, resolve);
    });

    const startResult = await new Promise<ApiResult<StartRoomSuccess>>((resolve) => {
      hostSocket.emit('room:start', { code: createResult.data.room.code }, resolve);
    });

    expect(startResult.ok).toBe(true);

    if (!startResult.ok || !startResult.data.room.match?.currentTurn) {
      return;
    }

    const drawerPlayerId = startResult.data.room.match.currentTurn.drawerPlayerId;
    const drawerSocket = drawerPlayerId === createResult.data.playerId ? hostSocket : guestSocket;
    const watcherSocket = drawerSocket === hostSocket ? guestSocket : hostSocket;
    const drawerHistory = drawerSocket === hostSocket ? hostStates : guestStates;
    const watcherHistory = watcherSocket === hostSocket ? hostStates : guestStates;

    await waitForState(drawerSocket, (roomState) => roomState.status === 'round', 2_000, drawerHistory);

    const beginResult = await new Promise<ApiResult<DrawingActionSuccess>>((resolve) => {
      drawerSocket.emit(
        'room:drawingAction',
        {
          code: createResult.data.room.code,
          action: {
            type: 'beginStroke',
            strokeId: 'stroke-1',
            tool: 'pen',
            color: '#101a35',
            size: 6,
            point: { x: 180, y: 120 },
          },
        },
        resolve,
      );
    });
    expect(beginResult.ok).toBe(true);
    if (beginResult.ok) {
      expect(beginResult.data.roomCode).toBe(createResult.data.room.code);
      expect(beginResult.data.revision).toBe(1);
      expect(beginResult.data.stateRevision).toBeGreaterThan(0);
    }

    const extendResult = await new Promise<ApiResult<DrawingActionSuccess>>((resolve) => {
      drawerSocket.emit(
        'room:drawingAction',
        {
          code: createResult.data.room.code,
          action: {
            type: 'extendStroke',
            strokeId: 'stroke-1',
            point: { x: 240, y: 220 },
          },
        },
        resolve,
      );
    });
    expect(extendResult.ok).toBe(true);
    if (extendResult.ok) {
      expect(extendResult.data.roomCode).toBe(createResult.data.room.code);
      expect(extendResult.data.revision).toBe(2);
      expect(extendResult.data.stateRevision).toBeGreaterThan(beginResult.ok ? beginResult.data.stateRevision ?? 0 : 0);
    }

    const endResult = await new Promise<ApiResult<DrawingActionSuccess>>((resolve) => {
      drawerSocket.emit(
        'room:drawingAction',
        {
          code: createResult.data.room.code,
          action: {
            type: 'endStroke',
            strokeId: 'stroke-1',
          },
        },
        resolve,
      );
    });
    expect(endResult.ok).toBe(true);
    if (endResult.ok) {
      expect(endResult.data.roomCode).toBe(createResult.data.room.code);
      expect(endResult.data.revision).toBe(3);
      expect(endResult.data.stateRevision).toBeGreaterThan(extendResult.ok ? extendResult.data.stateRevision ?? 0 : 0);
    }

    const watcherDrawingState = await waitForState(
      watcherSocket,
      (roomState) => roomState.match?.currentTurn?.drawing.operations.length === 1,
      2_000,
      watcherHistory,
    );

    expect(watcherDrawingState.match?.currentTurn?.drawing.activeStrokes).toEqual([]);

    const revealState = await waitForState(
      watcherSocket,
      (roomState) =>
        roomState.status === 'reveal' &&
        typeof roomState.match?.currentTurn?.drawing.snapshotDataUrl === 'string' &&
        typeof roomState.match?.completedTurns[0]?.finalImageDataUrl === 'string',
      3_000,
      watcherHistory,
    );

    expect(revealState.match?.currentTurn?.drawing.snapshotDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(revealState.match?.completedTurns[0]?.finalImageDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('broadcasts pause and resume state without advancing the frozen round timer', async () => {
    server = createRealtimeGameServer({
      appOrigin: 'http://localhost:4173',
      corsOrigin: '*',
      countdownMs: 25,
      revealMs: 25,
      roundDurationOverrideMs: 80,
      pauseMaxMs: 500,
      pauseCooldownMs: 50,
    });
    const port = await server.start(0);
    const baseUrl = `http://127.0.0.1:${port}`;

    const hostSocket = ioClient(baseUrl, { transports: ['websocket'] });
    const guestSocket = ioClient(baseUrl, { transports: ['websocket'] });
    sockets.push(hostSocket, guestSocket);

    await Promise.all([
      new Promise<void>((resolve) => hostSocket.on('connect', () => resolve())),
      new Promise<void>((resolve) => guestSocket.on('connect', () => resolve())),
    ]);

    const hostStates: RoomState[] = [];
    const guestStates: RoomState[] = [];
    hostSocket.on('room:state', (roomState: RoomState) => hostStates.push(roomState));
    guestSocket.on('room:state', (roomState: RoomState) => guestStates.push(roomState));

    const createResult = await new Promise<{ ok: true; data: CreateRoomSuccess }>((resolve) => {
      hostSocket.emit('room:create', { nickname: 'Host' }, resolve);
    });

    await new Promise<{ ok: true; data: JoinRoomSuccess }>((resolve) => {
      guestSocket.emit('room:join', { code: createResult.data.room.code, nickname: 'Guest' }, resolve);
    });

    await new Promise<ApiResult<StartRoomSuccess>>((resolve) => {
      hostSocket.emit('room:start', { code: createResult.data.room.code }, resolve);
    });

    await waitForState(hostSocket, (roomState) => roomState.status === 'round', 2_000, hostStates);

    const pauseResult = await new Promise<ApiResult<StartRoomSuccess>>((resolve) => {
      hostSocket.emit('room:pause', { code: createResult.data.room.code }, resolve);
    });
    expect(pauseResult.ok).toBe(true);

    const [hostPausedState, guestPausedState] = await Promise.all([
      waitForState(hostSocket, (roomState) => roomState.status === 'paused' && roomState.match?.pause?.mode === 'paused', 2_000, hostStates),
      waitForState(guestSocket, (roomState) => roomState.status === 'paused' && roomState.match?.pause?.mode === 'paused', 2_000, guestStates),
    ]);

    expect(hostPausedState.match?.pause).toMatchObject({ pausedPhase: 'round' });
    expect(guestPausedState.match?.pause).toMatchObject({ pausedPhase: 'round' });

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(hostStates.some((roomState) => roomState.status === 'reveal')).toBe(false);

    const resumeResult = await new Promise<ApiResult<StartRoomSuccess>>((resolve) => {
      hostSocket.emit('room:resume', { code: createResult.data.room.code }, resolve);
    });
    expect(resumeResult.ok).toBe(true);

    await Promise.all([
      waitForState(hostSocket, (roomState) => roomState.status === 'paused' && roomState.match?.pause?.mode === 'resuming', 2_000, hostStates),
      waitForState(guestSocket, (roomState) => roomState.status === 'paused' && roomState.match?.pause?.mode === 'resuming', 2_000, guestStates),
    ]);

    const resumedRound = await Promise.all([
      waitForState(
        hostSocket,
        (roomState) => roomState.status === 'round' && !roomState.match?.pause && Boolean(roomState.match?.pauseCooldownEndsAt),
        2_000,
        hostStates,
      ),
      waitForState(
        guestSocket,
        (roomState) => roomState.status === 'round' && !roomState.match?.pause && Boolean(roomState.match?.pauseCooldownEndsAt),
        2_000,
        guestStates,
      ),
    ]);

    expect(resumedRound[0].match?.pauseCooldownEndsAt).not.toBeNull();
    expect(resumedRound[1].match?.pauseCooldownEndsAt).not.toBeNull();
  });

  it('admits late joiners mid-match, adds them to the scoreboard immediately, and appends one tail turn', async () => {
    server = createRealtimeGameServer({
      appOrigin: 'http://localhost:4173',
      corsOrigin: '*',
      countdownMs: 25,
      revealMs: 25,
      roundDurationOverrideMs: 50,
      random: () => 0,
    });
    const port = await server.start(0);
    const baseUrl = `http://127.0.0.1:${port}`;

    const hostSocket = ioClient(baseUrl, { transports: ['websocket'] });
    const guestSocket = ioClient(baseUrl, { transports: ['websocket'] });
    const lateSocket = ioClient(baseUrl, { transports: ['websocket'] });
    sockets.push(hostSocket, guestSocket, lateSocket);

    await Promise.all([
      new Promise<void>((resolve) => hostSocket.on('connect', () => resolve())),
      new Promise<void>((resolve) => guestSocket.on('connect', () => resolve())),
      new Promise<void>((resolve) => lateSocket.on('connect', () => resolve())),
    ]);

    const hostStates: RoomState[] = [];
    const guestStates: RoomState[] = [];
    const lateStates: RoomState[] = [];
    hostSocket.on('room:state', (roomState: RoomState) => hostStates.push(roomState));
    guestSocket.on('room:state', (roomState: RoomState) => guestStates.push(roomState));
    lateSocket.on('room:state', (roomState: RoomState) => lateStates.push(roomState));

    const createResult = await new Promise<{ ok: true; data: CreateRoomSuccess }>((resolve) => {
      hostSocket.emit('room:create', { nickname: 'Host' }, resolve);
    });

    await new Promise<{ ok: true; data: JoinRoomSuccess }>((resolve) => {
      guestSocket.emit('room:join', { code: createResult.data.room.code, nickname: 'Guest' }, resolve);
    });

    await new Promise<ApiResult<UpdateLobbySettingsSuccess>>((resolve) => {
      hostSocket.emit(
        'room:updateSettings',
        {
          code: createResult.data.room.code,
          settings: {
            roundTimerSeconds: 60,
            firstCorrectGuessTimeCapSeconds: 30,
            turnsPerPlayer: 1,
            artEnabled: true,
          },
        },
        resolve,
      );
    });

    await new Promise<ApiResult<StartRoomSuccess>>((resolve) => {
      hostSocket.emit('room:start', { code: createResult.data.room.code }, resolve);
    });

    await waitForState(hostSocket, (roomState) => roomState.status === 'round', 2_000, hostStates);

    const lateJoinResult = await new Promise<ApiResult<JoinRoomSuccess>>((resolve) => {
      lateSocket.emit('room:join', { code: createResult.data.room.code, nickname: 'Late' }, resolve);
    });

    expect(lateJoinResult.ok).toBe(true);

    if (!lateJoinResult.ok || !lateJoinResult.data.room.match?.currentTurn) {
      return;
    }

    expect(lateJoinResult.data.room.match.currentTurn.totalTurns).toBe(3);
    expect(lateJoinResult.data.room.players.find((player) => player.id === lateJoinResult.data.playerId)).toMatchObject({
      nickname: 'Late',
      canGuessFromTurnNumber: 2,
    });
    expect(lateJoinResult.data.room.match.scoreboard).toEqual(
      expect.arrayContaining([expect.objectContaining({ playerId: lateJoinResult.data.playerId, nickname: 'Late', score: 0 })]),
    );

    const hostLateJoinState = await waitForState(
      hostSocket,
      (roomState) => roomState.players.some((player) => player.nickname === 'Late') && roomState.match?.currentTurn?.totalTurns === 3,
      2_000,
      hostStates,
    );
    const guestLateJoinState = await waitForState(
      guestSocket,
      (roomState) => roomState.players.some((player) => player.nickname === 'Late') && roomState.match?.currentTurn?.totalTurns === 3,
      2_000,
      guestStates,
    );

    expect(hostLateJoinState.players).toHaveLength(3);
    expect(guestLateJoinState.players).toHaveLength(3);

    const earlyGuess = await new Promise<ApiResult<SubmitMessageSuccess>>((resolve) => {
      lateSocket.emit('room:submitMessage', { code: createResult.data.room.code, text: 'archer' }, resolve);
    });

    expect(earlyGuess.ok).toBe(true);

    if (!earlyGuess.ok) {
      return;
    }

    expect(earlyGuess.data.room.match?.feed.at(-1)).toMatchObject({
      type: 'playerChat',
      text: 'archer',
    });
    expect(earlyGuess.data.room.match?.scoreboard.find((entry) => entry.playerId === lateJoinResult.data.playerId)?.score).toBe(0);

    await waitForState(
      lateSocket,
      (roomState) => roomState.status === 'round' && roomState.match?.currentTurn?.turnNumber === 2,
      2_000,
      lateStates,
    );

    const eligibleGuess = await new Promise<ApiResult<SubmitMessageSuccess>>((resolve) => {
      lateSocket.emit('room:submitMessage', { code: createResult.data.room.code, text: 'arrow' }, resolve);
    });

    expect(eligibleGuess.ok).toBe(true);

    if (!eligibleGuess.ok) {
      return;
    }

    expect(eligibleGuess.data.room.match?.feed.find((m) => m.type === 'correctGuess')).toMatchObject({
      type: 'correctGuess',
      visibility: 'self',
      answer: expect.any(String),
    });
    expect(eligibleGuess.data.room.match?.scoreboard.find((entry) => entry.playerId === lateJoinResult.data.playerId)?.score).toBeGreaterThan(0);

    const latePostgameState = await waitForState(lateSocket, (roomState) => roomState.status === 'postgame', 2_000, lateStates);

    expect(latePostgameState.match?.completedTurns).toHaveLength(3);
    expect(latePostgameState.match?.completedTurns.at(-1)?.drawerNickname).toBe('Late');
  });

  it('broadcasts a fresh countdown when the host starts a rematch from postgame', async () => {
    server = createRealtimeGameServer({
      appOrigin: 'http://localhost:4173',
      corsOrigin: '*',
      countdownMs: 25,
      revealMs: 25,
      roundDurationOverrideMs: 40,
    });
    const port = await server.start(0);
    const baseUrl = `http://127.0.0.1:${port}`;

    const hostSocket = ioClient(baseUrl, { transports: ['websocket'] });
    const guestSocket = ioClient(baseUrl, { transports: ['websocket'] });
    sockets.push(hostSocket, guestSocket);

    await Promise.all([
      new Promise<void>((resolve) => hostSocket.on('connect', () => resolve())),
      new Promise<void>((resolve) => guestSocket.on('connect', () => resolve())),
    ]);

    const hostStates: RoomState[] = [];
    const guestStates: RoomState[] = [];
    hostSocket.on('room:state', (roomState: RoomState) => hostStates.push(roomState));
    guestSocket.on('room:state', (roomState: RoomState) => guestStates.push(roomState));

    const createResult = await new Promise<{ ok: true; data: CreateRoomSuccess }>((resolve) => {
      hostSocket.emit('room:create', { nickname: 'Host' }, resolve);
    });

    await new Promise<{ ok: true; data: JoinRoomSuccess }>((resolve) => {
      guestSocket.emit('room:join', { code: createResult.data.room.code, nickname: 'Guest' }, resolve);
    });

    await new Promise<ApiResult<UpdateLobbySettingsSuccess>>((resolve) => {
      hostSocket.emit(
        'room:updateSettings',
        {
          code: createResult.data.room.code,
          settings: {
            roundTimerSeconds: 60,
            firstCorrectGuessTimeCapSeconds: 30,
            turnsPerPlayer: 1,
            artEnabled: true,
          },
        },
        resolve,
      );
    });

    await new Promise<ApiResult<StartRoomSuccess>>((resolve) => {
      hostSocket.emit('room:start', { code: createResult.data.room.code }, resolve);
    });

    await Promise.all([
      waitForState(hostSocket, (roomState) => roomState.status === 'postgame', 2_000, hostStates),
      waitForState(guestSocket, (roomState) => roomState.status === 'postgame', 2_000, guestStates),
    ]);

    hostStates.length = 0;
    guestStates.length = 0;

    const rematchResult = await new Promise<ApiResult<StartRoomSuccess>>((resolve) => {
      hostSocket.emit('room:start', { code: createResult.data.room.code }, resolve);
    });

    expect(rematchResult.ok).toBe(true);

    const [hostCountdownState, guestCountdownState] = await Promise.all([
      waitForState(
        hostSocket,
        (roomState) => roomState.status === 'countdown' && roomState.match?.completedTurns.length === 0,
        2_000,
        hostStates,
      ),
      waitForState(
        guestSocket,
        (roomState) => roomState.status === 'countdown' && roomState.match?.completedTurns.length === 0,
        2_000,
        guestStates,
      ),
    ]);

    expect(hostCountdownState.match?.currentTurn?.turnNumber).toBe(1);
    expect(guestCountdownState.match?.currentTurn?.turnNumber).toBe(1);
    expect(hostCountdownState.match?.scoreboard.every((entry) => entry.score === 0)).toBe(true);
    expect(guestCountdownState.match?.scoreboard.every((entry) => entry.score === 0)).toBe(true);
  });

  it('emits a kicked notice to the removed player and blocks further room actions on that socket', async () => {
    server = createRealtimeGameServer({
      appOrigin: 'http://localhost:4173',
      corsOrigin: '*',
    });
    const port = await server.start(0);
    const baseUrl = `http://127.0.0.1:${port}`;

    const hostSocket = ioClient(baseUrl, { transports: ['websocket'] });
    const guestSocket = ioClient(baseUrl, { transports: ['websocket'] });
    sockets.push(hostSocket, guestSocket);

    await Promise.all([
      new Promise<void>((resolve) => hostSocket.on('connect', () => resolve())),
      new Promise<void>((resolve) => guestSocket.on('connect', () => resolve())),
    ]);

    const hostStates: RoomState[] = [];
    hostSocket.on('room:state', (roomState: RoomState) => hostStates.push(roomState));

    const createResult = await new Promise<{ ok: true; data: CreateRoomSuccess }>((resolve) => {
      hostSocket.emit('room:create', { nickname: 'Host' }, resolve);
    });

    const joinResult = await new Promise<{ ok: true; data: JoinRoomSuccess }>((resolve) => {
      guestSocket.emit('room:join', { code: createResult.data.room.code, nickname: 'Guest' }, resolve);
    });

    const kickedNoticePromise = new Promise<{ roomCode: string; message: string }>((resolve) => {
      guestSocket.once('room:kicked', resolve);
    });

    const kickResult = await new Promise<{ ok: true; data: { kickedPlayerId: string } }>((resolve) => {
      hostSocket.emit('room:kick', { code: createResult.data.room.code, playerId: joinResult.data.playerId }, resolve);
    });

    expect(kickResult.ok).toBe(true);
    expect(kickResult.data.kickedPlayerId).toBe(joinResult.data.playerId);

    const kickedNotice = await kickedNoticePromise;
    expect(kickedNotice).toEqual({
      roomCode: createResult.data.room.code,
      message: 'You were removed from the room by the host.',
    });

    const hostKickState = await waitForState(hostSocket, (roomState) => roomState.players.length === 1, 2_000, hostStates);
    expect(hostKickState.players[0]?.nickname).toBe('Host');

    const guestMessageResult = await new Promise<ApiResult<{ room: RoomState }>>((resolve) => {
      guestSocket.emit('room:submitMessage', { code: createResult.data.room.code, text: 'still here' }, resolve);
    });

    expect(guestMessageResult.ok).toBe(false);

    if (!guestMessageResult.ok) {
      expect(guestMessageResult.error.code).toBe('ROOM_NOT_FOUND');
    }
  });

  it('reclaims a reserved seat on a new socket and migrates host to a connected player', async () => {
    server = createRealtimeGameServer({
      appOrigin: 'http://localhost:4173',
      corsOrigin: '*',
      reconnectGraceMs: 1_000,
    });
    const port = await server.start(0);
    const baseUrl = `http://127.0.0.1:${port}`;

    const hostSocket = ioClient(baseUrl, { transports: ['websocket'] });
    const guestSocket = ioClient(baseUrl, { transports: ['websocket'] });
    sockets.push(hostSocket, guestSocket);

    await Promise.all([
      new Promise<void>((resolve) => hostSocket.on('connect', () => resolve())),
      new Promise<void>((resolve) => guestSocket.on('connect', () => resolve())),
    ]);

    const guestStates: RoomState[] = [];
    guestSocket.on('room:state', (roomState: RoomState) => guestStates.push(roomState));

    const createResult = await new Promise<{ ok: true; data: CreateRoomSuccess }>((resolve) => {
      hostSocket.emit('room:create', { nickname: 'Host' }, resolve);
    });

    const joinResult = await new Promise<{ ok: true; data: JoinRoomSuccess }>((resolve) => {
      guestSocket.emit('room:join', { code: createResult.data.room.code, nickname: 'Guest' }, resolve);
    });

    await new Promise<ApiResult<StartRoomSuccess>>((resolve) => {
      hostSocket.emit('room:start', { code: createResult.data.room.code }, resolve);
    });

    const guestDisconnectViewPromise = waitForState(
      guestSocket,
      (roomState) => {
        const hostPlayer = roomState.players.find((player) => player.id === createResult.data.playerId);
        const guestPlayer = roomState.players.find((player) => player.id === joinResult.data.playerId);
        return roomState.status === 'countdown' && hostPlayer?.connected === false && guestPlayer?.isHost === true;
      },
      2_000,
      guestStates,
    );

    hostSocket.disconnect();

    const guestDisconnectView = await guestDisconnectViewPromise;
    const disconnectedHost = guestDisconnectView.players.find((player) => player.id === createResult.data.playerId);
    expect(disconnectedHost?.reconnectBy).not.toBeNull();

    const reclaimedSocket = ioClient(baseUrl, { transports: ['websocket'] });
    sockets.push(reclaimedSocket);
    await new Promise<void>((resolve) => reclaimedSocket.on('connect', () => resolve()));

    const reclaimResult = await new Promise<ApiResult<ReclaimRoomSuccess>>((resolve) => {
      reclaimedSocket.emit(
        'room:reclaim',
        { code: createResult.data.room.code, sessionToken: createResult.data.sessionToken },
        resolve,
      );
    });

    expect(reclaimResult.ok).toBe(true);

    if (!reclaimResult.ok) {
      return;
    }

    expect(reclaimResult.data.playerId).toBe(createResult.data.playerId);
    const reclaimedPlayer = reclaimResult.data.room.players.find((player) => player.id === createResult.data.playerId);
    const guestPlayer = reclaimResult.data.room.players.find((player) => player.id === joinResult.data.playerId);

    expect(reclaimedPlayer).toMatchObject({
      nickname: 'Host',
      connected: true,
      reconnectBy: null,
      isHost: false,
    });
    expect(guestPlayer?.isHost).toBe(true);
  });
});
