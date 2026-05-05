import { type ApiError, type LiveRoomStatus, type RoomState, type RoundScoreChange } from '@7ito/sketcherson-common/room';
import type { ResolvedDrawingGameRules } from '@7ito/sketcherson-common/game';
import type { DrawingState } from '@7ito/sketcherson-common/drawing';
import type { PromptEngine } from '@7ito/sketcherson-common/prompts';
import { createAsyncSnapshotRenderer, createDrawingState, finalizeDrawingState, type AsyncSnapshotRenderer } from '../drawing';
import { addPlayerTurnsForRounds, buildTurnPlan } from '../match';
import { appendRoomFeedRecord, capCompletedTurnImageRetention, type ActiveTurnRecord, type MatchRecord, type RoomFeedRecord, type RoomPlayerRecord, type RoomRecord } from './model';
import type { RoomPhaseTimerKind } from './timers';

export interface MatchControllerOptions {
  rooms: Map<string, RoomRecord>;
  now: () => number;
  random: () => number;
  ids: { randomUUID(): string };
  renderDrawingSnapshot?: (drawing: DrawingState) => string | null;
  promptEngine: PromptEngine;
  rules: ResolvedDrawingGameRules;
  countdownMs: number;
  revealMs: number;
  pauseMaxMs: number;
  pauseCooldownMs: number;
  getRoundDurationMs: (room: RoomRecord) => number;
  getPlayerNickname: (room: RoomRecord, playerId: string) => string;
  notifyRoomChanged: (roomCode: string) => void;
  clearRoomTimer: (room: RoomRecord) => void;
  scheduleRoomTimer: (room: RoomRecord, delayMs: number, kind: RoomPhaseTimerKind) => void;
  freezeReconnectTimers: (room: RoomRecord) => void;
  resumeReconnectTimers: (room: RoomRecord) => void;
}

export class MatchController {
  private readonly rooms: Map<string, RoomRecord>;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly ids: { randomUUID(): string };
  private readonly renderDrawingSnapshot?: (drawing: DrawingState) => string | null;
  private readonly asyncSnapshotRenderer: AsyncSnapshotRenderer;
  private readonly promptEngine: PromptEngine;
  private readonly rules: ResolvedDrawingGameRules;
  private readonly countdownMs: number;
  private readonly revealMs: number;
  private readonly pauseMaxMs: number;
  private readonly pauseCooldownMs: number;
  private readonly getRoundDurationMs: (room: RoomRecord) => number;
  private readonly getPlayerNickname: (room: RoomRecord, playerId: string) => string;
  private readonly notifyRoomChanged: (roomCode: string) => void;
  private readonly clearRoomTimer: (room: RoomRecord) => void;
  private readonly scheduleRoomTimer: (room: RoomRecord, delayMs: number, kind: RoomPhaseTimerKind) => void;
  private readonly freezeReconnectTimers: (room: RoomRecord) => void;
  private readonly resumeReconnectTimers: (room: RoomRecord) => void;

  public constructor(options: MatchControllerOptions) {
    this.rooms = options.rooms;
    this.now = options.now;
    this.random = options.random;
    this.ids = options.ids;
    this.renderDrawingSnapshot = options.renderDrawingSnapshot;
    this.asyncSnapshotRenderer = createAsyncSnapshotRenderer();
    this.promptEngine = options.promptEngine;
    this.rules = options.rules;
    this.countdownMs = options.countdownMs;
    this.revealMs = options.revealMs;
    this.pauseMaxMs = options.pauseMaxMs;
    this.pauseCooldownMs = options.pauseCooldownMs;
    this.getRoundDurationMs = options.getRoundDurationMs;
    this.getPlayerNickname = options.getPlayerNickname;
    this.notifyRoomChanged = options.notifyRoomChanged;
    this.clearRoomTimer = options.clearRoomTimer;
    this.scheduleRoomTimer = options.scheduleRoomTimer;
    this.freezeReconnectTimers = options.freezeReconnectTimers;
    this.resumeReconnectTimers = options.resumeReconnectTimers;
  }

