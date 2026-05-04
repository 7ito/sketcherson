import type { GameDefinition, GamePack, ServerGameRuntime } from '@7ito/sketcherson-common/game';
import { createServerGameRuntime } from '@7ito/sketcherson-common/game';
import { createPromptEngine, type PromptEngine } from '@7ito/sketcherson-common/prompts';
import { MAX_CHAT_MESSAGE_LENGTH, PAUSE_MAX_DURATION_SECONDS, PAUSE_REPAUSE_COOLDOWN_SECONDS, PRE_ROUND_COUNTDOWN_SECONDS, RECONNECT_GRACE_PERIOD_SECONDS, REVEAL_DURATION_SECONDS, normalizeRoomCode, type ApiResult, type CreateRoomSuccess, type DrawingActionSuccess, type LobbyDrawingActionSuccess, type JoinRoomSuccess, type LiveRoomStatus, type LobbySettings, type ReclaimRoomSuccess, type RoomState, type RoomStateSuccess, type PauseRoomSuccess, type ResumeRoomSuccess, type RerollTurnSuccess, type ScoreboardEntry, type StartRoomSuccess, type SubmitMessageSuccess, type UpdateLobbySettingsSuccess } from '@7ito/sketcherson-common/room';
import type { DrawingAction, DrawingState } from '@7ito/sketcherson-common/drawing';
import { isNicknameValid, normalizeNickname, normalizeNicknameForComparison } from '@7ito/sketcherson-common/identity';
import { containsProfanity } from '@7ito/sketcherson-common/moderation';
import { randomUUID } from 'node:crypto';
import { applyDrawingAction, createDrawingState } from '../drawing';
import { appendRoomFeedRecord, type ActiveTurnRecord, type RoomPlayerRecord, type RoomRecord } from './model';
import { ConnectionController } from './ConnectionController';
import { DrawingController } from './DrawingController';
import { MatchController } from './MatchController';
import type { RoomPhaseTimerKind } from './timers';
import { RateLimiter } from './RateLimiter';
import { RoomProjector } from './RoomProjector';
import { RoomScheduler, type RoomSchedulerAdapter } from './RoomScheduler';
import { RoomStore } from './RoomStore';
import type { ActorInput, BroadcastTarget, ConnectionInput, EmptyActorInput, KickPlayerResult, RoomEngine, RoomTimerFiredInput } from '../roomEngine';
import type { RoomCommand, RoomCommandResult, RoomLifecycleMachine, RoomQuery, RoomQueryResult } from './RoomLifecycleMachine';

export interface RoomIdGenerator {
  randomUUID(): string;
}

export interface InMemoryRoomLifecycleMachineOptions {
  referenceArtEnabled?: boolean;
  countdownMs?: number;
  revealMs?: number;
  reconnectGraceMs?: number;
  pauseMaxMs?: number;
  pauseCooldownMs?: number;
  roundDurationOverrideMs?: number;
  now?: () => number;
  random?: () => number;
  ids?: RoomIdGenerator;
  scheduler?: RoomSchedulerAdapter;
  renderDrawingSnapshot?: (drawing: DrawingState) => string | null;
  gameRuntime?: ServerGameRuntime<any>;
  gameDefinition?: GameDefinition;
  gamePack?: GamePack<any>;
  promptEngine?: PromptEngine;
}

export class InMemoryRoomLifecycleMachine implements RoomEngine, RoomLifecycleMachine {
  private readonly store: RoomStore;
  private readonly scheduler: RoomScheduler;
  private readonly connectionController: ConnectionController;
  private readonly drawingController: DrawingController;
  private readonly matchController: MatchController;
  private readonly projector: RoomProjector;
  private readonly countdownMs: number;
  private readonly revealMs: number;
  private readonly reconnectGraceMs: number;
  private readonly pauseMaxMs: number;
  private readonly pauseCooldownMs: number;
  private readonly referenceArtEnabled: boolean;
  private readonly roundDurationOverrideMs?: number;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly ids: RoomIdGenerator;
  private readonly gameRuntime: ServerGameRuntime;
  private readonly gameDefinition: GameDefinition;
  private readonly promptEngine: PromptEngine;
  private readonly rateLimiter: RateLimiter;
  private roomChangedListener: ((roomCode: string) => void) | null = null;

