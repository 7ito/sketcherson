import { MAX_PLAYERS_PER_ROOM, type LobbySettings } from '@sketcherson/common/room';
import type { DrawingAction } from '@sketcherson/common/drawing';
import { defineGamePack, defineDrawingGameRules } from '@sketcherson/common/game';
import { TEST_GAME_DEFINITION } from '@sketcherson/common/testing/testGame';
import { DEMO_GAME_DEFINITION, DEMO_GAME_PACK } from '@sketcherson/demo-game';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RoomRuntime, type RoomRuntimeOptions } from '../src/domain/roomRuntime';

afterEach(() => {
  vi.useRealTimers();
});

class RoomRuntimeTestDriver {
  public constructor(private readonly runtime: RoomRuntime) {}

  public createRoom(nickname: string, connectionId: string, origin: string) {
    return this.runtime.createRoom({ nickname, connectionId, origin });
  }

  public joinRoom(code: string, nickname: string, connectionId: string, origin: string) {
    return this.runtime.joinRoom({ code, nickname, connectionId, origin });
  }

  public reclaimRoom(code: string, sessionToken: string, connectionId: string, origin: string) {
    return this.runtime.reclaimRoom({ code, sessionToken, connectionId, origin });
  }

  public updateLobbySettings(connectionId: string, settings: LobbySettings, origin: string) {
    return this.runtime.updateLobbySettings({ connectionId, origin, payload: { settings } });
  }

  public startRoom(connectionId: string, origin: string) {
    return this.runtime.startRoom({ connectionId, origin });
  }

  public pauseRoom(connectionId: string, origin: string) {
    return this.runtime.pauseRoom({ connectionId, origin });
  }

  public resumeRoom(connectionId: string, origin: string) {
    return this.runtime.resumeRoom({ connectionId, origin });
  }

  public kickPlayer(connectionId: string, playerId: string, origin: string) {
    const result = this.runtime.kickPlayer({ connectionId, origin, payload: { playerId } });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true as const,
      data: result.data,
      kickedSocketId: result.kickedConnectionId,
    };
  }

  public rerollTurn(connectionId: string, origin: string) {
    return this.runtime.rerollTurn({ connectionId, origin });
  }

  public submitMessage(connectionId: string, text: string, origin: string) {
    return this.runtime.submitMessage({ connectionId, origin, payload: { text } });
  }

  public applyDrawingAction(connectionId: string, action: DrawingAction, origin: string) {
    return this.runtime.applyDrawingAction({ connectionId, origin, payload: { action } });
  }

  public applyLobbyDrawingAction(connectionId: string, action: DrawingAction, origin: string) {
    return this.runtime.applyLobbyDrawingAction({ connectionId, origin, payload: { action } });
  }

  public getRoomState(code: string, origin: string) {
    return this.runtime.getRoomState({ code, origin });
  }

  public getRoomStateForSocket(connectionId: string, code: string, origin: string) {
    return this.runtime.getRoomState({ viewerConnectionId: connectionId, code, origin });
  }

  public getBroadcastTargets(code: string, origin: string) {
    return this.runtime.getBroadcastTargets({ code, origin }).map((target) => ({
      socketId: target.connectionId,
      room: target.room,
    }));
  }

  public disconnect(connectionId: string) {
    return this.runtime.disconnect({ connectionId });
  }
}

function createRoomRuntimeDriver(options?: Partial<RoomRuntimeOptions>): RoomRuntimeTestDriver {
  return new RoomRuntimeTestDriver(new RoomRuntime({
    ...(options?.gameDefinition && !options.gamePack ? {} : { gamePack: DEMO_GAME_PACK }),
    ...options,
  }));
}

function createSequentialIds(ids: string[]): { randomUUID(): string } {
  return {
    randomUUID: () => {
      const nextId = ids.shift();

      if (!nextId) {
        throw new Error('Expected another deterministic id');
      }

      return nextId;
    },
  };
}

function createManualScheduler() {
  interface ScheduledTimer {
    handle: ReturnType<typeof setTimeout>;
    callback: () => void;
    delayMs: number;
    active: boolean;
  }

  const timers: ScheduledTimer[] = [];
  let nextHandle = 0;

  return {
    adapter: {
      setTimeout(callback: () => void, delayMs: number) {
        const timer: ScheduledTimer = {
          handle: { id: nextHandle } as ReturnType<typeof setTimeout>,
          callback,
          delayMs,
          active: true,
        };
        nextHandle += 1;
        timers.push(timer);
        return timer.handle;
      },
      clearTimeout(handle: ReturnType<typeof setTimeout>) {
        const timer = timers.find((candidate) => candidate.handle === handle);

        if (timer) {
          timer.active = false;
        }
      },
    },
    activeDelays() {
      return timers.filter((timer) => timer.active).map((timer) => timer.delayMs);
    },
    runNext() {
      const timer = timers.find((candidate) => candidate.active);

      if (!timer) {
        throw new Error('Expected a scheduled timer');
      }

      timer.active = false;
      timer.callback();
    },
  };
}