  public startRoom(room: RoomRecord): { ok: true } | { ok: false; error: ApiError } {
    if (!['lobby', 'postgame'].includes(room.status)) {
      return {
        ok: false,
        error: {
          code: 'INVALID_STATE',
          message: 'This room is already running a match.',
        },
      };
    }

    const connectedPlayerIds = Array.from(room.players.values())
      .filter((player) => player.connected)
      .map((player) => player.id);

    if (connectedPlayerIds.length < this.rules.limits.minPlayersToStart) {
      return {
        ok: false,
        error: {
          code: 'NOT_ENOUGH_PLAYERS',
          message: `At least ${this.rules.limits.minPlayersToStart} connected players are required to start.`,
        },
      };
    }

    for (const player of room.players.values()) {
      player.canGuessFromTurnNumber = 1;
    }

    room.lobbyDrawing = createDrawingState();

    const connectedPlayers = Array.from(room.players.values()).filter((player) => player.connected);
    const initialFeedItems = connectedPlayers.map((player) =>
      this.createSystemFeedItem({ type: 'playerJoined', nickname: player.nickname }, null, this.now()),
    );

    room.match = {
      turnPlan: buildTurnPlan(connectedPlayerIds, room.settings.turnsPerPlayer, this.random, this.rules.limits.maxTotalTurns),
      currentTurnIndex: 0,
      activeTurn: null,
      completedTurns: [],
      phaseEndsAt: null,
      feed: initialFeedItems,
      pause: null,
      pauseCooldownEndsAt: null,
      usedPromptIds: new Set(),
      playersPerRound: connectedPlayerIds.length,
      scoreboard: new Map(
        Array.from(room.players.values()).map((player) => [
          player.id,
          {
            playerId: player.id,
            nickname: player.nickname,
            score: 0,
          },
        ]),
      ),
    };

    this.transitionToCountdown(room, false);

    return { ok: true };
  }

  public resolveCanGuessFromTurnNumberForJoin(room: RoomRecord): number | null {
    const activeTurn = room.match?.activeTurn;
    const effectivePhase = this.getEffectiveMatchPhase(room);

    if (!room.match || !activeTurn || !effectivePhase) {
      return null;
    }

    if (effectivePhase === 'countdown' || effectivePhase === 'round') {
      return activeTurn.turnNumber;
    }

    return activeTurn.turnNumber + 1;
  }

  public addJoinedPlayer(room: RoomRecord, player: RoomPlayerRecord): void {
    const match = room.match;

    if (!match) {
      return;
    }

    match.scoreboard.set(player.id, {
      playerId: player.id,
      nickname: player.nickname,
      score: 0,
    });

    const firstDrawRound = this.resolveFirstLateJoinDrawRound(room);
    if (firstDrawRound !== null) {
      match.turnPlan = addPlayerTurnsForRounds(
        match.turnPlan,
        player.id,
        firstDrawRound,
        room.settings.turnsPerPlayer,
        this.rules.limits.maxTotalTurns,
      );
    }

    appendRoomFeedRecord(match.feed, this.createSystemFeedItem(
      { type: 'playerJoined', nickname: player.nickname },
      match.activeTurn?.turnNumber ?? null,
      this.now(),
    ));
  }

  public transitionToCountdown(room: RoomRecord, notify: boolean): void {
    const match = room.match;
    if (!match) {
      return;
    }

    const plannedTurn = match.turnPlan[match.currentTurnIndex];
    if (!plannedTurn) {
      this.transitionToPostgame(room, notify);
      return;
    }

    const drawerNickname = this.getPlayerNickname(room, plannedTurn.drawerPlayerId);
    const promptAssignment = this.promptEngine.assign({
      collectionIds: room.settings.enabledCollectionIds,
      usedPromptIds: match.usedPromptIds,
      random: this.random,
    });
    const prompt = promptAssignment.prompt;
    room.status = 'countdown';
    match.pause = null;
    match.phaseEndsAt = this.now() + this.countdownMs;
    match.activeTurn = {
      turnNumber: plannedTurn.turnNumber,
      roundNumber: plannedTurn.roundNumber,
      drawerPlayerId: plannedTurn.drawerPlayerId,
      drawerNickname,
      promptId: prompt.id,
      prompt: prompt.name,
      rerollsRemaining: this.rules.turns.rerollsPerTurn,
      rerolledFrom: null,
      roundStartedAt: null,
      roundDurationMs: this.getRoundDurationMs(room),
      correctGuessPlayerIds: new Set(),
      scoreChanges: new Map(),
      drawing: createDrawingState(),
    };
    match.usedPromptIds = promptAssignment.usedPromptIds;

    const previousPlannedTurn = match.turnPlan[match.currentTurnIndex - 1];
    const isNewRound = !previousPlannedTurn || previousPlannedTurn.roundNumber !== plannedTurn.roundNumber;

    if (isNewRound) {
      appendRoomFeedRecord(match.feed, this.createRoundHeaderFeedItem(plannedTurn.roundNumber, plannedTurn.turnNumber, this.now()));
    }

    appendRoomFeedRecord(match.feed, this.createSystemFeedItem({ type: 'drawerAssigned', drawerNickname }, plannedTurn.turnNumber, this.now()));

    this.scheduleRoomPhaseKindTimer(room, this.countdownMs, 'countdownEnded');

    if (notify) {
      this.notifyRoomChanged(room.code);
    }
  }