  public constructor(options: InMemoryRoomLifecycleMachineOptions) {
    this.referenceArtEnabled = options?.referenceArtEnabled ?? true;
    this.countdownMs = options?.countdownMs ?? PRE_ROUND_COUNTDOWN_SECONDS * 1000;
    this.revealMs = options?.revealMs ?? REVEAL_DURATION_SECONDS * 1000;
    this.reconnectGraceMs = options?.reconnectGraceMs ?? RECONNECT_GRACE_PERIOD_SECONDS * 1000;
    this.pauseMaxMs = options?.pauseMaxMs ?? PAUSE_MAX_DURATION_SECONDS * 1000;
    this.pauseCooldownMs = options?.pauseCooldownMs ?? PAUSE_REPAUSE_COOLDOWN_SECONDS * 1000;
    this.roundDurationOverrideMs = options?.roundDurationOverrideMs;
    this.now = options?.now ?? Date.now;
    this.random = options?.random ?? Math.random;
    this.ids = options?.ids ?? { randomUUID };
    this.scheduler = new RoomScheduler({ adapter: options.scheduler });
    this.rateLimiter = new RateLimiter({ now: this.now });
    this.store = new RoomStore({ random: this.random });
    this.connectionController = new ConnectionController({
      store: this.store,
      scheduler: this.scheduler,
      rateLimiter: this.rateLimiter,
      reconnectGraceMs: this.reconnectGraceMs,
      now: this.now,
      clearRoomTimer: (room: RoomRecord) => this.clearRoomTimer(room),
      transitionToReveal: (room: RoomRecord, notify: boolean) => this.transitionToReveal(room, notify),
      transitionPausedTurnToReveal: (room: RoomRecord) => this.transitionPausedTurnToReveal(room),
      transitionToPostgame: (room: RoomRecord, notify: boolean) => this.transitionToPostgame(room, notify),
      notifyRoomChanged: (roomCode: string) => this.notifyRoomChanged(roomCode),
      scheduleReconnectTimer: (roomCode: string, player: RoomPlayerRecord, delayMs: number) =>
        this.scheduleReconnectTimer(roomCode, player, delayMs),
      touchRoom: (room: RoomRecord) => this.touchRoom(room),
    });
    if (!options?.gameRuntime && !options?.gamePack && !options?.gameDefinition && !options?.promptEngine) {
      throw new Error('InMemoryRoomLifecycleMachine requires a gameRuntime, gamePack, gameDefinition, or promptEngine. Inject a game runtime from the app boundary.');
    }

    this.gameRuntime = options.gameRuntime ?? (options.gamePack ? createServerGameRuntime(options.gamePack) : null) ?? (() => {
      const definition = options.gameDefinition;
      if (!definition) {
        throw new Error('InMemoryRoomLifecycleMachine requires a gameDefinition when only a promptEngine is provided.');
      }

      return {
        ...createServerGameRuntime({ definition }),
        prompts: options.promptEngine ?? createPromptEngine({ definition }),
      };
    })();
    this.gameDefinition = this.gameRuntime.definition;
    this.promptEngine = this.gameRuntime.prompts;
    this.drawingController = new DrawingController({
      applyDrawingAction,
      consumeDrawingRateLimit: (connectionId: string) => this.rateLimiter.consume('drawing', connectionId),
      touchRoom: (room: RoomRecord) => this.touchRoom(room),
      lobbyDrawingEnabled: this.gameRuntime.rules.features.lobbyDrawing,
    });
    this.projector = new RoomProjector({
      referenceArtEnabled: this.referenceArtEnabled,
      rules: this.gameRuntime.rules,
      promptEngine: this.promptEngine,
      now: this.now,
      getEffectiveMatchPhase: (room: RoomRecord) => this.getEffectiveMatchPhase(room),
      getGuessingDelayRemainingMs: (room: RoomRecord, activeTurn: ActiveTurnRecord) =>
        this.getGuessingDelayRemainingMs(room, activeTurn),
    });
    this.matchController = new MatchController({
      rooms: this.store.roomRecords,
      now: this.now,
      random: this.random,
      ids: this.ids,
      renderDrawingSnapshot: options.renderDrawingSnapshot,
      promptEngine: this.promptEngine,
      rules: this.gameRuntime.rules,
      countdownMs: this.countdownMs,
      revealMs: this.revealMs,
      pauseMaxMs: this.pauseMaxMs,
      pauseCooldownMs: this.pauseCooldownMs,
      getRoundDurationMs: (room: RoomRecord) => this.getRoundDurationMs(room),
      getPlayerNickname: (room: RoomRecord, playerId: string) => this.getPlayerNickname(room, playerId),
      notifyRoomChanged: (roomCode: string) => this.notifyRoomChanged(roomCode),
      clearRoomTimer: (room: RoomRecord) => this.clearRoomTimer(room),
      scheduleRoomTimer: (room: RoomRecord, delayMs: number, kind: RoomPhaseTimerKind) =>
        this.scheduleRoomPhaseTimer(room, delayMs, kind),
      freezeReconnectTimers: (room: RoomRecord) => this.freezeReconnectTimers(room),
      resumeReconnectTimers: (room: RoomRecord) => this.resumeReconnectTimers(room),
    });
  }

