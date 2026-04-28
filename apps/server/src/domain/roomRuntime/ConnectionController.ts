import { normalizeRoomCode, type ApiError } from '@sketcherson/common/room';
import type { MatchRecord, RoomPlayerRecord, RoomRecord } from './model';
import type { RateLimiter } from './RateLimiter';
import type { RoomScheduler } from './RoomScheduler';
import type { RoomStore } from './RoomStore';

interface ConnectionControllerOptions {
  store: RoomStore;
  scheduler: RoomScheduler;
  rateLimiter: RateLimiter;
  reconnectGraceMs: number;
  now: () => number;
  clearRoomTimer: (room: RoomRecord) => void;
  transitionToReveal: (room: RoomRecord, notify: boolean) => void;
  transitionPausedTurnToReveal: (room: RoomRecord) => void;
  transitionToPostgame: (room: RoomRecord, notify: boolean) => void;
  notifyRoomChanged: (roomCode: string) => void;
  scheduleReconnectTimer: (roomCode: string, player: RoomPlayerRecord, delayMs: number) => void;
  touchRoom: (room: RoomRecord) => void;
}

export type ReclaimConnectionResult =
  | { ok: true; room: RoomRecord; player: RoomPlayerRecord }
  | { ok: false; error: ApiError };

export interface RemovedPlayerResult {
  removed: boolean;
  connectionId: string | null;
}

export class ConnectionController {
  private readonly store: RoomStore;
  private readonly scheduler: RoomScheduler;
  private readonly rateLimiter: RateLimiter;
  private readonly reconnectGraceMs: number;
  private readonly now: () => number;
  private readonly clearRoomTimer: (room: RoomRecord) => void;
  private readonly transitionToReveal: (room: RoomRecord, notify: boolean) => void;
  private readonly transitionPausedTurnToReveal: (room: RoomRecord) => void;
  private readonly transitionToPostgame: (room: RoomRecord, notify: boolean) => void;
  private readonly notifyRoomChanged: (roomCode: string) => void;
  private readonly scheduleReconnectTimerCallback: (roomCode: string, player: RoomPlayerRecord, delayMs: number) => void;
  private readonly touchRoom: (room: RoomRecord) => void;

  public constructor(options: ConnectionControllerOptions) {
    this.store = options.store;
    this.scheduler = options.scheduler;
    this.rateLimiter = options.rateLimiter;
    this.reconnectGraceMs = options.reconnectGraceMs;
    this.now = options.now;
    this.clearRoomTimer = options.clearRoomTimer;
    this.transitionToReveal = options.transitionToReveal;
    this.transitionPausedTurnToReveal = options.transitionPausedTurnToReveal;
    this.transitionToPostgame = options.transitionToPostgame;
    this.notifyRoomChanged = options.notifyRoomChanged;
    this.scheduleReconnectTimerCallback = options.scheduleReconnectTimer;
    this.touchRoom = options.touchRoom;
  }

  public reclaimRoom(input: { code: string; sessionToken: string; connectionId: string }): ReclaimConnectionResult {
    const normalizedCode = normalizeRoomCode(input.code);
    const room = this.store.getRoom(normalizedCode);

    if (!room) {
      return this.roomNotFound();
    }

    const membership = this.store.getSession(input.sessionToken);
    if (!membership || membership.roomCode !== normalizedCode) {
      return this.sessionExpired();
    }

    const player = room.players.get(membership.playerId);
    if (!player) {
      this.store.deleteSession(input.sessionToken);
      return this.sessionExpired();
    }

    if (player.reconnectBy !== null && player.reconnectBy <= this.now()) {
      this.expirePlayerReservation(room.code, player.id);
      return this.sessionExpired();
    }

    const replacedConnectionId = this.store.bindPlayerConnection(room, player, input.connectionId);

    if (replacedConnectionId) {
      this.rateLimiter.clearActor(replacedConnectionId);
    }

    this.clearReconnectTimer(player);
    player.connected = true;
    player.reconnectBy = null;
    player.reconnectRemainingMs = null;

    this.touchRoom(room);

    return {
      ok: true,
      room,
      player,
    };
  }

  public disconnect(connectionId: string): string | null {
    this.rateLimiter.clearActor(connectionId);

    const membership = this.store.getConnection(connectionId);

    if (!membership) {
      return null;
    }

    this.store.deleteConnection(connectionId);

    const room = this.store.getRoom(membership.roomCode);
    if (!room) {
      return null;
    }

    const player = room.players.get(membership.playerId);
    if (!player) {
      return null;
    }

    if (player.socketId !== connectionId) {
      return null;
    }

    player.socketId = null;
    player.connected = false;
    if (room.status === 'paused') {
      player.reconnectBy = null;
      player.reconnectRemainingMs = this.reconnectGraceMs;
      this.clearReconnectTimer(player);
    } else {
      player.reconnectBy = this.now() + this.reconnectGraceMs;
      player.reconnectRemainingMs = null;
      this.scheduleReconnectTimer(room.code, player);
    }

    if (room.hostPlayerId === player.id && room.status !== 'paused') {
      this.migrateHost(room, player.id);
    }

    this.touchRoom(room);

    return room.code;
  }

