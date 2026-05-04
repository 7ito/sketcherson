import { ROOM_CODE_LENGTH, normalizeRoomCode } from '@7ito/sketcherson-common/room';
import type { RoomPlayerRecord, RoomRecord } from './model';

export interface RoomMembership {
  roomCode: string;
  playerId: string;
}

export interface RoomActorLookup {
  room: RoomRecord;
  playerId: string;
  hostPlayerId: string;
}

export class RoomStore {
  private readonly rooms = new Map<string, RoomRecord>();
  private readonly socketToPlayer = new Map<string, RoomMembership>();
  private readonly sessionToPlayer = new Map<string, RoomMembership>();
  private readonly random: () => number;

  public constructor(options: { random: () => number }) {
    this.random = options.random;
  }

  public get roomRecords(): Map<string, RoomRecord> {
    return this.rooms;
  }

  public listRooms(): IterableIterator<RoomRecord> {
    return this.rooms.values();
  }

  public addRoom(room: RoomRecord): void {
    this.rooms.set(room.code, room);
  }

  public addRoomWithPlayer(room: RoomRecord, player: RoomPlayerRecord): void {
    this.addPlayer(room, player);
    this.addRoom(room);
  }

  public addPlayer(room: RoomRecord, player: RoomPlayerRecord): void {
    room.players.set(player.id, player);

    if (player.socketId) {
      this.setConnection(player.socketId, { roomCode: room.code, playerId: player.id });
    }

    this.setSession(player.sessionToken, { roomCode: room.code, playerId: player.id });
  }

  public removePlayer(room: RoomRecord, player: RoomPlayerRecord): string | null {
    const connectionId = player.socketId;

    if (connectionId) {
      this.deleteConnection(connectionId);
    }

    room.players.delete(player.id);
    this.deleteSession(player.sessionToken);

    return connectionId;
  }

  public bindPlayerConnection(room: RoomRecord, player: RoomPlayerRecord, connectionId: string): string | null {
    const replacedConnectionId = player.socketId && player.socketId !== connectionId ? player.socketId : null;

    if (replacedConnectionId) {
      this.deleteConnection(replacedConnectionId);
    }

    player.socketId = connectionId;
    this.setConnection(connectionId, { roomCode: room.code, playerId: player.id });

    return replacedConnectionId;
  }

  public getRoom(code: string): RoomRecord | undefined {
    return this.rooms.get(normalizeRoomCode(code));
  }

  public hasRoom(code: string): boolean {
    return this.rooms.has(normalizeRoomCode(code));
  }

  public deleteRoom(code: string): void {
    const normalizedCode = normalizeRoomCode(code);
    const room = this.rooms.get(normalizedCode);

    if (room) {
      for (const player of room.players.values()) {
        if (player.socketId) {
          this.deleteConnection(player.socketId);
        }
        this.deleteSession(player.sessionToken);
      }
    }

    this.rooms.delete(normalizedCode);
  }

  public createRoomCode(): string {
    let code = '';

    do {
      code = Array.from({ length: ROOM_CODE_LENGTH }, () => String.fromCharCode(65 + Math.floor(this.random() * 26))).join('');
    } while (this.hasRoom(code));

    return code;
  }

  public getConnection(socketId: string): RoomMembership | undefined {
    return this.socketToPlayer.get(socketId);
  }

  public getActorRoom(socketId: string): RoomActorLookup | null {
    const membership = this.getConnection(socketId);

    if (!membership) {
      return null;
    }

    const room = this.getRoom(membership.roomCode);

    if (!room) {
      return null;
    }

    return {
      room,
      playerId: membership.playerId,
      hostPlayerId: room.hostPlayerId,
    };
  }

  public setConnection(socketId: string, membership: RoomMembership): void {
    this.socketToPlayer.set(socketId, membership);
  }

  public deleteConnection(socketId: string): void {
    this.socketToPlayer.delete(socketId);
  }

  public getSession(sessionToken: string): RoomMembership | undefined {
    return this.sessionToPlayer.get(sessionToken);
  }

  public setSession(sessionToken: string, membership: RoomMembership): void {
    this.sessionToPlayer.set(sessionToken, membership);
  }

  public deleteSession(sessionToken: string): void {
    this.sessionToPlayer.delete(sessionToken);
  }
}