  public onChanged(listener: (roomCode: string) => void): void {
    this.roomChangedListener = listener;
  }

  public onRoomChanged(listener: (roomCode: string) => void): void {
    this.onChanged(listener);
  }

  public destroy(): void {
    for (const room of this.store.listRooms()) {
      this.scheduler.clearRoomTimers(room);
    }

    this.rateLimiter.clearAll();
  }

  public dispatch(command: RoomCommand): RoomCommandResult {
    switch (command.type) {
      case 'createRoom':
        return this.createRoom(command);
      case 'joinRoom':
        return this.joinRoom(command);
      case 'reclaimRoom':
        return this.reclaimRoom(command);
      case 'updateLobbySettings':
        return this.updateLobbySettings(command);
      case 'startRoom':
        return this.startRoom(command);
      case 'pauseRoom':
        return this.pauseRoom(command);
      case 'resumeRoom':
        return this.resumeRoom(command);
      case 'kickPlayer':
        return this.kickPlayer(command);
      case 'rerollTurn':
        return this.rerollTurn(command);
      case 'submitMessage':
        return this.submitMessage(command);
      case 'applyDrawingAction':
        return this.applyDrawingAction(command);
      case 'applyLobbyDrawingAction':
        return this.applyLobbyDrawingAction(command);
      case 'disconnect':
        return this.disconnect(command);
      case 'timerFired':
        return this.timerFired(command.timer);
    }
  }

  public query(query: RoomQuery): RoomQueryResult {
    switch (query.type) {
      case 'getRoomState':
        return this.getRoomState(query);
      case 'getBroadcastTargets':
        return this.getBroadcastTargets(query);
      case 'hasRoom':
        return this.hasRoom(query.code);
    }
  }