  public transitionToRound(room: RoomRecord, notify: boolean): void {
    const match = room.match;
    if (!match || !match.activeTurn) {
      return;
    }

    match.pause = null;
    match.activeTurn.roundStartedAt = this.now();
    match.activeTurn.roundDurationMs = this.getRoundDurationMs(room);
    room.status = 'round';
    match.phaseEndsAt = match.activeTurn.roundStartedAt + match.activeTurn.roundDurationMs;

    this.scheduleRoomPhaseKindTimer(room, match.activeTurn.roundDurationMs, 'roundEnded');

    if (notify) {
      this.notifyRoomChanged(room.code);
    }
  }

  public transitionToReveal(room: RoomRecord, notify: boolean): void {
    const match = room.match;
    const activeTurn = match?.activeTurn;
    if (!match || !activeTurn) {
      return;
    }

    if (this.renderDrawingSnapshot) {
      finalizeDrawingState(activeTurn.drawing, this.renderDrawingSnapshot);
    } else {
      finalizeDrawingState(activeTurn.drawing, () => null);
      this.renderRevealSnapshotAsync(room.code, activeTurn.turnNumber, activeTurn.drawing);
    }

    appendRoomFeedRecord(match.feed, this.createSystemFeedItem({ type: 'answerRevealed', answer: activeTurn.prompt }, activeTurn.turnNumber, this.now()));

    room.status = 'reveal';
    match.pause = null;
    match.phaseEndsAt = this.now() + this.revealMs;
    match.completedTurns = [...match.completedTurns, buildCompletedTurn(activeTurn)];
    capCompletedTurnImageRetention(match.completedTurns);

    this.scheduleRoomPhaseKindTimer(room, this.revealMs, 'revealEnded');

    if (notify) {
      this.notifyRoomChanged(room.code);
    }
  }

  public transitionPausedTurnToReveal(room: RoomRecord): void {
    const match = room.match;
    const pause = match?.pause;
    const activeTurn = match?.activeTurn;

    if (!match || room.status !== 'paused' || !pause || !activeTurn) {
      return;
    }

    finalizeDrawingState(activeTurn.drawing, this.renderDrawingSnapshot ?? (() => null));
    if (!this.renderDrawingSnapshot) {
      this.renderRevealSnapshotAsync(room.code, activeTurn.turnNumber, activeTurn.drawing);
    }

    pause.pausedPhase = 'reveal';
    pause.phaseRemainingMs = this.revealMs;
    pause.roundElapsedMs = null;
    match.completedTurns = [...match.completedTurns, buildCompletedTurn(activeTurn)];
    capCompletedTurnImageRetention(match.completedTurns);

    this.notifyRoomChanged(room.code);
  }

  public transitionToPostgame(room: RoomRecord, notify: boolean): void {
    if (!room.match) {
      return;
    }

    room.status = 'postgame';
    room.match.pause = null;
    room.match.pauseCooldownEndsAt = null;
    room.match.phaseEndsAt = null;
    room.match.activeTurn = null;
    this.clearRoomTimer(room);

    if (notify) {
      this.notifyRoomChanged(room.code);
    }
  }