  public removePlayerFromRoom(room: RoomRecord, playerId: string): RemovedPlayerResult {
    const player = room.players.get(playerId);
    if (!player) {
      return { removed: false, connectionId: null };
    }

    this.clearReconnectTimer(player);

    const wasHost = room.hostPlayerId === player.id;
    const wasActiveDrawer = room.match?.activeTurn?.drawerPlayerId === player.id;
    const connectionId = this.store.removePlayer(room, player);

    if (connectionId) {
      this.rateLimiter.clearActor(connectionId);
    }

    if (room.match) {
      room.match.scoreboard.delete(player.id);
      this.removeDisconnectedPlayerTurns(room, player.id);
    }

    if (room.players.size === 0) {
      this.clearRoomTimer(room);
      this.store.deleteRoom(room.code);
      return { removed: true, connectionId };
    }

    if (wasHost) {
      this.migrateHost(room, player.id, true);
    }

    if (room.match) {
      if (wasActiveDrawer && ['countdown', 'round'].includes(room.status)) {
        this.transitionToReveal(room, true);
        return { removed: true, connectionId };
      }

      if (wasActiveDrawer && room.status === 'paused' && ['countdown', 'round'].includes(room.match.pause?.pausedPhase ?? '')) {
        this.transitionPausedTurnToReveal(room);
        return { removed: true, connectionId };
      }

      if (room.match.currentTurnIndex >= room.match.turnPlan.length) {
        this.transitionToPostgame(room, true);
        return { removed: true, connectionId };
      }
    }

    this.notifyRoomChanged(room.code);

    return { removed: true, connectionId };
  }

  public freezeReconnectTimers(room: RoomRecord): void {
    for (const player of room.players.values()) {
      if (player.connected || player.reconnectBy === null) {
        continue;
      }

      player.reconnectRemainingMs = Math.max(0, player.reconnectBy - this.now());
      player.reconnectBy = null;
      this.clearReconnectTimer(player);
    }
  }

  public resumeReconnectTimers(room: RoomRecord): void {
    for (const player of room.players.values()) {
      if (player.connected || player.reconnectRemainingMs === null) {
        continue;
      }

      player.reconnectBy = this.now() + player.reconnectRemainingMs;
      this.scheduleReconnectTimer(room.code, player, player.reconnectRemainingMs);
      player.reconnectRemainingMs = null;
    }
  }

  private scheduleReconnectTimer(roomCode: string, player: RoomPlayerRecord, delayMs = this.reconnectGraceMs): void {
    this.scheduleReconnectTimerCallback(roomCode, player, delayMs);
  }

  private clearReconnectTimer(player: RoomPlayerRecord): void {
    this.scheduler.clearReconnectTimer(player);
  }

  public handleReconnectTimer(roomCode: string, playerId: string): void {
    const room = this.store.getRoom(roomCode);
    if (!room) {
      return;
    }

    const player = room.players.get(playerId);
    if (!player || player.connected) {
      return;
    }

    this.removePlayerFromRoom(room, playerId);
  }

  private removeDisconnectedPlayerTurns(room: RoomRecord, playerId: string): void {
    const match = room.match;
    if (!match) {
      return;
    }

    match.turnPlan = match.turnPlan.filter((turn, index) => {
      if (index <= match.currentTurnIndex) {
        return true;
      }

      return turn.drawerPlayerId !== playerId;
    });

    this.reindexTurnNumbers(match);
  }

  private reindexTurnNumbers(match: MatchRecord): void {
    match.turnPlan = match.turnPlan.map((turn, index) => ({
      ...turn,
      turnNumber: index + 1,
    }));

    match.completedTurns = match.completedTurns.map((turn, index) => ({
      ...turn,
      turnNumber: index + 1,
    }));

    if (match.activeTurn) {
      match.activeTurn.turnNumber = match.currentTurnIndex + 1;
    }
  }

  private migrateHost(room: RoomRecord, previousHostPlayerId: string, preferAnyRemainingPlayer = false): void {
    const connectedReplacement = Array.from(room.players.values()).find(
      (player) => player.id !== previousHostPlayerId && player.connected,
    );

    if (connectedReplacement) {
      room.hostPlayerId = connectedReplacement.id;
      return;
    }

    if (!preferAnyRemainingPlayer) {
      return;
    }

    const fallbackReplacement = Array.from(room.players.values()).find((player) => player.id !== previousHostPlayerId);
    if (fallbackReplacement) {
      room.hostPlayerId = fallbackReplacement.id;
    }
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