  public createRoom(input: ConnectionInput & { nickname: string }): ApiResult<CreateRoomSuccess> {
    const { nickname, connectionId: socketId, origin } = input;
    const normalizedNicknameResult = this.validateNicknameInput(nickname);

    if (!normalizedNicknameResult.ok) {
      return normalizedNicknameResult;
    }

    const code = this.store.createRoomCode();
    const playerId = this.ids.randomUUID();
    const sessionToken = this.ids.randomUUID();
    const room: RoomRecord = {
      code,
      stateRevision: 1,
      hostPlayerId: playerId,
      players: new Map(),
      lastActivityAt: this.now(),
      status: 'lobby',
      settings: this.gameRuntime.settings.defaults(),
      match: null,
      lobbyDrawing: createDrawingState(),
      lobbyFeed: [],
      timer: null,
    };

    const player = {
      id: playerId,
      nickname: normalizedNicknameResult.nickname,
      sessionToken,
      socketId,
      connected: true,
      reconnectBy: null,
      reconnectRemainingMs: null,
      reconnectTimer: null,
      canGuessFromTurnNumber: null,
    };

    appendRoomFeedRecord(room.lobbyFeed, {
      id: this.ids.randomUUID(),
      type: 'system',
      event: { type: 'playerJoined', nickname: normalizedNicknameResult.nickname },
      createdAt: this.now(),
      turnNumber: null,
    });

    this.store.addRoomWithPlayer(room, player);

    return {
      ok: true,
      data: {
        playerId,
        sessionToken,
        room: this.toRoomState(room, origin, playerId),
      },
    };
  }

  public joinRoom(input: ConnectionInput & { code: string; nickname: string }): ApiResult<JoinRoomSuccess> {
    const { code, nickname, connectionId: socketId, origin } = input;
    const joinRateLimitError = this.rateLimiter.consume('join', socketId);
    if (joinRateLimitError) {
      return joinRateLimitError;
    }

    const normalizedCode = normalizeRoomCode(code);
    const room = this.store.getRoom(normalizedCode);

    if (!room) {
      return this.roomNotFound();
    }

    if (room.status === 'postgame') {
      return {
        ok: false,
        error: {
          code: 'INVALID_STATE',
          message: 'This match is already over. Wait for the host to start the next game.',
        },
      };
    }

    const normalizedNicknameResult = this.validateNicknameInput(nickname);
    if (!normalizedNicknameResult.ok) {
      return normalizedNicknameResult;
    }

    if (room.players.size >= this.gameRuntime.rules.limits.maxPlayersPerRoom) {
      return {
        ok: false,
        error: {
          code: 'ROOM_FULL',
          message: 'Room is full.',
        },
      };
    }

    const comparisonNickname = normalizeNicknameForComparison(normalizedNicknameResult.nickname);
    const nicknameTaken = Array.from(room.players.values()).some(
      (player) => normalizeNicknameForComparison(player.nickname) === comparisonNickname,
    );

    if (nicknameTaken) {
      return {
        ok: false,
        error: {
          code: 'NICKNAME_TAKEN',
          message: 'That nickname is already in use in this room.',
        },
      };
    }

    const playerId = this.ids.randomUUID();
    const sessionToken = this.ids.randomUUID();
    const player = {
      id: playerId,
      nickname: normalizedNicknameResult.nickname,
      sessionToken,
      socketId,
      connected: true,
      reconnectBy: null,
      reconnectRemainingMs: null,
      reconnectTimer: null,
      canGuessFromTurnNumber: this.matchController.resolveCanGuessFromTurnNumberForJoin(room),
    };

    this.store.addPlayer(room, player);

    if (room.match) {
      this.matchController.addJoinedPlayer(room, player);
    } else {
      appendRoomFeedRecord(room.lobbyFeed, {
        id: this.ids.randomUUID(),
        type: 'system',
        event: { type: 'playerJoined', nickname: normalizedNicknameResult.nickname },
        createdAt: this.now(),
        turnNumber: null,
      });
    }

    this.touchRoom(room);

    return {
      ok: true,
      data: {
        playerId,
        sessionToken,
        room: this.toRoomState(room, origin, playerId),
      },
    };
  }