  public pauseRoom(room: RoomRecord): { ok: true } | { ok: false; error: ApiError } {
    if (!this.rules.features.pause) {
      return {
        ok: false,
        error: {
          code: 'INVALID_STATE',
          message: 'Pause is disabled for this game.',
        },
      };
    }

    const match = room.match;

    if (!match || !this.isLivePhase(room.status) || !match.activeTurn || match.phaseEndsAt === null) {
      return {
        ok: false,
        error: {
          code: 'INVALID_STATE',
          message: 'Pause is only available during a live match phase.',
        },
      };
    }

    if (match.pauseCooldownEndsAt !== null && match.pauseCooldownEndsAt > this.now()) {
      return {
        ok: false,
        error: {
          code: 'INVALID_STATE',
          message: 'Pause is cooling down after the last resume.',
        },
      };
    }

    if (match.pauseCooldownEndsAt !== null && match.pauseCooldownEndsAt <= this.now()) {
      match.pauseCooldownEndsAt = null;
    }

    const pausedPhase = room.status;
    const phaseRemainingMs = Math.max(0, match.phaseEndsAt - this.now());
    const roundElapsedMs =
      room.status === 'round' && match.activeTurn.roundStartedAt !== null
        ? Math.max(0, this.now() - match.activeTurn.roundStartedAt)
        : null;

    room.status = 'paused';
    match.phaseEndsAt = null;
    match.pause = {
      mode: 'paused',
      pausedPhase,
      phaseRemainingMs,
      pauseEndsAt: this.now() + this.pauseMaxMs,
      resumeEndsAt: null,
      roundElapsedMs,
    };

    appendRoomFeedRecord(match.feed, this.createSystemFeedItem({ type: 'gamePaused' }, match.activeTurn.turnNumber, this.now()));

    this.freezeReconnectTimers(room);

    this.scheduleRoomPhaseKindTimer(room, this.pauseMaxMs, 'pauseExpired');

    return { ok: true };
  }

  public resumeRoom(room: RoomRecord): { ok: true } | { ok: false; error: ApiError } {
    const match = room.match;

    if (!match || room.status !== 'paused' || !match.pause) {
      return {
        ok: false,
        error: {
          code: 'INVALID_STATE',
          message: 'This room is not currently paused.',
        },
      };
    }

    if (match.pause.mode === 'resuming') {
      return {
        ok: false,
        error: {
          code: 'INVALID_STATE',
          message: 'Resume countdown is already running.',
        },
      };
    }

    this.beginResumeCountdown(room, false);

    return { ok: true };
  }

  public beginResumeCountdown(room: RoomRecord, notify: boolean): void {
    const match = room.match;
    if (!match || room.status !== 'paused' || !match.pause) {
      return;
    }

    this.clearRoomTimer(room);
    match.pause.mode = 'resuming';
    match.pause.pauseEndsAt = null;
    match.pause.resumeEndsAt = this.now() + this.countdownMs;

    this.scheduleRoomPhaseKindTimer(room, this.countdownMs, 'resumeCountdownEnded');

    if (notify) {
      this.notifyRoomChanged(room.code);
    }
  }

  public finishResumeCountdown(room: RoomRecord, notify: boolean): void {
    const match = room.match;
    const pause = match?.pause;
    if (!match || room.status !== 'paused' || !pause) {
      return;
    }

    appendRoomFeedRecord(match.feed, this.createSystemFeedItem({ type: 'gameResumed' }, match.activeTurn?.turnNumber ?? null, this.now()));

    room.status = pause.pausedPhase;
    match.pause = null;
    match.pauseCooldownEndsAt = this.now() + this.pauseCooldownMs;
    match.phaseEndsAt = this.now() + pause.phaseRemainingMs;

    if (pause.pausedPhase === 'round' && match.activeTurn && pause.roundElapsedMs !== null) {
      match.activeTurn.roundStartedAt = this.now() - pause.roundElapsedMs;
    }

    this.resumeReconnectTimers(room);
    this.scheduleRoomPhaseTimer(room, pause.phaseRemainingMs);

    if (notify) {
      this.notifyRoomChanged(room.code);
    }
  }

  public rerollTurn(room: RoomRecord, playerId: string): { ok: true } | { ok: false; error: ApiError } {
    const match = room.match;
    const activeTurn = match?.activeTurn;

    if (!match || !activeTurn || !['countdown', 'round'].includes(room.status)) {
      return {
        ok: false,
        error: {
          code: 'INVALID_STATE',
          message: 'There is no active turn to reroll right now.',
        },
      };
    }

    if (activeTurn.drawerPlayerId !== playerId) {
      return {
        ok: false,
        error: {
          code: 'NOT_DRAWER',
          message: 'Only the active drawer can reroll the prompt.',
        },
      };
    }

    if (activeTurn.rerollsRemaining < 1) {
      return {
        ok: false,
        error: {
          code: 'REROLL_UNAVAILABLE',
          message: 'This turn has already used its reroll.',
        },
      };
    }

    const previousPrompt = activeTurn.prompt;
    const nextPrompt = this.promptEngine.reroll({
      currentPromptId: activeTurn.promptId,
      collectionIds: room.settings.enabledCollectionIds,
      usedPromptIds: match.usedPromptIds,
      random: this.random,
    });
    activeTurn.promptId = nextPrompt.prompt.id;
    activeTurn.prompt = nextPrompt.prompt.name;
    activeTurn.rerollsRemaining -= 1;
    activeTurn.rerolledFrom = nextPrompt.rerolledFrom?.name ?? previousPrompt;
    match.usedPromptIds = nextPrompt.usedPromptIds;

    return { ok: true };
  }