describe('RoomRuntime', () => {
  it('uses game rules for player limits and reroll availability', () => {
    const gamePack = defineGamePack({
      definition: TEST_GAME_DEFINITION,
      rules: defineDrawingGameRules({
        players: { maxPerRoom: 2 },
        turns: { rerollsPerTurn: 0 },
      }),
    });
    const driver = createRoomRuntimeDriver({
      gamePack,
      random: () => 0,
      ids: createSequentialIds([
        'host-id',
        'host-session',
        'guest-id',
        'guest-session',
        'extra-id',
        'extra-session',
        'host-joined-feed',
        'guest-joined-feed',
        'round-header-feed',
        'drawer-assigned-feed',
      ]),
    });

    const created = driver.createRoom('Host', 'host-socket', 'origin');
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const joined = driver.joinRoom(created.data.room.code, 'Guest', 'guest-socket', 'origin');
    expect(joined.ok).toBe(true);

    const blockedJoin = driver.joinRoom(created.data.room.code, 'Third', 'third-socket', 'origin');
    expect(blockedJoin.ok).toBe(false);
    expect(blockedJoin.ok ? null : blockedJoin.error.code).toBe('ROOM_FULL');

    const started = driver.startRoom('host-socket', 'origin');
    expect(started.ok).toBe(true);

    const hostReroll = driver.rerollTurn('host-socket', 'origin');
    const guestReroll = driver.rerollTurn('guest-socket', 'origin');
    const drawerReroll = [hostReroll, guestReroll].find((result) => !result.ok && result.error.code !== 'NOT_DRAWER');
    expect(drawerReroll?.ok).toBe(false);
    expect(drawerReroll?.ok ? null : drawerReroll?.error.code).toBe('REROLL_UNAVAILABLE');
  });

  it('uses game feature rules for lobby drawing, pause, and reference art visibility', () => {
    const gamePack = defineGamePack({
      definition: TEST_GAME_DEFINITION,
      rules: defineDrawingGameRules({
        features: {
          lobbyDrawing: false,
          pause: false,
          referenceArt: 'drawer-only',
        },
      }),
    });
    const scheduler = createManualScheduler();
    const driver = createRoomRuntimeDriver({
      gamePack,
      scheduler: scheduler.adapter,
      random: () => 0,
      ids: createSequentialIds([
        'host-id',
        'host-session',
        'guest-id',
        'guest-session',
        'host-joined-feed',
        'guest-joined-feed',
        'round-header-feed',
        'drawer-assigned-feed',
        'correct-guess-feed',
        'round-ended-feed',
        'round-score-feed',
        'next-round-feed',
        'reveal-feed',
      ]),
    });

    const created = driver.createRoom('Host', 'host-socket', 'origin');
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    expect(created.data.room.lobbyDrawing).toBeNull();
    const lobbyDrawing = driver.applyLobbyDrawingAction('host-socket', {
      type: 'beginStroke',
      strokeId: 'blocked-stroke',
      tool: 'pen',
      color: '#101a35',
      size: 6,
      point: { x: 20, y: 20 },
    }, 'origin');
    expect(lobbyDrawing.ok).toBe(false);
    expect(lobbyDrawing.ok ? null : lobbyDrawing.error.code).toBe('INVALID_STATE');

    expect(driver.joinRoom(created.data.room.code, 'Guest', 'guest-socket', 'origin').ok).toBe(true);
    const started = driver.startRoom('host-socket', 'origin');
    expect(started.ok).toBe(true);
    if (!started.ok) {
      return;
    }

    const pause = driver.pauseRoom('host-socket', 'origin');
    expect(pause.ok).toBe(false);
    expect(pause.ok ? null : pause.error.code).toBe('INVALID_STATE');

    const hostState = driver.getRoomStateForSocket('host-socket', created.data.room.code, 'origin');
    const guestState = driver.getRoomStateForSocket('guest-socket', created.data.room.code, 'origin');
    expect(hostState.ok).toBe(true);
    expect(guestState.ok).toBe(true);
    if (!hostState.ok || !guestState.ok) {
      return;
    }

    const drawerSocket = hostState.data.room.match?.currentTurn?.drawerPlayerId === created.data.playerId ? 'host-socket' : 'guest-socket';
    const guesserSocket = drawerSocket === 'host-socket' ? 'guest-socket' : 'host-socket';
    const drawerState = drawerSocket === 'host-socket' ? hostState.data.room : guestState.data.room;
    const guesserState = drawerSocket === 'host-socket' ? guestState.data.room : hostState.data.room;
    const answer = drawerState.match?.currentTurn?.prompt;

    expect(drawerState.match?.currentTurn?.referenceArtUrl).toBe('/Dragon.png');
    expect(guesserState.match?.currentTurn?.referenceArtUrl).toBeNull();
    expect(answer).toBeTruthy();

    scheduler.runNext();
    const guessed = driver.submitMessage(guesserSocket, answer ?? '', 'origin');
    expect(guessed.ok).toBe(true);

    const revealForDrawer = driver.getRoomStateForSocket(drawerSocket, created.data.room.code, 'origin');
    expect(revealForDrawer.ok).toBe(true);
    if (!revealForDrawer.ok) {
      return;
    }

    expect(revealForDrawer.data.room.status).toBe('reveal');
    expect(revealForDrawer.data.room.match?.currentTurn?.referenceArtUrl).toBeNull();
  });

  it('uses game rules for scoring policy', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    const gamePack = defineGamePack({
      definition: TEST_GAME_DEFINITION,
      rules: defineDrawingGameRules({
        scoring: {
          drawerPointsPerCorrectGuess: 25,
          guesserPoints: () => 77,
          endRoundWhenAllGuessersCorrect: false,
          capRoundAfterFirstCorrectGuess: false,
        },
      }),
    });
    const driver = createRoomRuntimeDriver({
      gamePack,
      random: () => 0,
      ids: createSequentialIds([
        'host-id',
        'host-session',
        'guest-id',
        'guest-session',
        'host-joined-feed',
        'guest-joined-feed',
        'round-header-feed',
        'countdown-feed',
        'round-header-feed-2',
        'drawer-assigned-feed',
        'drawer-view-id',
        'correct-feed',
      ]),
    });

    const created = driver.createRoom('Host', 'host-socket', 'origin');
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const joined = driver.joinRoom(created.data.room.code, 'Guest', 'guest-socket', 'origin');
    expect(joined.ok).toBe(true);
    const started = driver.startRoom('host-socket', 'origin');
    expect(started.ok).toBe(true);
    if (!joined.ok || !started.ok || !started.data.room.match?.currentTurn) {
      return;
    }

    vi.advanceTimersByTime(3000);

    const liveState = driver.getRoomState(created.data.room.code, 'origin');
    expect(liveState.ok).toBe(true);
    const drawerPlayerId = (liveState.ok ? liveState.data.room.match?.currentTurn?.drawerPlayerId : null) ?? started.data.room.match.currentTurn.drawerPlayerId;
    const drawerSocketId = drawerPlayerId === created.data.playerId ? 'host-socket' : 'guest-socket';
    const drawerState = driver.getRoomStateForSocket(drawerSocketId, created.data.room.code, 'origin');
    const prompt = drawerState.ok ? drawerState.data.room.match?.currentTurn?.prompt : null;
    const guesser = drawerPlayerId === created.data.playerId
      ? { playerId: joined.data.playerId, socketId: 'guest-socket' }
      : { playerId: created.data.playerId, socketId: 'host-socket' };

    const guessed = driver.submitMessage(guesser.socketId, prompt ?? 'Dragon', 'origin');
    expect(guessed.ok).toBe(true);
    if (!guessed.ok || !guessed.data.room.match?.currentTurn) {
      return;
    }

    const guesserScore = guessed.data.room.match.scoreboard.find((entry) => entry.playerId === guesser.playerId)?.score;
    const drawerScore = guessed.data.room.match.scoreboard.find((entry) => entry.playerId === drawerPlayerId)?.score;

    expect(guesserScore).toBe(77);
    expect(drawerScore).toBe(25);
    expect(guessed.data.room.status).toBe('round');
    expect(guessed.data.room.match.phaseEndsAt).toBe(liveState.ok ? liveState.data.room.match?.phaseEndsAt : null);
  });

  it('returns a room creation outcome with a transport join effect', () => {
    const runtime = new RoomRuntime({ gamePack: DEMO_GAME_PACK, random: () => 0 });
    const outcome = runtime.createRoomOutcome({
      nickname: 'Host',
      connectionId: 'socket-host',
      origin: 'https://sketcherson.example',
    });

    expect(outcome.response.ok).toBe(true);
    expect(outcome.effects).toEqual([
      {
        type: 'joinTransportRoom',
        connectionId: 'socket-host',
        roomCode: outcome.response.ok ? outcome.response.data.room.code : '',
      },
      {
        type: 'broadcastRoomState',
        roomCode: outcome.response.ok ? outcome.response.data.room.code : '',
        targets: expect.any(Array),
      },
    ]);
  });

  it('returns join and reclaim outcomes with transport join and room state broadcast effects', () => {
    const runtime = new RoomRuntime({ gamePack: DEMO_GAME_PACK, random: () => 0 });
    const origin = 'https://sketcherson.example';
    const createOutcome = runtime.createRoomOutcome({ nickname: 'Host', connectionId: 'socket-host', origin });

    expect(createOutcome.response.ok).toBe(true);
    if (!createOutcome.response.ok) {
      return;
    }

    const joinOutcome = runtime.joinRoomOutcome({
      code: createOutcome.response.data.room.code,
      nickname: 'Guest',
      connectionId: 'socket-guest',
      origin,
    });

    expect(joinOutcome.response.ok).toBe(true);
    expect(joinOutcome.effects.map((effect) => effect.type)).toEqual(['joinTransportRoom', 'broadcastRoomState']);
    expect(joinOutcome.effects[0]).toEqual({
      type: 'joinTransportRoom',
      connectionId: 'socket-guest',
      roomCode: createOutcome.response.data.room.code,
    });

    const hostSessionToken = createOutcome.response.data.sessionToken;
    runtime.disconnect({ connectionId: 'socket-host' });
    const reclaimOutcome = runtime.reclaimRoomOutcome({
      code: createOutcome.response.data.room.code,
      sessionToken: hostSessionToken,
      connectionId: 'socket-host-new',
      origin,
    });

    expect(reclaimOutcome.response.ok).toBe(true);
    expect(reclaimOutcome.effects.map((effect) => effect.type)).toEqual(['joinTransportRoom', 'broadcastRoomState']);
    expect(reclaimOutcome.effects[0]).toEqual({
      type: 'joinTransportRoom',
      connectionId: 'socket-host-new',
      roomCode: createOutcome.response.data.room.code,
    });
  });

  it('returns kick outcomes with leave, kicked notice, and room state broadcast effects', () => {
    const runtime = new RoomRuntime({ gamePack: DEMO_GAME_PACK, random: () => 0 });
    const origin = 'https://sketcherson.example';
    const createOutcome = runtime.createRoomOutcome({ nickname: 'Host', connectionId: 'socket-host', origin });

    expect(createOutcome.response.ok).toBe(true);
    if (!createOutcome.response.ok) {
      return;
    }

    const joinOutcome = runtime.joinRoomOutcome({
      code: createOutcome.response.data.room.code,
      nickname: 'Guest',
      connectionId: 'socket-guest',
      origin,
    });

    expect(joinOutcome.response.ok).toBe(true);
    if (!joinOutcome.response.ok) {
      return;
    }

    const kickOutcome = runtime.kickPlayerOutcome({
      connectionId: 'socket-host',
      origin,
      payload: { playerId: joinOutcome.response.data.playerId },
    });

    expect(kickOutcome.response.ok).toBe(true);
    expect(kickOutcome.effects).toEqual([
      { type: 'leaveTransportRoom', connectionId: 'socket-guest', roomCode: createOutcome.response.data.room.code },
      {
        type: 'emit',
        connectionId: 'socket-guest',
        event: 'room:kicked',
        payload: {
          roomCode: createOutcome.response.data.room.code,
          message: 'You were removed from the room by the host.',
        },
      },
      {
        type: 'broadcastRoomState',
        roomCode: createOutcome.response.data.room.code,
        targets: expect.any(Array),
      },
    ]);
  });

  it('uses an injected game definition for default settings, prompt assignment, art, and guesses', () => {
    vi.useFakeTimers();

    const service = createRoomRuntimeDriver({ countdownMs: 25, gameDefinition: TEST_GAME_DEFINITION, random: () => 0 });
    const createResult = service.createRoom('Host', 'socket-1', 'https://sketcherson.example');

    expect(createResult.ok).toBe(true);
    if (!createResult.ok) {
      return;
    }
    expect(createResult.data.room.settings.enabledCollectionIds).toEqual(['creatures', 'objects']);

    const joinResult = service.joinRoom(createResult.data.room.code, 'Guest', 'socket-2', 'https://sketcherson.example');
    expect(joinResult.ok).toBe(true);
    const startResult = service.startRoom('socket-1', 'https://sketcherson.example');
    expect(startResult.ok).toBe(true);
    vi.advanceTimersByTime(30);

    const drawerState = service.getRoomStateForSocket('socket-2', createResult.data.room.code, 'https://sketcherson.example');
    expect(drawerState.ok).toBe(true);
    if (!drawerState.ok) {
      return;
    }
    expect(drawerState.data.room.match?.currentTurn?.prompt).toBe('Dragon');
    expect(drawerState.data.room.match?.currentTurn?.referenceArtUrl).toBe('/Dragon.png');

    const guessResult = service.submitMessage('socket-1', 'drake', 'https://sketcherson.example');
    expect(guessResult.ok).toBe(true);
    if (!guessResult.ok) {
      return;
    }
    expect(guessResult.data.room.match?.currentTurn?.correctGuessPlayerIds).toContain(createResult.data.playerId);
  });

  it('creates a room with a host, a reclaimable session, and default settings', () => {
    const service = createRoomRuntimeDriver();
    const result = service.createRoom('Tito', 'socket-1', 'https://sketcherson.example');

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.data.playerId).toBeTruthy();
    expect(result.data.sessionToken).toBeTruthy();
    expect(result.data.room.code).toHaveLength(6);
    expect(result.data.room.shareUrl).toBe(`https://sketcherson.example/room/${result.data.room.code}`);
    expect(result.data.room.players).toHaveLength(1);
    expect(result.data.room.match).toBeNull();
    expect(result.data.room.settings).toEqual({
      roundTimerSeconds: 90,
      firstCorrectGuessTimeCapSeconds: 30,
      guessingDelaySeconds: 0,
      turnsPerPlayer: 3,
      artEnabled: true,
      enabledCollectionIds: ['troop', 'building', 'spell'],
    });
    expect(result.data.room.players[0]).toMatchObject({
      nickname: 'Tito',
      isHost: true,
      connected: true,
      reconnectBy: null,
    });
  });

  it('uses injected ids for players, sessions, and chat messages', () => {
    const service = createRoomRuntimeDriver({
      random: () => 0,
      ids: createSequentialIds([
        'host-player-id',
        'host-session-token',
        'host-lobby-message-id',
        'guest-player-id',
        'guest-session-token',
        'guest-lobby-message-id',
        'host-start-message-id',
        'guest-start-message-id',
        'round-header-message-id',
        'drawing-message-id',
      ]),
    });

    const createResult = service.createRoom('Host', 'socket-1', 'https://sketcherson.example');
    expect(createResult.ok).toBe(true);

    if (!createResult.ok) {
      return;
    }

    expect(createResult.data.playerId).toBe('host-player-id');
    expect(createResult.data.sessionToken).toBe('host-session-token');
    expect(createResult.data.room.players[0]?.id).toBe('host-player-id');
    expect(createResult.data.room.lobbyFeed.map((message) => message.id)).toEqual(['host-lobby-message-id']);
    expect(createResult.data.room.lobbyFeed).toEqual([
      {
        id: 'host-lobby-message-id',
        createdAt: expect.any(Number),
        turnNumber: null,
        type: 'system',
        event: { type: 'playerJoined', nickname: 'Host' },
      },
    ]);

    const joinResult = service.joinRoom(createResult.data.room.code, 'Guest', 'socket-2', 'https://sketcherson.example');
    expect(joinResult.ok).toBe(true);

    if (!joinResult.ok) {
      return;
    }

    expect(joinResult.data.playerId).toBe('guest-player-id');
    expect(joinResult.data.sessionToken).toBe('guest-session-token');
    expect(joinResult.data.room.lobbyFeed.map((message) => message.id)).toEqual([
      'host-lobby-message-id',
      'guest-lobby-message-id',
    ]);
    expect(joinResult.data.room.lobbyFeed?.map((item) => item.type)).toEqual(['system', 'system']);

    const startResult = service.startRoom('socket-1', 'https://sketcherson.example');
    expect(startResult.ok).toBe(true);

    if (!startResult.ok) {
      return;
    }

    expect(startResult.data.room.match?.feed.map((message) => message.id)).toEqual([
      'host-start-message-id',
      'guest-start-message-id',
      'round-header-message-id',
      'drawing-message-id',
    ]);
    expect(startResult.data.room.match?.feed?.map((item) => item.type)).toEqual([
      'system',
      'system',
      'roundHeader',
      'system',
    ]);
    expect(startResult.data.room.match?.feed?.at(-1)).toMatchObject({
      type: 'system',
      event: { type: 'drawerAssigned' },
    });
  });

  it('trims nicknames and blocks case-insensitive duplicates within a room', () => {
    const service = createRoomRuntimeDriver();
    const createResult = service.createRoom('  Tito  ', 'socket-1', 'https://sketcherson.example');

    if (!createResult.ok) {
      throw new Error('Expected room creation to succeed');
    }

    expect(createResult.data.room.players[0]?.nickname).toBe('Tito');

    const duplicateJoinResult = service.joinRoom(
      createResult.data.room.code,
      '  tito ',
      'socket-2',
      'https://sketcherson.example',
    );

    expect(duplicateJoinResult.ok).toBe(false);

    if (duplicateJoinResult.ok) {
      return;
    }

    expect(duplicateJoinResult.error.code).toBe('NICKNAME_TAKEN');
  });

  it('blocks profane nicknames', () => {
    const service = createRoomRuntimeDriver();
    const result = service.createRoom('shitlord', 'socket-1', 'https://sketcherson.example');

    expect(result.ok).toBe(false);

    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe('INVALID_NICKNAME');
  });

  it('lets only the host update lobby settings', () => {
    const service = createRoomRuntimeDriver();
    const createResult = service.createRoom('Host', 'socket-1', 'https://sketcherson.example');

    if (!createResult.ok) {
      throw new Error('Expected room creation to succeed');
    }

    const joinResult = service.joinRoom(createResult.data.room.code, 'Guest', 'socket-2', 'https://sketcherson.example');

    if (!joinResult.ok) {
      throw new Error('Expected room join to succeed');
    }

    const guestUpdate = service.updateLobbySettings(
      'socket-2',
      {
        roundTimerSeconds: 120,
        firstCorrectGuessTimeCapSeconds: 30,
        turnsPerPlayer: 5,
        artEnabled: false,
      },
      'https://sketcherson.example',
    );

    expect(guestUpdate.ok).toBe(false);

    if (guestUpdate.ok) {
      return;
    }

    expect(guestUpdate.error.code).toBe('FORBIDDEN');
  });

  it('rejects first-correct-guess timer caps that exceed the round timer', () => {
    const service = createRoomRuntimeDriver();
    const createResult = service.createRoom('Host', 'socket-1', 'https://sketcherson.example');

    if (!createResult.ok) {
      throw new Error('Expected room creation to succeed');
    }

    const settingsUpdate = service.updateLobbySettings(
      'socket-1',
      {
        roundTimerSeconds: 60,
        firstCorrectGuessTimeCapSeconds: 75,
        turnsPerPlayer: 3,
        artEnabled: true,
      },
      'https://sketcherson.example',
    );

    expect(settingsUpdate.ok).toBe(false);

    if (settingsUpdate.ok) {
      return;
    }

    expect(settingsUpdate.error.code).toBe('INVALID_SETTINGS');
  });

  it('lets multiple players draw in the lobby at the same time', () => {
    const service = createRoomRuntimeDriver();
    const createResult = service.createRoom('Host', 'socket-1', 'https://sketcherson.example');

    if (!createResult.ok) {
      throw new Error('Expected room creation to succeed');
    }

    const joinResult = service.joinRoom(createResult.data.room.code, 'Guest', 'socket-2', 'https://sketcherson.example');

    if (!joinResult.ok) {
      throw new Error('Expected room join to succeed');
    }

    expect(
      service.applyLobbyDrawingAction(
        'socket-1',
        {
          type: 'beginStroke',
          strokeId: 'host-stroke',
          tool: 'pen',
          color: '#101a35',
          size: 6,
          point: { x: 20, y: 20 },
        },
        'https://sketcherson.example',
      ).ok,
    ).toBe(true);

    expect(
      service.applyLobbyDrawingAction(
        'socket-2',
        {
          type: 'beginStroke',
          strokeId: 'guest-stroke',
          tool: 'pen',
          color: '#2d56ff',
          size: 8,
          point: { x: 120, y: 120 },
        },
        'https://sketcherson.example',
      ).ok,
    ).toBe(true);

    expect(
      service.applyLobbyDrawingAction(
        'socket-1',
        {
          type: 'extendStroke',
          strokeId: 'host-stroke',
          point: { x: 40, y: 45 },
        },
        'https://sketcherson.example',
      ).ok,
    ).toBe(true);

    expect(
      service.applyLobbyDrawingAction(
        'socket-2',
        {
          type: 'extendStroke',
          strokeId: 'guest-stroke',
          point: { x: 140, y: 145 },
        },
        'https://sketcherson.example',
      ).ok,
    ).toBe(true);

    expect(
      service.applyLobbyDrawingAction(
        'socket-2',
        {
          type: 'endStroke',
          strokeId: 'guest-stroke',
        },
        'https://sketcherson.example',
      ).ok,
    ).toBe(true);

    expect(
      service.applyLobbyDrawingAction(
        'socket-1',
        {
          type: 'extendStroke',
          strokeId: 'host-stroke',
          point: { x: 60, y: 70 },
        },
        'https://sketcherson.example',
      ).ok,
    ).toBe(true);

    expect(
      service.applyLobbyDrawingAction(
        'socket-1',
        {
          type: 'endStroke',
          strokeId: 'host-stroke',
        },
        'https://sketcherson.example',
      ).ok,
    ).toBe(true);

    const roomStateResult = service.getRoomState(createResult.data.room.code, 'https://sketcherson.example');
    expect(roomStateResult.ok).toBe(true);

    if (!roomStateResult.ok || !roomStateResult.data.room.lobbyDrawing) {
      return;
    }

    expect(roomStateResult.data.room.lobbyDrawing.activeStrokes).toEqual([]);
    expect(roomStateResult.data.room.lobbyDrawing.operations).toHaveLength(2);
    expect(roomStateResult.data.room.lobbyDrawing.operations[0]).toMatchObject({ kind: 'stroke', id: 'guest-stroke' });
    expect(roomStateResult.data.room.lobbyDrawing.operations[1]).toMatchObject({ kind: 'stroke', id: 'host-stroke' });
  });

  it('starts a playable match loop with a drawer-only prompt and one reroll', () => {
    const service = createRoomRuntimeDriver();
    const createResult = service.createRoom('Host', 'socket-1', 'https://sketcherson.example');

    if (!createResult.ok) {
      throw new Error('Expected room creation to succeed');
    }

    const joinResult = service.joinRoom(createResult.data.room.code, 'Guest', 'socket-2', 'https://sketcherson.example');

    if (!joinResult.ok) {
      throw new Error('Expected room join to succeed');
    }

    service.updateLobbySettings(
      'socket-1',
      {
        roundTimerSeconds: 60,
        firstCorrectGuessTimeCapSeconds: 30,
        turnsPerPlayer: 1,
        artEnabled: true,
      },
      'https://sketcherson.example',
    );

    const hostStart = service.startRoom('socket-1', 'https://sketcherson.example');
    expect(hostStart.ok).toBe(true);

    if (!hostStart.ok || !hostStart.data.room.match?.currentTurn) {
      return;
    }

    expect(hostStart.data.room.status).toBe('countdown');
    expect(hostStart.data.room.match.currentTurn.totalTurns).toBe(2);

    const drawerPlayerId = hostStart.data.room.match.currentTurn.drawerPlayerId;
    const drawerSocketId = drawerPlayerId === createResult.data.playerId ? 'socket-1' : 'socket-2';
    const guesserRoomState = service.getRoomState(createResult.data.room.code, 'https://sketcherson.example');

    expect(guesserRoomState.ok).toBe(true);

    if (!guesserRoomState.ok || !guesserRoomState.data.room.match?.currentTurn) {
      return;
    }

    expect(guesserRoomState.data.room.match.currentTurn.prompt).toBeNull();
    expect(guesserRoomState.data.room.match.currentTurn.promptVisibility).toBe('hidden');

    const rerollResult = service.rerollTurn(drawerSocketId, 'https://sketcherson.example');
    expect(rerollResult.ok).toBe(true);

    if (!rerollResult.ok || !rerollResult.data.room.match?.currentTurn) {
      return;
    }

    expect(rerollResult.data.room.match.currentTurn.rerollsRemaining).toBe(0);
    expect(rerollResult.data.room.match.currentTurn.rerolledFrom).not.toBeNull();
    expect(rerollResult.data.room.match.currentTurn.drawing.operations).toHaveLength(0);
  });

  it('limits prompt selection to the enabled collections in lobby settings', () => {
    const service = createRoomRuntimeDriver({ random: () => 0 });
    const createResult = service.createRoom('Host', 'socket-1', 'https://sketcherson.example');

    if (!createResult.ok) {
      throw new Error('Expected room creation to succeed');
    }

    const joinResult = service.joinRoom(createResult.data.room.code, 'Guest', 'socket-2', 'https://sketcherson.example');

    if (!joinResult.ok) {
      throw new Error('Expected room join to succeed');
    }

    const settingsUpdate = service.updateLobbySettings(
      'socket-1',
      {
        roundTimerSeconds: 60,
        firstCorrectGuessTimeCapSeconds: 30,
        turnsPerPlayer: 1,
        artEnabled: true,
        enabledCollectionIds: ['spell'],
      },
      'https://sketcherson.example',
    );

    expect(settingsUpdate.ok).toBe(true);

    const startResult = service.startRoom('socket-1', 'https://sketcherson.example');
    expect(startResult.ok).toBe(true);

    if (!startResult.ok || !startResult.data.room.match?.currentTurn) {
      return;
    }

    const drawerSocketId =
      startResult.data.room.match.currentTurn.drawerPlayerId === createResult.data.playerId ? 'socket-1' : 'socket-2';
    const drawerRoomState = service
      .getBroadcastTargets(createResult.data.room.code, 'https://sketcherson.example')
      .find((target) => target.socketId === drawerSocketId)?.room;

    expect(drawerRoomState?.settings.enabledCollectionIds).toEqual(['spell']);
    expect(drawerRoomState?.match?.currentTurn?.prompt).toBe('Arrows');
    expect(drawerRoomState?.match?.currentTurn?.referenceArtUrl).toBe('/demo-assets/Arrows.svg');
  });

  it('shows reference prompt art only on drawer and reveal surfaces when room and server policy allow it', () => {
    vi.useFakeTimers();

    const service = createRoomRuntimeDriver({
      countdownMs: 25,
      revealMs: 25,
      roundDurationOverrideMs: 50,
      random: () => 0,
    });
    const createResult = service.createRoom('Host', 'socket-1', 'https://sketcherson.example');

    if (!createResult.ok) {
      throw new Error('Expected room creation to succeed');
    }

    const joinResult = service.joinRoom(createResult.data.room.code, 'Guest', 'socket-2', 'https://sketcherson.example');

    if (!joinResult.ok) {
      throw new Error('Expected room join to succeed');
    }

    const startResult = service.startRoom('socket-1', 'https://sketcherson.example');
    expect(startResult.ok).toBe(true);

    if (!startResult.ok || !startResult.data.room.match?.currentTurn) {
      return;
    }

    const drawerSocketId =
      startResult.data.room.match.currentTurn.drawerPlayerId === createResult.data.playerId ? 'socket-1' : 'socket-2';
    const guesserSocketId = drawerSocketId === 'socket-1' ? 'socket-2' : 'socket-1';
    const broadcastTargets = service.getBroadcastTargets(createResult.data.room.code, 'https://sketcherson.example');
    const drawerRoomState = broadcastTargets.find((target) => target.socketId === drawerSocketId)?.room;
    const guesserRoomState = broadcastTargets.find((target) => target.socketId === guesserSocketId)?.room;

    expect(drawerRoomState?.serverReferenceArtEnabled).toBe(true);
    expect(drawerRoomState?.match?.currentTurn?.referenceArtUrl).toMatch(/^\/demo-assets\/.+\.svg$/);
    expect(guesserRoomState?.match?.currentTurn?.referenceArtUrl ?? null).toBeNull();

    vi.advanceTimersByTime(30);

    const revealState = service.getRoomState(createResult.data.room.code, 'https://sketcherson.example');
    expect(revealState.ok).toBe(true);

    if (!revealState.ok) {
      return;
    }

    expect(revealState.data.room.status).toBe('round');

    vi.advanceTimersByTime(60);

    const everyoneCanSeeReveal = service.getRoomState(createResult.data.room.code, 'https://sketcherson.example');
    expect(everyoneCanSeeReveal.ok).toBe(true);

    if (!everyoneCanSeeReveal.ok || !everyoneCanSeeReveal.data.room.match?.currentTurn) {
      return;
    }

    expect(everyoneCanSeeReveal.data.room.status).toBe('reveal');
    expect(everyoneCanSeeReveal.data.room.match.currentTurn.referenceArtUrl).toMatch(/^\/demo-assets\/.+\.svg$/);
  });

  it('removes reference art when the server override disables it', () => {
    const service = createRoomRuntimeDriver({
      referenceArtEnabled: false,
    });
    const createResult = service.createRoom('Host', 'socket-1', 'https://sketcherson.example');

    if (!createResult.ok) {
      throw new Error('Expected room creation to succeed');
    }

    const joinResult = service.joinRoom(createResult.data.room.code, 'Guest', 'socket-2', 'https://sketcherson.example');

    if (!joinResult.ok) {
      throw new Error('Expected room join to succeed');
    }

    const startResult = service.startRoom('socket-1', 'https://sketcherson.example');
    expect(startResult.ok).toBe(true);

    if (!startResult.ok || !startResult.data.room.match?.currentTurn) {
      return;
    }

    expect(startResult.data.room.serverReferenceArtEnabled).toBe(false);
    expect(startResult.data.room.match.currentTurn.referenceArtUrl).toBeNull();
  });

  it('accepts live drawing actions from the active drawer and stores a bitmap capture on reveal', () => {
    vi.useFakeTimers();

    const service = createRoomRuntimeDriver({
      countdownMs: 25,
      revealMs: 25,
      roundDurationOverrideMs: 50,
    });
    const createResult = service.createRoom('Host', 'socket-1', 'https://sketcherson.example');

    if (!createResult.ok) {
      throw new Error('Expected room creation to succeed');
    }

    const joinResult = service.joinRoom(createResult.data.room.code, 'Guest', 'socket-2', 'https://sketcherson.example');

    if (!joinResult.ok) {
      throw new Error('Expected room join to succeed');
    }

    const startResult = service.startRoom('socket-1', 'https://sketcherson.example');
    if (!startResult.ok || !startResult.data.room.match?.currentTurn) {
      throw new Error('Expected room start to succeed');
    }

    const drawerSocketId =
      startResult.data.room.match.currentTurn.drawerPlayerId === createResult.data.playerId ? 'socket-1' : 'socket-2';

    vi.advanceTimersByTime(30);

    const beginResult = service.applyDrawingAction(
      drawerSocketId,
      {
        type: 'beginStroke',
        strokeId: 'stroke-1',
        tool: 'pen',
        color: '#101a35',
        size: 6,
        point: { x: 160, y: 120 },
      },
      'https://sketcherson.example',
    );
    expect(beginResult.ok).toBe(true);

    const extendResult = service.applyDrawingAction(
      drawerSocketId,
      {
        type: 'extendStroke',
        strokeId: 'stroke-1',
        point: { x: 260, y: 220 },
      },
      'https://sketcherson.example',
    );
    expect(extendResult.ok).toBe(true);

    const endResult = service.applyDrawingAction(
      drawerSocketId,
      {
        type: 'endStroke',
        strokeId: 'stroke-1',
      },
      'https://sketcherson.example',
    );
    expect(endResult.ok).toBe(true);

    const liveRoomState = service.getRoomState(createResult.data.room.code, 'https://sketcherson.example');
    expect(liveRoomState.ok).toBe(true);

    if (!liveRoomState.ok || !liveRoomState.data.room.match?.currentTurn) {
      return;
    }

    expect(liveRoomState.data.room.status).toBe('round');
    expect(liveRoomState.data.room.match.currentTurn.drawing.operations).toHaveLength(1);

    vi.advanceTimersByTime(60);

    const revealState = service.getRoomState(createResult.data.room.code, 'https://sketcherson.example');
    expect(revealState.ok).toBe(true);

    if (!revealState.ok || !revealState.data.room.match?.currentTurn) {
      return;
    }

    expect(revealState.data.room.status).toBe('reveal');
    expect(revealState.data.room.match.currentTurn.drawing.snapshotDataUrl).toMatch(/^data:image\/bmp;base64,/);
    expect(revealState.data.room.match.completedTurns[0]?.finalImageDataUrl).toMatch(/^data:image\/bmp;base64,/);
  });

  it('can drive phase timers and reveal snapshots through injected engine dependencies', () => {
    const scheduler = createManualScheduler();
    const service = createRoomRuntimeDriver({
      countdownMs: 25,
      revealMs: 25,
      roundDurationOverrideMs: 50,
      scheduler: scheduler.adapter,
      renderDrawingSnapshot: () => 'data:image/test;base64,custom-snapshot',
    });
    const createResult = service.createRoom('Host', 'socket-1', 'https://sketcherson.example');

    if (!createResult.ok) {
      throw new Error('Expected room creation to succeed');
    }

    const joinResult = service.joinRoom(createResult.data.room.code, 'Guest', 'socket-2', 'https://sketcherson.example');

    if (!joinResult.ok) {
      throw new Error('Expected room join to succeed');
    }

    const startResult = service.startRoom('socket-1', 'https://sketcherson.example');
    expect(startResult.ok).toBe(true);
    expect(scheduler.activeDelays()).toEqual([25]);

    scheduler.runNext();

    const roundState = service.getRoomState(createResult.data.room.code, 'https://sketcherson.example');
    expect(roundState.ok).toBe(true);

    if (!roundState.ok) {
      return;
    }

    expect(roundState.data.room.status).toBe('round');
    expect(scheduler.activeDelays()).toEqual([50]);

    scheduler.runNext();

    const revealState = service.getRoomState(createResult.data.room.code, 'https://sketcherson.example');
    expect(revealState.ok).toBe(true);

    if (!revealState.ok || !revealState.data.room.match?.currentTurn) {
      return;
    }

    expect(revealState.data.room.status).toBe('reveal');
    expect(revealState.data.room.match.currentTurn.drawing.snapshotDataUrl).toBe('data:image/test;base64,custom-snapshot');
    expect(revealState.data.room.match.completedTurns[0]?.finalImageDataUrl).toBe('data:image/test;base64,custom-snapshot');
  });

  it('accepts correct guesses, updates the live scoreboard, caps the round timer, and blocks repeat messages', () => {
    vi.useFakeTimers();

    const service = createRoomRuntimeDriver({
      countdownMs: 25,
      revealMs: 25,
      roundDurationOverrideMs: 60_000,
      random: () => 0,
    });
    const createResult = service.createRoom('Host', 'socket-1', 'https://sketcherson.example');

    if (!createResult.ok) {
      throw new Error('Expected room creation to succeed');
    }

    const joinResult = service.joinRoom(createResult.data.room.code, 'Guest', 'socket-2', 'https://sketcherson.example');
    const thirdPlayer = service.joinRoom(createResult.data.room.code, 'Scout', 'socket-3', 'https://sketcherson.example');

    if (!joinResult.ok || !thirdPlayer.ok) {
      throw new Error('Expected room joins to succeed');
    }

    const settingsUpdate = service.updateLobbySettings(
      'socket-1',
      {
        roundTimerSeconds: 60,
        firstCorrectGuessTimeCapSeconds: 45,
        turnsPerPlayer: 3,
        artEnabled: true,
      },
      'https://sketcherson.example',
    );

    expect(settingsUpdate.ok).toBe(true);

    const startResult = service.startRoom('socket-1', 'https://sketcherson.example');

    if (!startResult.ok || !startResult.data.room.match?.currentTurn) {
      throw new Error('Expected room start to succeed');
    }

    const participants = [
      { playerId: createResult.data.playerId, socketId: 'socket-1' },
      { playerId: joinResult.data.playerId, socketId: 'socket-2' },
      { playerId: thirdPlayer.data.playerId, socketId: 'socket-3' },
    ];
    const drawer = participants.find((participant) => participant.playerId === startResult.data.room.match?.currentTurn?.drawerPlayerId);
    const firstGuesser = participants.find((participant) => participant.playerId !== drawer?.playerId);

    if (!drawer || !firstGuesser) {
      throw new Error('Expected drawer and guesser to exist');
    }

    vi.advanceTimersByTime(30);

    const guessResult = service.submitMessage(firstGuesser.socketId, 'archer', 'https://sketcherson.example');
    expect(guessResult.ok).toBe(true);

    if (!guessResult.ok || !guessResult.data.room.match?.currentTurn) {
      return;
    }

    const guesserEntry = guessResult.data.room.match.scoreboard.find(
      (entry) => entry.playerId === firstGuesser.playerId,
    );
    const drawerEntry = guessResult.data.room.match.scoreboard.find(
      (entry) => entry.playerId === startResult.data.room.match?.currentTurn?.drawerPlayerId,
    );

    expect(guessResult.data.room.status).toBe('round');
    expect(guesserEntry?.score).toBe(100);
    expect(drawerEntry?.score).toBe(50);
    expect(guessResult.data.room.match.phaseEndsAt).toBe(Date.now() + 45_000);
    expect(guessResult.data.room.match.currentTurn.correctGuessPlayerIds).toHaveLength(1);
    expect(guessResult.data.room.match.feed.find((m) => m.type === 'correctGuess')).toMatchObject({
      type: 'correctGuess',
      visibility: 'self',
      answer: expect.any(String),
    });

    const blockedMessage = service.submitMessage(firstGuesser.socketId, 'another one', 'https://sketcherson.example');
    expect(blockedMessage.ok).toBe(false);

    if (!blockedMessage.ok) {
      expect(blockedMessage.error.code).toBe('ALREADY_GUESSED');
    }
  });

  it('accepts adjacent transposition typos for canonical answers through submitMessage', () => {
    vi.useFakeTimers();

    const randomValues = Array(6).fill(0).concat([0.999, 0.4]);
    const service = createRoomRuntimeDriver({
      countdownMs: 25,
      revealMs: 25,
      roundDurationOverrideMs: 60_000,
      random: () => randomValues.shift() ?? 0,
    });
    const createResult = service.createRoom('Host', 'socket-1', 'https://sketcherson.example');

    if (!createResult.ok) {
      throw new Error('Expected room creation to succeed');
    }

    const joinResult = service.joinRoom(createResult.data.room.code, 'Guest', 'socket-2', 'https://sketcherson.example');

    if (!joinResult.ok) {
      throw new Error('Expected room join to succeed');
    }

    const settingsUpdate = service.updateLobbySettings(
      'socket-1',
      {
        roundTimerSeconds: 60,
        firstCorrectGuessTimeCapSeconds: 30,
        turnsPerPlayer: 1,
        artEnabled: true,
        enabledCollectionIds: ['building'],
      },
      'https://sketcherson.example',
    );

    expect(settingsUpdate.ok).toBe(true);

    const startResult = service.startRoom('socket-1', 'https://sketcherson.example');

    if (!startResult.ok || !startResult.data.room.match?.currentTurn) {
      throw new Error('Expected room start to succeed');
    }

    const drawerSocketId =
      startResult.data.room.match.currentTurn.drawerPlayerId === createResult.data.playerId ? 'socket-1' : 'socket-2';
    const drawerRoomState = service
      .getBroadcastTargets(createResult.data.room.code, 'https://sketcherson.example')
      .find((target) => target.socketId === drawerSocketId)?.room;

    expect(drawerRoomState?.match?.currentTurn?.prompt).toBe('Goblin Cage');

    vi.advanceTimersByTime(30);

    const guessResult = service.submitMessage('socket-2', 'golbin cage', 'https://sketcherson.example');
    expect(guessResult.ok).toBe(true);

    if (!guessResult.ok || !guessResult.data.room.match?.currentTurn) {
      return;
    }

    expect(guessResult.data.room.status).toBe('reveal');
    expect(guessResult.data.room.match.currentTurn.correctGuessPlayerIds).toEqual([joinResult.data.playerId]);
    expect(guessResult.data.room.match.feed.find((message) => message.type === 'correctGuess')).toMatchObject({
      type: 'correctGuess',
      visibility: 'self',
      answer: expect.any(String),
    });
  });

  it('accepts longer one-edit typo guesses for canonical answers through submitMessage', () => {
    vi.useFakeTimers();

    const randomValues = Array(6).fill(0).concat([0.999, 0.999, 0.67]);
    const service = createRoomRuntimeDriver({
      countdownMs: 25,
      revealMs: 25,
      roundDurationOverrideMs: 60_000,
      random: () => randomValues.shift() ?? 0,
    });
    const createResult = service.createRoom('Host', 'socket-1', 'https://sketcherson.example');

    if (!createResult.ok) {
      throw new Error('Expected room creation to succeed');
    }

    const joinResult = service.joinRoom(createResult.data.room.code, 'Guest', 'socket-2', 'https://sketcherson.example');
    const thirdPlayer = service.joinRoom(createResult.data.room.code, 'Scout', 'socket-3', 'https://sketcherson.example');

    if (!joinResult.ok || !thirdPlayer.ok) {
      throw new Error('Expected room joins to succeed');
    }

    const settingsUpdate = service.updateLobbySettings(
      'socket-1',
      {
        roundTimerSeconds: 60,
        firstCorrectGuessTimeCapSeconds: 30,
        turnsPerPlayer: 1,
        artEnabled: true,
        enabledCollectionIds: ['troop'],
      },
      'https://sketcherson.example',
    );

    expect(settingsUpdate.ok).toBe(true);

    const startResult = service.startRoom('socket-1', 'https://sketcherson.example');

    if (!startResult.ok || !startResult.data.room.match?.currentTurn) {
      throw new Error('Expected room start to succeed');
    }

    const drawerSocketId =
      startResult.data.room.match.currentTurn.drawerPlayerId === createResult.data.playerId ? 'socket-1' : 'socket-2';
    const drawerRoomState = service
      .getBroadcastTargets(createResult.data.room.code, 'https://sketcherson.example')
      .find((target) => target.socketId === drawerSocketId)?.room;

    expect(drawerRoomState?.match?.currentTurn?.prompt).toBe('Musketeer');

    vi.advanceTimersByTime(30);

    const firstGuess = service.submitMessage('socket-2', 'muketeer', 'https://sketcherson.example');
    expect(firstGuess.ok).toBe(true);

    if (!firstGuess.ok || !firstGuess.data.room.match?.currentTurn) {
      return;
    }

    expect(firstGuess.data.room.status).toBe('round');
    expect(firstGuess.data.room.match.currentTurn.correctGuessPlayerIds).toEqual([joinResult.data.playerId]);

    const secondGuess = service.submitMessage('socket-3', 'muskateer', 'https://sketcherson.example');
    expect(secondGuess.ok).toBe(true);

    if (!secondGuess.ok || !secondGuess.data.room.match?.currentTurn) {
      return;
    }

    expect(secondGuess.data.room.status).toBe('reveal');
    expect(secondGuess.data.room.match.currentTurn.correctGuessPlayerIds).toEqual([
      joinResult.data.playerId,
      thirdPlayer.data.playerId,
    ]);
  });

  it('keeps short canonical answers strict through submitMessage', () => {
    vi.useFakeTimers();

    const randomValues = Array(6).fill(0).concat([0.999, 0.95]);
    const service = createRoomRuntimeDriver({
      countdownMs: 25,
      revealMs: 25,
      roundDurationOverrideMs: 60_000,
      random: () => randomValues.shift() ?? 0,
    });
    const createResult = service.createRoom('Host', 'socket-1', 'https://sketcherson.example');

    if (!createResult.ok) {
      throw new Error('Expected room creation to succeed');
    }

    const joinResult = service.joinRoom(createResult.data.room.code, 'Guest', 'socket-2', 'https://sketcherson.example');

    if (!joinResult.ok) {
      throw new Error('Expected room join to succeed');
    }

    const settingsUpdate = service.updateLobbySettings(
      'socket-1',
      {
        roundTimerSeconds: 60,
        firstCorrectGuessTimeCapSeconds: 30,
        turnsPerPlayer: 1,
        artEnabled: true,
        enabledCollectionIds: ['spell'],
      },
      'https://sketcherson.example',
    );

    expect(settingsUpdate.ok).toBe(true);

    const startResult = service.startRoom('socket-1', 'https://sketcherson.example');

    if (!startResult.ok || !startResult.data.room.match?.currentTurn) {
      throw new Error('Expected room start to succeed');
    }

    const drawerSocketId =
      startResult.data.room.match.currentTurn.drawerPlayerId === createResult.data.playerId ? 'socket-1' : 'socket-2';
    const drawerRoomState = service
      .getBroadcastTargets(createResult.data.room.code, 'https://sketcherson.example')
      .find((target) => target.socketId === drawerSocketId)?.room;

    expect(drawerRoomState?.match?.currentTurn?.prompt).toBe('Zap');

    vi.advanceTimersByTime(30);

    const guessResult = service.submitMessage('socket-2', 'xap', 'https://sketcherson.example');
    expect(guessResult.ok).toBe(true);

    if (!guessResult.ok || !guessResult.data.room.match?.currentTurn) {
      return;
    }

    expect(guessResult.data.room.status).toBe('round');
    expect(guessResult.data.room.match.currentTurn.correctGuessPlayerIds).toHaveLength(0);
    expect(guessResult.data.room.match.feed.find((message) => message.type === 'correctGuess')).toBeUndefined();
    expect(guessResult.data.room.match.feed.at(-1)).toMatchObject({
      type: 'playerChat',
      text: 'xap',
      senderPlayerId: joinResult.data.playerId,
    });
  });

  it('ends the drawing turn immediately once every eligible guesser has answered correctly', () => {
    vi.useFakeTimers();

    const service = createRoomRuntimeDriver({
      countdownMs: 25,
      revealMs: 25,
      roundDurationOverrideMs: 60_000,
      random: () => 0,
    });
    const createResult = service.createRoom('Host', 'socket-1', 'https://sketcherson.example');

    if (!createResult.ok) {
      throw new Error('Expected room creation to succeed');
    }

    const joinResult = service.joinRoom(createResult.data.room.code, 'Guest', 'socket-2', 'https://sketcherson.example');
    const thirdPlayer = service.joinRoom(createResult.data.room.code, 'Scout', 'socket-3', 'https://sketcherson.example');

    if (!joinResult.ok || !thirdPlayer.ok) {
      throw new Error('Expected room joins to succeed');
    }

    const startResult = service.startRoom('socket-1', 'https://sketcherson.example');

    if (!startResult.ok || !startResult.data.room.match?.currentTurn) {
      throw new Error('Expected room start to succeed');
    }

    const participants = [
      { playerId: createResult.data.playerId, socketId: 'socket-1' },
      { playerId: joinResult.data.playerId, socketId: 'socket-2' },
      { playerId: thirdPlayer.data.playerId, socketId: 'socket-3' },
    ];
    const drawer = participants.find((participant) => participant.playerId === startResult.data.room.match?.currentTurn?.drawerPlayerId);
    const guessers = participants.filter((participant) => participant.playerId !== drawer?.playerId);

    if (!drawer || guessers.length !== 2) {
      throw new Error('Expected one drawer and two guessers');
    }

    vi.advanceTimersByTime(30);

    const firstGuess = service.submitMessage(guessers[0].socketId, 'archer', 'https://sketcherson.example');
    expect(firstGuess.ok).toBe(true);

    if (!firstGuess.ok) {
      return;
    }

    expect(firstGuess.data.room.status).toBe('round');

    const secondGuess = service.submitMessage(guessers[1].socketId, 'archer', 'https://sketcherson.example');
    expect(secondGuess.ok).toBe(true);

    if (!secondGuess.ok || !secondGuess.data.room.match?.currentTurn) {
      return;
    }

    expect(secondGuess.data.room.status).toBe('reveal');
    expect(secondGuess.data.room.match.phaseEndsAt).toBe(Date.now() + 25);
    expect(secondGuess.data.room.match.currentTurn.correctGuessPlayerIds).toHaveLength(2);
    expect(secondGuess.data.room.match.completedTurns).toHaveLength(1);
  });

  it('allows the host to adjust settings in postgame and start a fresh rematch in the same room', () => {
    vi.useFakeTimers();

    const service = createRoomRuntimeDriver({
      countdownMs: 25,
      revealMs: 25,
      roundDurationOverrideMs: 40,
      random: () => 0,
    });
    const createResult = service.createRoom('Host', 'socket-1', 'https://sketcherson.example');

    if (!createResult.ok) {
      throw new Error('Expected room creation to succeed');
    }

    const joinResult = service.joinRoom(createResult.data.room.code, 'Guest', 'socket-2', 'https://sketcherson.example');

    if (!joinResult.ok) {
      throw new Error('Expected room join to succeed');
    }

    const initialSettingsUpdate = service.updateLobbySettings(
      'socket-1',
      {
        roundTimerSeconds: 60,
        firstCorrectGuessTimeCapSeconds: 30,
        turnsPerPlayer: 1,
        artEnabled: true,
      },
      'https://sketcherson.example',
    );
    expect(initialSettingsUpdate.ok).toBe(true);

    const startResult = service.startRoom('socket-1', 'https://sketcherson.example');
    expect(startResult.ok).toBe(true);

    vi.advanceTimersByTime(200);

    const postgameState = service.getRoomState(createResult.data.room.code, 'https://sketcherson.example');
    expect(postgameState.ok).toBe(true);

    if (!postgameState.ok) {
      return;
    }

    expect(postgameState.data.room.status).toBe('postgame');
    expect(postgameState.data.room.match?.completedTurns).toHaveLength(2);

    const settingsUpdate = service.updateLobbySettings(
      'socket-1',
      {
        roundTimerSeconds: 120,
        firstCorrectGuessTimeCapSeconds: 30,
        turnsPerPlayer: 2,
        artEnabled: false,
      },
      'https://sketcherson.example',
    );

    expect(settingsUpdate.ok).toBe(true);

    const rematchResult = service.startRoom('socket-1', 'https://sketcherson.example');
    expect(rematchResult.ok).toBe(true);

    if (!rematchResult.ok || !rematchResult.data.room.match?.currentTurn) {
      return;
    }

    expect(rematchResult.data.room.status).toBe('countdown');
    expect(rematchResult.data.room.settings).toEqual({
      roundTimerSeconds: 120,
      firstCorrectGuessTimeCapSeconds: 30,
      guessingDelaySeconds: 0,
      turnsPerPlayer: 2,
      artEnabled: false,
      enabledCollectionIds: ['troop', 'building', 'spell'],
    });
    expect(rematchResult.data.room.match.currentTurn.turnNumber).toBe(1);
    expect(rematchResult.data.room.match.currentTurn.totalTurns).toBe(4);
    expect(rematchResult.data.room.match.completedTurns).toHaveLength(0);
    expect(rematchResult.data.room.match.feed.filter((m) => m.type === 'message')).toHaveLength(0);
    expect(rematchResult.data.room.match.scoreboard).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nickname: 'Guest', score: 0 }),
        expect.objectContaining({ nickname: 'Host', score: 0 }),
      ]),
    );
  });

  it('conceals the current accepted answer from other guessers while keeping it visible to the drawer and sender', () => {
    vi.useFakeTimers();

    const service = createRoomRuntimeDriver({
      countdownMs: 25,
      revealMs: 25,
      roundDurationOverrideMs: 60_000,
      random: () => 0,
    });
    const createResult = service.createRoom('Host', 'socket-1', 'https://sketcherson.example');

    if (!createResult.ok) {
      throw new Error('Expected room creation to succeed');
    }

    const secondPlayer = service.joinRoom(createResult.data.room.code, 'Guest', 'socket-2', 'https://sketcherson.example');
    const thirdPlayer = service.joinRoom(createResult.data.room.code, 'Scout', 'socket-3', 'https://sketcherson.example');

    if (!secondPlayer.ok || !thirdPlayer.ok) {
      throw new Error('Expected room joins to succeed');
    }

    const startResult = service.startRoom('socket-1', 'https://sketcherson.example');

    if (!startResult.ok || !startResult.data.room.match?.currentTurn) {
      throw new Error('Expected room start to succeed');
    }

    const participants = [
      { playerId: createResult.data.playerId, socketId: 'socket-1', nickname: 'Host' },
      { playerId: secondPlayer.data.playerId, socketId: 'socket-2', nickname: 'Guest' },
      { playerId: thirdPlayer.data.playerId, socketId: 'socket-3', nickname: 'Scout' },
    ];
    const drawer = participants.find((participant) => participant.playerId === startResult.data.room.match?.currentTurn?.drawerPlayerId);
    const nonDrawers = participants.filter((participant) => participant.playerId !== drawer?.playerId);

    if (!drawer || nonDrawers.length !== 2) {
      throw new Error('Expected one drawer and two guessers');
    }

    const sender = nonDrawers[0];
    const watcher = nonDrawers[1];

    vi.advanceTimersByTime(30);

    const guessResult = service.submitMessage(sender.socketId, 'archer', 'https://sketcherson.example');
    expect(guessResult.ok).toBe(true);

    const broadcasts = service.getBroadcastTargets(createResult.data.room.code, 'https://sketcherson.example');
    const drawerView = broadcasts.find((target) => target.socketId === drawer.socketId)?.room;
    const senderView = broadcasts.find((target) => target.socketId === sender.socketId)?.room;
    const watcherView = broadcasts.find((target) => target.socketId === watcher.socketId)?.room;

    const drawerCorrectFeedItem = drawerView?.match?.feed?.find((item) => item.type === 'correctGuess');
    const senderCorrectFeedItem = senderView?.match?.feed?.find((item) => item.type === 'correctGuess');
    const watcherCorrectFeedItem = watcherView?.match?.feed?.find((item) => item.type === 'correctGuess');
    expect(drawerCorrectFeedItem).toMatchObject({
      type: 'correctGuess',
      visibility: 'others',
      guesserPlayerId: sender.playerId,
      guesserNickname: sender.nickname,
    });
    expect(drawerCorrectFeedItem).not.toHaveProperty('answer');
    expect(senderCorrectFeedItem).toMatchObject({
      type: 'correctGuess',
      visibility: 'self',
      answer: 'Archer',
    });
    expect(watcherCorrectFeedItem).toMatchObject({
      type: 'correctGuess',
      visibility: 'others',
      guesserPlayerId: sender.playerId,
      guesserNickname: sender.nickname,
    });
    expect(watcherCorrectFeedItem).not.toHaveProperty('answer');
  });

  it('reclaims the same seat after disconnect and migrates host during live play', () => {
    const service = createRoomRuntimeDriver();
    const createResult = service.createRoom('Host', 'socket-1', 'https://sketcherson.example');

    if (!createResult.ok) {
      throw new Error('Expected room creation to succeed');
    }

    const joinResult = service.joinRoom(createResult.data.room.code, 'Guest', 'socket-2', 'https://sketcherson.example');

    if (!joinResult.ok) {
      throw new Error('Expected room join to succeed');
    }

    const startResult = service.startRoom('socket-1', 'https://sketcherson.example');
    if (!startResult.ok) {
      throw new Error('Expected room start to succeed');
    }

    const disconnectedRoomCode = service.disconnect('socket-1');
    expect(disconnectedRoomCode).toBe(createResult.data.room.code);

    const postDisconnectState = service.getRoomState(createResult.data.room.code, 'https://sketcherson.example');
    expect(postDisconnectState.ok).toBe(true);

    if (!postDisconnectState.ok) {
      return;
    }

    const disconnectedHost = postDisconnectState.data.room.players.find((player) => player.id === createResult.data.playerId);
    const migratedHost = postDisconnectState.data.room.players.find((player) => player.id === joinResult.data.playerId);

    expect(disconnectedHost?.connected).toBe(false);
    expect(disconnectedHost?.reconnectBy).not.toBeNull();
    expect(migratedHost?.isHost).toBe(true);

    const reclaimResult = service.reclaimRoom(
      createResult.data.room.code,
      createResult.data.sessionToken,
      'socket-3',
      'https://sketcherson.example',
    );

    expect(reclaimResult.ok).toBe(true);

    if (!reclaimResult.ok) {
      return;
    }

    const reclaimedPlayer = reclaimResult.data.room.players.find((player) => player.id === createResult.data.playerId);
    expect(reclaimResult.data.playerId).toBe(createResult.data.playerId);
    expect(reclaimedPlayer).toMatchObject({
      nickname: 'Host',
      connected: true,
      reconnectBy: null,
      isHost: false,
    });
  });

  it('preserves the host during paused reconnect grace and lets them resume after reclaim', () => {
    vi.useFakeTimers();

    const service = createRoomRuntimeDriver({
      countdownMs: 25,
      revealMs: 25,
      roundDurationOverrideMs: 100,
      pauseMaxMs: 500,
      pauseCooldownMs: 50,
      random: () => 0,
    });
    const createResult = service.createRoom('Host', 'socket-1', 'https://sketcherson.example');

    if (!createResult.ok) {
      throw new Error('Expected room creation to succeed');
    }

    const joinResult = service.joinRoom(createResult.data.room.code, 'Guest', 'socket-2', 'https://sketcherson.example');

    if (!joinResult.ok) {
      throw new Error('Expected room join to succeed');
    }

    const startResult = service.startRoom('socket-1', 'https://sketcherson.example');
    expect(startResult.ok).toBe(true);

    vi.advanceTimersByTime(30);

    const pauseResult = service.pauseRoom('socket-1', 'https://sketcherson.example');
    expect(pauseResult.ok).toBe(true);

    const disconnectedRoomCode = service.disconnect('socket-1');
    expect(disconnectedRoomCode).toBe(createResult.data.room.code);

    const pausedRoomState = service.getRoomState(createResult.data.room.code, 'https://sketcherson.example');
    expect(pausedRoomState.ok).toBe(true);

    if (!pausedRoomState.ok) {
      return;
    }

    const disconnectedHost = pausedRoomState.data.room.players.find((player) => player.id === createResult.data.playerId);
    const guestPlayer = pausedRoomState.data.room.players.find((player) => player.id === joinResult.data.playerId);

    expect(pausedRoomState.data.room.status).toBe('paused');
    expect(disconnectedHost).toMatchObject({
      connected: false,
      isHost: true,
      reconnectBy: null,
    });
    expect(guestPlayer?.isHost).toBe(false);

    const reclaimResult = service.reclaimRoom(
      createResult.data.room.code,
      createResult.data.sessionToken,
      'socket-3',
      'https://sketcherson.example',
    );

    expect(reclaimResult.ok).toBe(true);

    if (!reclaimResult.ok) {
      return;
    }

    const reclaimedPlayer = reclaimResult.data.room.players.find((player) => player.id === createResult.data.playerId);
    expect(reclaimedPlayer).toMatchObject({
      nickname: 'Host',
      connected: true,
      reconnectBy: null,
      isHost: true,
    });

    const resumeResult = service.resumeRoom('socket-3', 'https://sketcherson.example');
    expect(resumeResult.ok).toBe(true);
  });

  it('counts reserved seats against capacity until the reconnect window expires', () => {
    vi.useFakeTimers();

    const service = createRoomRuntimeDriver({ reconnectGraceMs: 1_000 });
    const createResult = service.createRoom('Host', 'socket-1', 'https://sketcherson.example');

    if (!createResult.ok) {
      throw new Error('Expected room creation to succeed');
    }

    for (let index = 0; index < MAX_PLAYERS_PER_ROOM - 1; index += 1) {
      const joinResult = service.joinRoom(
        createResult.data.room.code,
        `Player ${index + 1}`,
        `socket-${index + 2}`,
        'https://sketcherson.example',
      );

      if (!joinResult.ok) {
        throw new Error('Expected room join to succeed');
      }
    }

    service.disconnect('socket-2');

    const blockedJoin = service.joinRoom(createResult.data.room.code, 'Overflow', 'socket-overflow', 'https://sketcherson.example');
    expect(blockedJoin.ok).toBe(false);

    if (!blockedJoin.ok) {
      expect(blockedJoin.error.code).toBe('ROOM_FULL');
    }

    vi.advanceTimersByTime(1_001);

    const allowedJoin = service.joinRoom(createResult.data.room.code, 'Overflow', 'socket-overflow', 'https://sketcherson.example');
    expect(allowedJoin.ok).toBe(true);
  });

  it('pauses a live phase, freezes reconnect expiry, and resumes through a countdown', () => {
    vi.useFakeTimers();

    const service = createRoomRuntimeDriver({
      countdownMs: 25,
      revealMs: 25,
      roundDurationOverrideMs: 100,
      pauseMaxMs: 500,
      pauseCooldownMs: 50,
      random: () => 0,
    });
    const createResult = service.createRoom('Host', 'socket-1', 'https://sketcherson.example');

    if (!createResult.ok) {
      throw new Error('Expected room creation to succeed');
    }

    const joinResult = service.joinRoom(createResult.data.room.code, 'Guest', 'socket-2', 'https://sketcherson.example');

    if (!joinResult.ok) {
      throw new Error('Expected room join to succeed');
    }

    const startResult = service.startRoom('socket-1', 'https://sketcherson.example');
    expect(startResult.ok).toBe(true);

    vi.advanceTimersByTime(30);

    service.disconnect('socket-2');

    const beforePause = service.getRoomState(createResult.data.room.code, 'https://sketcherson.example');
    expect(beforePause.ok).toBe(true);

    if (!beforePause.ok) {
      return;
    }

    const reconnectingGuestBeforePause = beforePause.data.room.players.find((player) => player.id === joinResult.data.playerId);
    const reconnectRemainingBeforePause = (reconnectingGuestBeforePause?.reconnectBy ?? Date.now()) - Date.now();

    const pauseResult = service.pauseRoom('socket-1', 'https://sketcherson.example');
    expect(pauseResult.ok).toBe(true);

    if (!pauseResult.ok) {
      return;
    }

    expect(pauseResult.data.room.status).toBe('paused');
    expect(pauseResult.data.room.match?.pause).toMatchObject({
      mode: 'paused',
      pausedPhase: 'round',
    });
    expect(pauseResult.data.room.match?.phaseEndsAt).toBeNull();

    const reconnectingGuestDuringPause = pauseResult.data.room.players.find((player) => player.id === joinResult.data.playerId);
    expect(reconnectingGuestDuringPause?.reconnectBy).toBeNull();
    expect(reconnectingGuestDuringPause?.reconnectRemainingMs ?? 0).toBeGreaterThan(59_000);

    vi.advanceTimersByTime(300);

    const stillPaused = service.getRoomState(createResult.data.room.code, 'https://sketcherson.example');
    expect(stillPaused.ok).toBe(true);

    if (!stillPaused.ok) {
      return;
    }

    expect(stillPaused.data.room.status).toBe('paused');
    expect(stillPaused.data.room.players.some((player) => player.id === joinResult.data.playerId)).toBe(true);

    const resumeResult = service.resumeRoom('socket-1', 'https://sketcherson.example');
    expect(resumeResult.ok).toBe(true);

    if (!resumeResult.ok) {
      return;
    }

    expect(resumeResult.data.room.match?.pause).toMatchObject({ mode: 'resuming' });

    vi.advanceTimersByTime(30);

    const resumedRoom = service.getRoomState(createResult.data.room.code, 'https://sketcherson.example');
    expect(resumedRoom.ok).toBe(true);

    if (!resumedRoom.ok) {
      return;
    }

    expect(resumedRoom.data.room.status).toBe('round');
    expect(resumedRoom.data.room.match?.pause).toBeNull();
    expect((resumedRoom.data.room.match?.phaseEndsAt ?? Date.now()) - Date.now()).toBeGreaterThanOrEqual(90);

    const reconnectingGuestAfterResume = resumedRoom.data.room.players.find((player) => player.id === joinResult.data.playerId);
    const reconnectRemainingAfterResume = (reconnectingGuestAfterResume?.reconnectBy ?? Date.now()) - Date.now();
    expect(reconnectingGuestAfterResume?.reconnectRemainingMs ?? null).toBeNull();
    expect(reconnectRemainingAfterResume).toBeGreaterThanOrEqual(reconnectRemainingBeforePause - 50);

    const blockedRepause = service.pauseRoom('socket-1', 'https://sketcherson.example');
    expect(blockedRepause.ok).toBe(false);

    vi.advanceTimersByTime(51);

    const allowedRepause = service.pauseRoom('socket-1', 'https://sketcherson.example');
    expect(allowedRepause.ok).toBe(true);
  });

  it('lets players join while paused and preserves the paused-phase late-join rules', () => {
    vi.useFakeTimers();

    const service = createRoomRuntimeDriver({
      countdownMs: 25,
      revealMs: 25,
      roundDurationOverrideMs: 100,
      pauseMaxMs: 500,
      random: () => 0,
    });
    const createResult = service.createRoom('Host', 'socket-1', 'https://sketcherson.example');

    if (!createResult.ok) {
      throw new Error('Expected room creation to succeed');
    }

    const joinResult = service.joinRoom(createResult.data.room.code, 'Guest', 'socket-2', 'https://sketcherson.example');

    if (!joinResult.ok) {
      throw new Error('Expected room join to succeed');
    }

    service.updateLobbySettings(
      'socket-1',
      {
        roundTimerSeconds: 60,
        firstCorrectGuessTimeCapSeconds: 30,
        turnsPerPlayer: 1,
        artEnabled: true,
      },
      'https://sketcherson.example',
    );

    const startResult = service.startRoom('socket-1', 'https://sketcherson.example');
    expect(startResult.ok).toBe(true);

    vi.advanceTimersByTime(30);

    const pauseResult = service.pauseRoom('socket-1', 'https://sketcherson.example');
    expect(pauseResult.ok).toBe(true);

    const lateJoin = service.joinRoom(createResult.data.room.code, 'Late', 'socket-3', 'https://sketcherson.example');
    expect(lateJoin.ok).toBe(true);

    if (!lateJoin.ok || !lateJoin.data.room.match?.currentTurn) {
      return;
    }

    expect(lateJoin.data.room.status).toBe('paused');
    expect(lateJoin.data.room.match.pause).toMatchObject({ pausedPhase: 'round' });
    expect(lateJoin.data.room.match.currentTurn.totalTurns).toBe(3);
    expect(lateJoin.data.room.players.find((player) => player.id === lateJoin.data.playerId)).toMatchObject({
      nickname: 'Late',
      canGuessFromTurnNumber: 2,
    });
  });

  it('lets late joiners enter an active match, unlock guessing on the next round, and receive one tail turn', () => {
    vi.useFakeTimers();

    const service = createRoomRuntimeDriver({
      countdownMs: 25,
      revealMs: 25,
      roundDurationOverrideMs: 50,
      random: () => 0,
    });
    const createResult = service.createRoom('Host', 'socket-1', 'https://sketcherson.example');

    if (!createResult.ok) {
      throw new Error('Expected room creation to succeed');
    }

    const firstGuest = service.joinRoom(createResult.data.room.code, 'Guest', 'socket-2', 'https://sketcherson.example');

    if (!firstGuest.ok) {
      throw new Error('Expected room join to succeed');
    }

    const settingsUpdate = service.updateLobbySettings(
      'socket-1',
      {
        roundTimerSeconds: 60,
        firstCorrectGuessTimeCapSeconds: 30,
        turnsPerPlayer: 1,
        artEnabled: true,
      },
      'https://sketcherson.example',
    );
    expect(settingsUpdate.ok).toBe(true);

    const startResult = service.startRoom('socket-1', 'https://sketcherson.example');

    if (!startResult.ok) {
      throw new Error('Expected room start to succeed');
    }

    vi.advanceTimersByTime(30);

    const lateJoin = service.joinRoom(createResult.data.room.code, 'Late', 'socket-3', 'https://sketcherson.example');

    expect(lateJoin.ok).toBe(true);

    if (!lateJoin.ok || !lateJoin.data.room.match?.currentTurn) {
      return;
    }

    expect(lateJoin.data.room.match.currentTurn.totalTurns).toBe(3);
    expect(lateJoin.data.room.players.find((player) => player.id === lateJoin.data.playerId)).toMatchObject({
      nickname: 'Late',
      connected: true,
      canGuessFromTurnNumber: 2,
    });
    expect(lateJoin.data.room.match.scoreboard).toEqual(
      expect.arrayContaining([expect.objectContaining({ playerId: lateJoin.data.playerId, nickname: 'Late', score: 0 })]),
    );

    const earlyGuess = service.submitMessage('socket-3', 'archer', 'https://sketcherson.example');
    expect(earlyGuess.ok).toBe(true);

    if (!earlyGuess.ok) {
      return;
    }

    expect(earlyGuess.data.room.match?.feed.at(-1)).toMatchObject({
      type: 'playerChat',
      text: 'archer',
    });
    expect(earlyGuess.data.room.match?.scoreboard.find((entry) => entry.playerId === lateJoin.data.playerId)?.score).toBe(0);

    vi.advanceTimersByTime(100);

    const eligibleGuess = service.submitMessage('socket-3', 'arrow', 'https://sketcherson.example');
    expect(eligibleGuess.ok).toBe(true);

    if (!eligibleGuess.ok) {
      return;
    }

    expect(eligibleGuess.data.room.match?.currentTurn?.turnNumber).toBe(2);
    expect(eligibleGuess.data.room.match?.feed.find((m) => m.type === 'correctGuess')).toMatchObject({
      type: 'correctGuess',
      visibility: 'self',
      answer: expect.any(String),
    });
    expect(eligibleGuess.data.room.match?.scoreboard.find((entry) => entry.playerId === lateJoin.data.playerId)?.score).toBeGreaterThan(0);

    vi.advanceTimersByTime(200);

    const postgameState = service.getRoomState(createResult.data.room.code, 'https://sketcherson.example');
    expect(postgameState.ok).toBe(true);

    if (!postgameState.ok) {
      return;
    }

    expect(postgameState.data.room.status).toBe('postgame');
    expect(postgameState.data.room.match?.completedTurns).toHaveLength(3);
    expect(postgameState.data.room.match?.completedTurns.at(-1)?.drawerNickname).toBe('Late');

    service.disconnect('socket-2');

    const reclaimResult = service.reclaimRoom(
      createResult.data.room.code,
      firstGuest.data.sessionToken,
      'socket-4',
      'https://sketcherson.example',
    );

    expect(reclaimResult.ok).toBe(true);
  });

  it('does not grant a tail turn to a player who joins during the final reveal', () => {
    vi.useFakeTimers();

    const service = createRoomRuntimeDriver({
      countdownMs: 25,
      revealMs: 50,
      roundDurationOverrideMs: 25,
      random: () => 0,
    });
    const createResult = service.createRoom('Host', 'socket-1', 'https://sketcherson.example');

    if (!createResult.ok) {
      throw new Error('Expected room creation to succeed');
    }

    const firstGuest = service.joinRoom(createResult.data.room.code, 'Guest', 'socket-2', 'https://sketcherson.example');

    if (!firstGuest.ok) {
      throw new Error('Expected room join to succeed');
    }

    const settingsUpdate = service.updateLobbySettings(
      'socket-1',
      {
        roundTimerSeconds: 60,
        firstCorrectGuessTimeCapSeconds: 30,
        turnsPerPlayer: 1,
        artEnabled: true,
      },
      'https://sketcherson.example',
    );
    expect(settingsUpdate.ok).toBe(true);

    const startResult = service.startRoom('socket-1', 'https://sketcherson.example');
    expect(startResult.ok).toBe(true);

    vi.advanceTimersByTime(150);

    const lateJoin = service.joinRoom(createResult.data.room.code, 'Late', 'socket-3', 'https://sketcherson.example');

    expect(lateJoin.ok).toBe(true);

    if (!lateJoin.ok || !lateJoin.data.room.match?.currentTurn) {
      return;
    }

    expect(lateJoin.data.room.status).toBe('reveal');
    expect(lateJoin.data.room.match.currentTurn.turnNumber).toBe(2);
    expect(lateJoin.data.room.match.currentTurn.totalTurns).toBe(2);
    expect(lateJoin.data.room.match.scoreboard).toEqual(
      expect.arrayContaining([expect.objectContaining({ playerId: lateJoin.data.playerId, nickname: 'Late', score: 0 })]),
    );
  });

  it('lets the host kick a player, removes them from live state, and invalidates their session', () => {
    const service = createRoomRuntimeDriver();
    const createResult = service.createRoom('Host', 'socket-1', 'https://sketcherson.example');

    if (!createResult.ok) {
      throw new Error('Expected room creation to succeed');
    }

    const joinResult = service.joinRoom(createResult.data.room.code, 'Guest', 'socket-2', 'https://sketcherson.example');

    if (!joinResult.ok) {
      throw new Error('Expected room join to succeed');
    }

    const startResult = service.startRoom('socket-1', 'https://sketcherson.example');
    expect(startResult.ok).toBe(true);

    const kickResult = service.kickPlayer('socket-1', joinResult.data.playerId, 'https://sketcherson.example');
    expect(kickResult.ok).toBe(true);

    if (!kickResult.ok) {
      return;
    }

    expect(kickResult.kickedSocketId).toBe('socket-2');
    expect(kickResult.data.room.players).toEqual([
      expect.objectContaining({
        id: createResult.data.playerId,
        nickname: 'Host',
      }),
    ]);
    expect(kickResult.data.room.match?.scoreboard).toEqual([
      expect.objectContaining({
        playerId: createResult.data.playerId,
        nickname: 'Host',
        score: 0,
      }),
    ]);

    const kickedPlayerMessage = service.submitMessage('socket-2', 'still here', 'https://sketcherson.example');
    expect(kickedPlayerMessage.ok).toBe(false);

    if (!kickedPlayerMessage.ok) {
      expect(kickedPlayerMessage.error.code).toBe('ROOM_NOT_FOUND');
    }

    const reclaimResult = service.reclaimRoom(
      createResult.data.room.code,
      joinResult.data.sessionToken,
      'socket-3',
      'https://sketcherson.example',
    );
    expect(reclaimResult.ok).toBe(false);

    if (!reclaimResult.ok) {
      expect(reclaimResult.error.code).toBe('SESSION_EXPIRED');
    }
  });

  it('blocks guessers from chatting or guessing until the configured round delay expires', () => {
    vi.useFakeTimers();

    const service = createRoomRuntimeDriver({
      countdownMs: 25,
      roundDurationOverrideMs: 10_000,
      random: () => 0.999,
    });
    const createResult = service.createRoom('Host', 'socket-1', 'https://sketcherson.example');

    if (!createResult.ok) {
      throw new Error('Expected room creation to succeed');
    }

    const joinResult = service.joinRoom(createResult.data.room.code, 'Guest', 'socket-2', 'https://sketcherson.example');

    if (!joinResult.ok) {
      throw new Error('Expected room join to succeed');
    }

    const settingsUpdate = service.updateLobbySettings(
      'socket-1',
      {
        roundTimerSeconds: 60,
        firstCorrectGuessTimeCapSeconds: 30,
        guessingDelaySeconds: 5,
        turnsPerPlayer: 1,
        artEnabled: true,
      },
      'https://sketcherson.example',
    );
    expect(settingsUpdate.ok).toBe(true);

    const startResult = service.startRoom('socket-1', 'https://sketcherson.example');
    expect(startResult.ok).toBe(true);

    if (!startResult.ok || !startResult.data.room.match?.currentTurn?.prompt) {
      return;
    }

    expect(startResult.data.room.match.currentTurn.drawerPlayerId).toBe(createResult.data.playerId);

    vi.advanceTimersByTime(25);

    const earlyChat = service.submitMessage('socket-2', 'hello', 'https://sketcherson.example');
    expect(earlyChat.ok).toBe(false);

    if (!earlyChat.ok) {
      expect(earlyChat.error.code).toBe('INVALID_STATE');
      expect(earlyChat.error.message).toBe('Guessing and chat are disabled for the first 5 seconds of each round.');
    }

    const earlyGuess = service.submitMessage('socket-2', startResult.data.room.match.currentTurn.prompt, 'https://sketcherson.example');
    expect(earlyGuess.ok).toBe(false);

    if (!earlyGuess.ok) {
      expect(earlyGuess.error.code).toBe('INVALID_STATE');
    }

    vi.advanceTimersByTime(5_000);

    const eligibleGuess = service.submitMessage('socket-2', startResult.data.room.match.currentTurn.prompt, 'https://sketcherson.example');
    expect(eligibleGuess.ok).toBe(true);

    if (!eligibleGuess.ok) {
      return;
    }

    expect(eligibleGuess.data.room.match?.feed.find((m) => m.type === 'correctGuess')).toMatchObject({
      type: 'correctGuess',
      visibility: 'self',
      answer: expect.any(String),
    });
  });

  it('allows chat messages containing profanity (censoring is client-side)', () => {
    const service = createRoomRuntimeDriver();
    const createResult = service.createRoom('Host', 'socket-1', 'https://sketcherson.example');

    if (!createResult.ok) {
      throw new Error('Expected room creation to succeed');
    }

    const joinResult = service.joinRoom(createResult.data.room.code, 'Guest', 'socket-2', 'https://sketcherson.example');

    if (!joinResult.ok) {
      throw new Error('Expected room join to succeed');
    }

    const startResult = service.startRoom('socket-1', 'https://sketcherson.example');
    expect(startResult.ok).toBe(true);

    const messageResult = service.submitMessage('socket-2', 'this is shit', 'https://sketcherson.example');
    expect(messageResult.ok).toBe(true);
  });

  it('rate limits repeated join attempts, chat spam, and drawing spam', () => {
    vi.useFakeTimers();

    const service = createRoomRuntimeDriver({
      countdownMs: 25,
      revealMs: 25,
      roundDurationOverrideMs: 1_000,
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const joinAttempt = service.joinRoom('MISSING', `Guest ${attempt}`, 'socket-join', 'https://sketcherson.example');
      expect(joinAttempt.ok).toBe(false);
      if (!joinAttempt.ok) {
        expect(joinAttempt.error.code).toBe('ROOM_NOT_FOUND');
      }
    }

    const rateLimitedJoin = service.joinRoom('MISSING', 'Late Guest', 'socket-join', 'https://sketcherson.example');
    expect(rateLimitedJoin.ok).toBe(false);

    if (!rateLimitedJoin.ok) {
      expect(rateLimitedJoin.error.code).toBe('RATE_LIMITED');
    }

    const createResult = service.createRoom('Host', 'socket-1', 'https://sketcherson.example');

    if (!createResult.ok) {
      throw new Error('Expected room creation to succeed');
    }

    const joinResult = service.joinRoom(createResult.data.room.code, 'Guest', 'socket-2', 'https://sketcherson.example');

    if (!joinResult.ok) {
      throw new Error('Expected room join to succeed');
    }

    const startResult = service.startRoom('socket-1', 'https://sketcherson.example');
    expect(startResult.ok).toBe(true);

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const messageResult = service.submitMessage('socket-1', `chat ${attempt}`, 'https://sketcherson.example');
      expect(messageResult.ok).toBe(true);
    }

    const rateLimitedMessage = service.submitMessage('socket-1', 'one too many', 'https://sketcherson.example');
    expect(rateLimitedMessage.ok).toBe(false);

    if (!rateLimitedMessage.ok) {
      expect(rateLimitedMessage.error.code).toBe('RATE_LIMITED');
    }

    vi.advanceTimersByTime(5_001);

    const recoveredMessage = service.submitMessage('socket-1', 'back again', 'https://sketcherson.example');
    expect(recoveredMessage.ok).toBe(true);

    vi.advanceTimersByTime(30);

    if (!startResult.ok || !startResult.data.room.match?.currentTurn) {
      return;
    }

    const drawerSocketId =
      startResult.data.room.match.currentTurn.drawerPlayerId === createResult.data.playerId ? 'socket-1' : 'socket-2';

    const beginResult = service.applyDrawingAction(
      drawerSocketId,
      {
        type: 'beginStroke',
        strokeId: 'spam-stroke',
        tool: 'pen',
        color: '#101a35',
        size: 6,
        point: { x: 10, y: 10 },
      },
      'https://sketcherson.example',
    );
    expect(beginResult.ok).toBe(true);

    for (let attempt = 0; attempt < 479; attempt += 1) {
      const extendResult = service.applyDrawingAction(
        drawerSocketId,
        {
          type: 'extendStroke',
          strokeId: 'spam-stroke',
          point: { x: 11 + attempt, y: 11 + attempt },
        },
        'https://sketcherson.example',
      );
      expect(extendResult.ok).toBe(true);
    }

    const rateLimitedDrawing = service.applyDrawingAction(
      drawerSocketId,
      {
        type: 'extendStroke',
        strokeId: 'spam-stroke',
        point: { x: 600, y: 400 },
      },
      'https://sketcherson.example',
    );
    expect(rateLimitedDrawing.ok).toBe(false);

    if (!rateLimitedDrawing.ok) {
      expect(rateLimitedDrawing.error.code).toBe('RATE_LIMITED');
    }
  });

  it('resets rate limit behavior on disconnect, reclaim, and kick', () => {
    const service = createRoomRuntimeDriver();
    const origin = 'https://sketcherson.example';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const missingRoomResult = service.joinRoom('MISSING', `Guest ${attempt}`, 'socket-missing', origin);
      expect(missingRoomResult.ok).toBe(false);
    }

    const rateLimitedJoin = service.joinRoom('MISSING', 'Guest limited', 'socket-missing', origin);
    expect(rateLimitedJoin.ok).toBe(false);
    if (!rateLimitedJoin.ok) {
      expect(rateLimitedJoin.error.code).toBe('RATE_LIMITED');
    }

    expect(service.disconnect('socket-missing')).toBeNull();
    const joinAfterDisconnect = service.joinRoom('MISSING', 'Guest reset', 'socket-missing', origin);
    expect(joinAfterDisconnect.ok).toBe(false);
    if (!joinAfterDisconnect.ok) {
      expect(joinAfterDisconnect.error.code).toBe('ROOM_NOT_FOUND');
    }

    const createResult = service.createRoom('Host', 'socket-1', origin);

    if (!createResult.ok) {
      throw new Error('Expected room creation to succeed');
    }

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const messageResult = service.submitMessage('socket-1', `host message ${attempt}`, origin);
      expect(messageResult.ok).toBe(true);
    }

    const rateLimitedHostMessage = service.submitMessage('socket-1', 'host rate limited', origin);
    expect(rateLimitedHostMessage.ok).toBe(false);
    if (!rateLimitedHostMessage.ok) {
      expect(rateLimitedHostMessage.error.code).toBe('RATE_LIMITED');
    }

    const reclaimToNewConnection = service.reclaimRoom(createResult.data.room.code, createResult.data.sessionToken, 'socket-1b', origin);
    expect(reclaimToNewConnection.ok).toBe(true);
    const reclaimToOriginalConnection = service.reclaimRoom(createResult.data.room.code, createResult.data.sessionToken, 'socket-1', origin);
    expect(reclaimToOriginalConnection.ok).toBe(true);
    const messageAfterReclaim = service.submitMessage('socket-1', 'host after reclaim', origin);
    expect(messageAfterReclaim.ok).toBe(true);

    const joinResult = service.joinRoom(createResult.data.room.code, 'Guest', 'socket-2', origin);

    if (!joinResult.ok) {
      throw new Error('Expected room join to succeed');
    }

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const guestMessageResult = service.submitMessage('socket-2', `guest message ${attempt}`, origin);
      expect(guestMessageResult.ok).toBe(true);
    }

    const rateLimitedGuestMessage = service.submitMessage('socket-2', 'guest rate limited', origin);
    expect(rateLimitedGuestMessage.ok).toBe(false);
    if (!rateLimitedGuestMessage.ok) {
      expect(rateLimitedGuestMessage.error.code).toBe('RATE_LIMITED');
    }

    const kickResult = service.kickPlayer('socket-1', joinResult.data.playerId, origin);
    expect(kickResult.ok).toBe(true);

    const rejoinResult = service.joinRoom(createResult.data.room.code, 'Guest Again', 'socket-2', origin);
    expect(rejoinResult.ok).toBe(true);
    const messageAfterKick = service.submitMessage('socket-2', 'guest after kick', origin);
    expect(messageAfterKick.ok).toBe(true);
  });

  it('returns room not found for missing rooms', () => {
    const service = createRoomRuntimeDriver();
    const result = service.getRoomState('MISSING', 'https://sketcherson.example');

    expect(result.ok).toBe(false);

    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe('ROOM_NOT_FOUND');
  });
});