  public reclaimRoom(input: ConnectionInput & { code: string; sessionToken: string }): ApiResult<ReclaimRoomSuccess> {
    const { code, sessionToken, connectionId: socketId, origin } = input;
    const result = this.connectionController.reclaimRoom({ code, sessionToken, connectionId: socketId });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        playerId: result.player.id,
        sessionToken: result.player.sessionToken,
        room: this.toRoomState(result.room, origin, result.player.id),
      },
    };
  }

  public updateLobbySettings(input: ActorInput<{ settings: LobbySettings }>): ApiResult<UpdateLobbySettingsSuccess> {
    const { connectionId: socketId, origin, payload: { settings } } = input;
    const room = this.getActorRoom(socketId);

    if (!room.ok) {
      return room;
    }

    if (room.value.hostPlayerId !== room.value.playerId) {
      return {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only the host can update room settings.',
        },
      };
    }

    if (!this.gameRuntime.settings.validate(settings)) {
      return {
        ok: false,
        error: {
          code: 'INVALID_SETTINGS',
          message: 'One or more lobby settings are invalid.',
        },
      };
    }

    if (!['lobby', 'postgame'].includes(room.value.room.status)) {
      return {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Lobby settings can only be updated before the game starts or between rematches.',
        },
      };
    }

    room.value.room.settings = this.gameRuntime.settings.normalize(settings);
    this.touchRoom(room.value.room);

    return {
      ok: true,
      data: {
        room: this.toRoomState(room.value.room, origin, room.value.playerId),
      },
    };
  }

  public startRoom(input: EmptyActorInput): ApiResult<StartRoomSuccess> {
    const { connectionId: socketId, origin } = input;
    const room = this.getActorRoom(socketId);

    if (!room.ok) {
      return room;
    }

    if (room.value.hostPlayerId !== room.value.playerId) {
      return {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only the host can start the game.',
        },
      };
    }

    const startResult = this.matchController.startRoom(room.value.room);

    if (!startResult.ok) {
      return startResult;
    }

    this.touchRoom(room.value.room);

    return {
      ok: true,
      data: {
        room: this.toRoomState(room.value.room, origin, room.value.playerId),
      },
    };
  }

  public pauseRoom(input: EmptyActorInput): ApiResult<PauseRoomSuccess> {
    const { connectionId: socketId, origin } = input;
    const room = this.getActorRoom(socketId);

    if (!room.ok) {
      return room;
    }

    if (room.value.hostPlayerId !== room.value.playerId) {
      return {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only the host can pause the game.',
        },
      };
    }

    const currentRoom = room.value.room;
    const pauseResult = this.matchController.pauseRoom(currentRoom);

    if (!pauseResult.ok) {
      return pauseResult;
    }

    this.touchRoom(currentRoom);

    return {
      ok: true,
      data: {
        room: this.toRoomState(currentRoom, origin, room.value.playerId),
      },
    };
  }

  public resumeRoom(input: EmptyActorInput): ApiResult<ResumeRoomSuccess> {
    const { connectionId: socketId, origin } = input;
    const room = this.getActorRoom(socketId);

    if (!room.ok) {
      return room;
    }

    if (room.value.hostPlayerId !== room.value.playerId) {
      return {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only the host can resume the game.',
        },
      };
    }

    const currentRoom = room.value.room;
    const resumeResult = this.matchController.resumeRoom(currentRoom);

    if (!resumeResult.ok) {
      return resumeResult;
    }

    this.touchRoom(currentRoom);

    return {
      ok: true,
      data: {
        room: this.toRoomState(currentRoom, origin, room.value.playerId),
      },
    };
  }

  public kickPlayer(input: ActorInput<{ playerId: string }>): KickPlayerResult {
    const { connectionId: socketId, origin, payload: { playerId } } = input;
    const room = this.getActorRoom(socketId);

    if (!room.ok) {
      return room;
    }

    if (room.value.hostPlayerId !== room.value.playerId) {
      return {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only the host can kick players.',
        },
      };
    }

    if (playerId === room.value.hostPlayerId) {
      return {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'The host cannot kick themself.',
        },
      };
    }

    const targetPlayer = room.value.room.players.get(playerId);
    if (!targetPlayer) {
      return {
        ok: false,
        error: {
          code: 'INVALID_STATE',
          message: 'That player is no longer in the room.',
        },
      };
    }

    const removedPlayer = this.connectionController.removePlayerFromRoom(room.value.room, playerId);

    return {
      ok: true,
      data: {
        kickedPlayerId: playerId,
        room: this.toRoomState(room.value.room, origin, room.value.playerId),
      },
      kickedConnectionId: removedPlayer.connectionId,
    };
  }

  public rerollTurn(input: EmptyActorInput): ApiResult<RerollTurnSuccess> {
    const { connectionId: socketId, origin } = input;
    const room = this.getActorRoom(socketId);

    if (!room.ok) {
      return room;
    }

    const rerollResult = this.matchController.rerollTurn(room.value.room, room.value.playerId);

    if (!rerollResult.ok) {
      return rerollResult;
    }

    return {
      ok: true,
      data: {
        room: this.toRoomState(room.value.room, origin, room.value.playerId),
      },
    };
  }

  public applyDrawingAction(input: ActorInput<{ action: DrawingAction }>): ApiResult<DrawingActionSuccess> {
    const { connectionId: socketId, payload: { action } } = input;
    const room = this.getActorRoom(socketId);

    if (!room.ok) {
      return room;
    }

    return this.drawingController.applyMatchDrawingAction({
      room: room.value.room,
      playerId: room.value.playerId,
      connectionId: socketId,
      action,
    });
  }

  public applyLobbyDrawingAction(input: ActorInput<{ action: DrawingAction }>): ApiResult<LobbyDrawingActionSuccess> {
    const { connectionId: socketId, payload: { action } } = input;
    const room = this.getActorRoom(socketId);

    if (!room.ok) {
      return room;
    }

    return this.drawingController.applyLobbyDrawingAction({
      room: room.value.room,
      playerId: room.value.playerId,
      connectionId: socketId,
      action,
    });
  }

  public submitMessage(input: ActorInput<{ text: string }>): ApiResult<SubmitMessageSuccess> {
    const { connectionId: socketId, origin, payload: { text } } = input;
    const room = this.getActorRoom(socketId);

    if (!room.ok) {
      return room;
    }

    const chatRateLimitError = this.rateLimiter.consume('chat', socketId);
    if (chatRateLimitError) {
      return chatRateLimitError;
    }

    const normalizedMessageResult = this.validateMessageInput(text);
    if (!normalizedMessageResult.ok) {
      return normalizedMessageResult;
    }

    const currentRoom = room.value.room;
    const player = currentRoom.players.get(room.value.playerId);

    if (!player) {
      return {
        ok: false,
        error: {
          code: 'INVALID_STATE',
          message: 'Player not found.',
        },
      };
    }

    if (currentRoom.status === 'lobby' || currentRoom.status === 'postgame') {
      appendRoomFeedRecord(currentRoom.lobbyFeed, {
        id: this.ids.randomUUID(),
        type: 'playerChat',
        senderPlayerId: player.id,
        senderNickname: player.nickname,
        text: normalizedMessageResult.text,
        createdAt: this.now(),
        turnNumber: null,
      });

      this.notifyRoomChanged(currentRoom.code);

      return {
        ok: true,
        data: {
          room: this.toRoomState(currentRoom, origin, player.id),
        },
      };
    }

    const messageResult = this.matchController.submitMatchMessage({
      room: currentRoom,
      player,
      text: normalizedMessageResult.text,
    });

    if (!messageResult.ok) {
      return messageResult;
    }

    this.notifyRoomChanged(currentRoom.code);

    return {
      ok: true,
      data: {
        room: this.toRoomState(currentRoom, origin, player.id),
      },
    };
  }

  public getRoomState(input: { code: string; origin: string; viewerConnectionId?: string }): ApiResult<RoomStateSuccess> {
    const normalizedCode = normalizeRoomCode(input.code);
    const room = this.store.getRoom(normalizedCode);

    if (!room) {
      return this.roomNotFound();
    }

    const membership = input.viewerConnectionId ? this.store.getConnection(input.viewerConnectionId) : undefined;
    const viewerPlayerId = membership?.roomCode === normalizedCode ? membership.playerId : undefined;

    return {
      ok: true,
      data: {
        room: this.toRoomState(room, input.origin, viewerPlayerId),
      },
    };
  }

  public getBroadcastTargets(input: { code: string; origin: string }): BroadcastTarget[] {
    const room = this.store.getRoom(input.code);

    if (!room) {
      return [];
    }

    return this.projector.projectBroadcastTargets({ room, origin: input.origin }).map((target) => ({
      connectionId: target.socketId,
      room: target.room,
    }));
  }

  public disconnect(input: { connectionId: string }): string | null {
    return this.connectionController.disconnect(input.connectionId);
  }

  public hasRoom(code: string): boolean {
    return this.store.hasRoom(code);
  }

  private getActorRoom(socketId: string):
    | { ok: true; value: { room: RoomRecord; playerId: string; hostPlayerId: string } }
    | { ok: false; error: { code: 'ROOM_NOT_FOUND'; message: string } } {
    const actorRoom = this.store.getActorRoom(socketId);

    if (!actorRoom) {
      return this.roomNotFound();
    }

    return {
      ok: true,
      value: actorRoom,
    };
  }

  private toRoomState(room: RoomRecord, origin: string, viewerPlayerId?: string): RoomState {
    return this.projector.project({ room, origin, viewerPlayerId });
  }

  private transitionToCountdown(room: RoomRecord, notify: boolean): void {
    this.matchController.transitionToCountdown(room, notify);
  }

  private transitionToRound(room: RoomRecord, notify: boolean): void {
    this.matchController.transitionToRound(room, notify);
  }

  private transitionToReveal(room: RoomRecord, notify: boolean): void {
    this.matchController.transitionToReveal(room, notify);
  }

  private transitionPausedTurnToReveal(room: RoomRecord): void {
    this.matchController.transitionPausedTurnToReveal(room);
  }

  private transitionToPostgame(room: RoomRecord, notify: boolean): void {
    this.matchController.transitionToPostgame(room, notify);
  }

  public timerFired(input: RoomTimerFiredInput): void {
    if (input.type === 'phase') {
      this.matchController.handleRoomPhaseTimer(input.roomCode, input.kind);
      return;
    }

    this.connectionController.handleReconnectTimer(input.roomCode, input.playerId);
  }

  private scheduleRoomPhaseTimer(room: RoomRecord, delayMs: number, kind: RoomPhaseTimerKind): void {
    this.scheduler.scheduleRoomTimer(room, delayMs, () => this.timerFired({ type: 'phase', roomCode: room.code, kind }));
  }

  private scheduleReconnectTimer(roomCode: string, player: RoomPlayerRecord, delayMs: number): void {
    this.scheduler.scheduleReconnectTimer(player, delayMs, () => this.timerFired({ type: 'reconnect', roomCode, playerId: player.id }));
  }

  private clearRoomTimer(room: RoomRecord): void {
    this.scheduler.clearRoomTimer(room);
  }

  private freezeReconnectTimers(room: RoomRecord): void {
    this.connectionController.freezeReconnectTimers(room);
  }

  private resumeReconnectTimers(room: RoomRecord): void {
    this.connectionController.resumeReconnectTimers(room);
  }

  private isLivePhase(status: RoomState['status']): status is LiveRoomStatus {
    return ['countdown', 'round', 'reveal'].includes(status);
  }

  private getEffectiveMatchPhase(room: RoomRecord): LiveRoomStatus | null {
    if (room.status === 'paused') {
      return room.match?.pause?.pausedPhase ?? null;
    }

    return this.isLivePhase(room.status) ? room.status : null;
  }

  private getRoundDurationMs(room: RoomRecord): number {
    if (this.roundDurationOverrideMs !== undefined) {
      return this.roundDurationOverrideMs;
    }

    return room.settings.roundTimerSeconds * 1000;
  }

  private getGuessingDelayRemainingMs(room: RoomRecord, activeTurn: ActiveTurnRecord): number {
    const guessingDelayMs = (room.settings.guessingDelaySeconds ?? 0) * 1000;

    if (guessingDelayMs <= 0) {
      return 0;
    }

    const roundElapsedMs = this.getActiveTurnElapsedMs(room, activeTurn);

    if (roundElapsedMs === null) {
      return guessingDelayMs;
    }

    return Math.max(0, guessingDelayMs - roundElapsedMs);
  }

  private getActiveTurnElapsedMs(room: RoomRecord, activeTurn: ActiveTurnRecord): number | null {
    if (room.status === 'paused' && room.match?.pause?.pausedPhase === 'round') {
      return room.match.pause.roundElapsedMs;
    }

    if (activeTurn.roundStartedAt === null) {
      return null;
    }

    return Math.max(0, this.now() - activeTurn.roundStartedAt);
  }


  private getPlayerNickname(room: RoomRecord, playerId: string): string {
    return room.players.get(playerId)?.nickname ?? 'Unknown player';
  }

  private touchRoom(room: RoomRecord): void {
    room.stateRevision += 1;
    room.lastActivityAt = this.now();
  }

  public deleteIdleRooms(idleMs: number): string[] {
    const now = this.now();
    const deletedRoomCodes: string[] = [];

    for (const room of this.store.listRooms()) {
      if (now - room.lastActivityAt < idleMs || this.hasConnectedOrReservedPlayer(room, now)) {
        continue;
      }

      this.scheduler.clearRoomTimers(room);
      for (const player of room.players.values()) {
        if (player.socketId) {
          this.rateLimiter.clearActor(player.socketId);
        }
      }
      this.store.deleteRoom(room.code);
      deletedRoomCodes.push(room.code);
    }

    return deletedRoomCodes;
  }

  private hasConnectedOrReservedPlayer(room: RoomRecord, now: number): boolean {
    for (const player of room.players.values()) {
      if (player.connected || (player.reconnectBy !== null && player.reconnectBy > now) || player.reconnectRemainingMs !== null) {
        return true;
      }
    }

    return false;
  }

  private notifyRoomChanged(roomCode: string): void {
    const room = this.store.getRoom(roomCode);
    if (room) {
      this.touchRoom(room);
    }

    this.roomChangedListener?.(roomCode);
  }

  private validateNicknameInput(nickname: string):
    | { ok: true; nickname: string }
    | {
        ok: false;
        error: {
          code: 'INVALID_NICKNAME';
          message: string;
        };
      } {
    const normalizedNickname = normalizeNickname(nickname);

    if (!isNicknameValid(normalizedNickname)) {
      return {
        ok: false,
        error: {
          code: 'INVALID_NICKNAME',
          message: 'Nickname is required.',
        },
      };
    }

    if (containsProfanity(normalizedNickname)) {
      return {
        ok: false,
        error: {
          code: 'INVALID_NICKNAME',
          message: 'Choose a different nickname.',
        },
      };
    }

    return {
      ok: true,
      nickname: normalizedNickname,
    };
  }

  private validateMessageInput(text: string):
    | { ok: true; text: string }
    | {
        ok: false;
        error: {
          code: 'INVALID_MESSAGE';
          message: string;
        };
      } {
    const normalizedText = text.trim();

    if (!normalizedText) {
      return {
        ok: false,
        error: {
          code: 'INVALID_MESSAGE',
          message: 'Enter a message before sending.',
        },
      };
    }

    if (normalizedText.length > MAX_CHAT_MESSAGE_LENGTH) {
      return {
        ok: false,
        error: {
          code: 'INVALID_MESSAGE',
          message: `Messages must be ${MAX_CHAT_MESSAGE_LENGTH} characters or fewer.`,
        },
      };
    }

    return {
      ok: true,
      text: normalizedText,
    };
  }

  private roomNotFound(): { ok: false; error: { code: 'ROOM_NOT_FOUND'; message: string } } {
    return {
      ok: false,
      error: {
        code: 'ROOM_NOT_FOUND',
        message: 'Room not found or expired.',
      },
    };
  }

  private sessionExpired(): { ok: false; error: { code: 'SESSION_EXPIRED'; message: string } } {
    return {
      ok: false,
      error: {
        code: 'SESSION_EXPIRED',
        message: 'Your reserved seat could not be restored. Join again if the room is still active.',
      },
    };
  }
}