  public submitMatchMessage(input: {
    room: RoomRecord;
    player: RoomPlayerRecord;
    text: string;
  }): { ok: true } | { ok: false; error: ApiError } {
    const match = input.room.match;

    if (!match) {
      return {
        ok: false,
        error: {
          code: 'INVALID_STATE',
          message: 'Chat is only available while a match is active.',
        },
      };
    }

    const activeTurn = match.activeTurn;
    const effectivePhase = this.getEffectiveMatchPhase(input.room);

    if (effectivePhase === 'round' && activeTurn) {
      if (activeTurn.correctGuessPlayerIds.has(input.player.id)) {
        return {
          ok: false,
          error: {
            code: 'ALREADY_GUESSED',
            message: 'You already guessed correctly this round. Wait for the next turn.',
          },
        };
      }

      if (input.player.id !== activeTurn.drawerPlayerId && this.getGuessingDelayRemainingMs(input.room, activeTurn) > 0) {
        const delaySeconds = input.room.settings.guessingDelaySeconds ?? 0;

        return {
          ok: false,
          error: {
            code: 'INVALID_STATE',
            message: `Guessing and chat are disabled for the first ${delaySeconds} seconds of each round.`,
          },
        };
      }

      const guessEvaluation = this.promptEngine.evaluateGuess(activeTurn.promptId, input.text);

      if (
        input.player.id !== activeTurn.drawerPlayerId &&
        this.canPlayerGuessOnTurn(input.player, activeTurn.turnNumber) &&
        guessEvaluation.correct
      ) {
        this.recordCorrectGuess(input.room, match, activeTurn, input.player.id, input.player.nickname);

        return { ok: true };
      }

      if (
        input.player.id !== activeTurn.drawerPlayerId &&
        this.canPlayerGuessOnTurn(input.player, activeTurn.turnNumber) &&
        this.rules.features.closeGuessFeedback &&
        guessEvaluation.closeGuess
      ) {
        if (input.room.settings.showCloseGuessAlerts ?? true) {
          appendRoomFeedRecord(match.feed, this.createSystemFeedItem(
            { type: 'closeGuess', guesserNickname: input.player.nickname, kind: guessEvaluation.closeGuess.kind, message: guessEvaluation.closeGuess.message },
            activeTurn.turnNumber,
            this.now(),
            { type: 'player', playerId: input.player.id },
          ));
        }

        if (input.room.settings.hideCloseGuesses) {
          return { ok: true };
        }
      }
    }

    appendRoomFeedRecord(match.feed, {
      id: this.ids.randomUUID(),
      type: 'playerChat',
      senderPlayerId: input.player.id,
      senderNickname: input.player.nickname,
      text: input.text,
      createdAt: this.now(),
      turnNumber: activeTurn?.turnNumber ?? null,
    });

    return { ok: true };
  }

  private recordCorrectGuess(
    room: RoomRecord,
    match: MatchRecord,
    activeTurn: ActiveTurnRecord,
    playerId: string,
    nickname: string,
  ): void {
    activeTurn.correctGuessPlayerIds.add(playerId);

    const elapsedMs = this.getActiveTurnElapsedMs(room, activeTurn) ?? 0;
    const guesserPoints = this.rules.scoring.scoreCorrectGuess({ elapsedMs, roundDurationMs: activeTurn.roundDurationMs });
    const drawerPoints = this.rules.scoring.drawerPointsPerCorrectGuess;

    this.incrementScore(match, playerId, nickname, guesserPoints);
    this.incrementScore(match, activeTurn.drawerPlayerId, activeTurn.drawerNickname, drawerPoints);
    this.recordRoundScoreChange(activeTurn, playerId, nickname, guesserPoints, 'guesser');
    this.recordRoundScoreChange(activeTurn, activeTurn.drawerPlayerId, activeTurn.drawerNickname, drawerPoints, 'drawer');

    const totalGuessers = this.getEligibleGuesserCount(room, activeTurn);

    appendRoomFeedRecord(match.feed, {
      id: this.ids.randomUUID(),
      type: 'correctGuess',
      guesserPlayerId: playerId,
      guesserNickname: nickname,
      createdAt: this.now(),
      turnNumber: activeTurn.turnNumber,
      guessPosition: activeTurn.correctGuessPlayerIds.size,
      totalGuessers,
      answer: activeTurn.prompt,
    });

    if (this.rules.scoring.endRoundWhenAllGuessersCorrect && this.haveAllEligibleGuessersGuessed(room, activeTurn)) {
      appendRoomFeedRecord(match.feed, this.createSystemFeedItem({ type: 'allGuessersCorrect' }, activeTurn.turnNumber, this.now()));
      if (room.status === 'paused') {
        this.transitionPausedTurnToReveal(room);
        return;
      }

      this.transitionToReveal(room, false);
      return;
    }

    if (this.rules.scoring.capRoundAfterFirstCorrectGuess && activeTurn.correctGuessPlayerIds.size === 1) {
      this.capRoundAfterFirstCorrectGuess(room);
    }
  }

  public scheduleRoomPhaseTimer(room: RoomRecord, delayMs: number): void {
    const match = room.match;
    if (!match) {
      return;
    }

    const safeDelayMs = Math.max(0, delayMs);

    if (room.status === 'countdown') {
      this.scheduleRoomPhaseKindTimer(room, safeDelayMs, 'countdownEnded');
      return;
    }

    if (room.status === 'round') {
      this.scheduleRoomPhaseKindTimer(room, safeDelayMs, 'roundEnded');
      return;
    }

    if (room.status === 'reveal') {
      this.scheduleRoomPhaseKindTimer(room, safeDelayMs, 'revealEnded');
    }
  }

  private capRoundAfterFirstCorrectGuess(room: RoomRecord): void {
    const match = room.match;

    if (!match || room.status !== 'round' || !match.activeTurn || match.phaseEndsAt === null) {
      return;
    }

    const remainingMs = match.phaseEndsAt - this.now();
    const cappedRemainingMs = room.settings.firstCorrectGuessTimeCapSeconds * 1000;

    if (remainingMs <= cappedRemainingMs) {
      return;
    }

    match.phaseEndsAt = this.now() + cappedRemainingMs;
    this.scheduleRoomPhaseKindTimer(room, cappedRemainingMs, 'roundEnded');
  }

  private scheduleRoomPhaseKindTimer(room: RoomRecord, delayMs: number, kind: RoomPhaseTimerKind): void {
    this.scheduleRoomTimer(room, Math.max(0, delayMs), kind);
  }

  public handleRoomPhaseTimer(roomCode: string, kind: RoomPhaseTimerKind): void {
    const room = this.rooms.get(roomCode);
    if (!room) {
      return;
    }

    switch (kind) {
      case 'countdownEnded':
        this.transitionToRound(room, true);
        return;
      case 'roundEnded':
        this.transitionToReveal(room, true);
        return;
      case 'revealEnded':
        this.advanceAfterRevealTimer(room);
        return;
      case 'pauseExpired':
        this.beginResumeCountdown(room, true);
        return;
      case 'resumeCountdownEnded':
        this.finishResumeCountdown(room, true);
        return;
    }
  }

  private advanceAfterRevealTimer(room: RoomRecord): void {
    if (!room.match) {
      return;
    }

    room.match.currentTurnIndex += 1;
    room.match.activeTurn = null;

    if (room.match.currentTurnIndex >= room.match.turnPlan.length) {
      this.transitionToPostgame(room, true);
      return;
    }

    this.transitionToCountdown(room, true);
  }

  private getEligibleGuesserCount(room: RoomRecord, activeTurn: ActiveTurnRecord): number {
    return Array.from(room.players.values()).filter(
      (player) => player.connected && player.id !== activeTurn.drawerPlayerId && this.canPlayerGuessOnTurn(player, activeTurn.turnNumber),
    ).length;
  }

  private haveAllEligibleGuessersGuessed(room: RoomRecord, activeTurn: ActiveTurnRecord): boolean {
    return Array.from(room.players.values())
      .filter(
        (player) =>
          player.connected &&
          player.id !== activeTurn.drawerPlayerId &&
          this.canPlayerGuessOnTurn(player, activeTurn.turnNumber),
      )
      .every((player) => activeTurn.correctGuessPlayerIds.has(player.id));
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

  private resolveFirstLateJoinDrawRound(room: RoomRecord): number | null {
    const match = room.match;
    const activeTurn = match?.activeTurn;
    const effectivePhase = this.getEffectiveMatchPhase(room);

    if (!match || !activeTurn || !effectivePhase || match.turnPlan.length >= this.rules.limits.maxTotalTurns) {
      return null;
    }

    if (activeTurn.roundNumber > room.settings.turnsPerPlayer) {
      return null;
    }

    if (effectivePhase === 'reveal') {
      const nextPlannedTurn = match.turnPlan[match.currentTurnIndex + 1];
      if (!nextPlannedTurn) {
        return null;
      }

      return nextPlannedTurn.roundNumber;
    }

    return activeTurn.roundNumber;
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

  private canPlayerGuessOnTurn(player: RoomPlayerRecord, turnNumber: number): boolean {
    return player.canGuessFromTurnNumber === null || turnNumber >= player.canGuessFromTurnNumber;
  }

  private incrementScore(match: MatchRecord, playerId: string, nickname: string, points: number): void {
    const existingScore = match.scoreboard.get(playerId);

    if (existingScore) {
      existingScore.score += points;
      return;
    }

    match.scoreboard.set(playerId, {
      playerId,
      nickname,
      score: points,
    });
  }

  private recordRoundScoreChange(
    activeTurn: ActiveTurnRecord,
    playerId: string,
    nickname: string,
    points: number,
    reason: RoundScoreChange['reason'],
  ): void {
    const existingScoreChange = activeTurn.scoreChanges.get(playerId);

    if (existingScoreChange) {
      existingScoreChange.points += points;
      return;
    }

    activeTurn.scoreChanges.set(playerId, {
      playerId,
      nickname,
      points,
      reason,
    });
  }

  private createSystemFeedItem(
    event: Extract<RoomFeedRecord, { type: 'system' }>['event'],
    turnNumber: number | null,
    createdAt: number,
    audience?: RoomFeedRecord['audience'],
  ): Extract<RoomFeedRecord, { type: 'system' }> {
    return {
      id: this.ids.randomUUID(),
      type: 'system',
      event,
      createdAt,
      turnNumber,
      audience,
    };
  }

  private renderRevealSnapshotAsync(roomCode: string, turnNumber: number, drawing: DrawingState): void {
    void this.asyncSnapshotRenderer.render(drawing).then((snapshotDataUrl) => {
      if (!snapshotDataUrl) {
        return;
      }

      const room = this.rooms.get(roomCode);
      const match = room?.match;
      const activeTurn = match?.activeTurn;
      if (!room || !match || !activeTurn || activeTurn.turnNumber !== turnNumber) {
        return;
      }

      activeTurn.drawing.snapshotDataUrl = snapshotDataUrl;
      const completedTurn = match.completedTurns.find((turn) => turn.turnNumber === turnNumber);
      if (completedTurn) {
        completedTurn.finalImageDataUrl = snapshotDataUrl;
        capCompletedTurnImageRetention(match.completedTurns);
      }
      this.notifyRoomChanged(roomCode);
    });
  }

  private createRoundHeaderFeedItem(
    roundNumber: number,
    turnNumber: number | null,
    createdAt: number,
  ): Extract<RoomFeedRecord, { type: 'roundHeader' }> {
    return {
      id: this.ids.randomUUID(),
      type: 'roundHeader',
      roundNumber,
      createdAt,
      turnNumber,
    };
  }
}

function buildCompletedTurn(activeTurn: ActiveTurnRecord) {
  return {
    turnNumber: activeTurn.turnNumber,
    roundNumber: activeTurn.roundNumber,
    drawerPlayerId: activeTurn.drawerPlayerId,
    drawerNickname: activeTurn.drawerNickname,
    answer: activeTurn.prompt,
    rerolledFrom: activeTurn.rerolledFrom,
    finalImageDataUrl: activeTurn.drawing.snapshotDataUrl,
    scoreChanges: Array.from(activeTurn.scoreChanges.values()).sort((left, right) => right.points - left.points),
  };
}
