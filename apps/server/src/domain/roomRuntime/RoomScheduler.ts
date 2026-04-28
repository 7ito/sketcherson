import type { RoomPlayerRecord, RoomRecord } from './model';

export interface RoomSchedulerAdapter {
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clearTimeout(timer: ReturnType<typeof setTimeout>): void;
}

const defaultSchedulerAdapter: RoomSchedulerAdapter = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (timer) => clearTimeout(timer),
};

export class RoomScheduler {
  private readonly adapter: RoomSchedulerAdapter;

  public constructor(options?: { adapter?: RoomSchedulerAdapter }) {
    this.adapter = options?.adapter ?? defaultSchedulerAdapter;
  }

  public scheduleRoomTimer(room: RoomRecord, delayMs: number, callback: () => void): void {
    this.clearRoomTimer(room);
    room.timer = this.adapter.setTimeout(callback, delayMs);
  }

  public clearRoomTimer(room: RoomRecord): void {
    if (!room.timer) {
      return;
    }

    this.adapter.clearTimeout(room.timer);
    room.timer = null;
  }

  public scheduleReconnectTimer(player: RoomPlayerRecord, delayMs: number, callback: () => void): void {
    this.clearReconnectTimer(player);
    player.reconnectTimer = this.adapter.setTimeout(callback, delayMs);
  }

  public clearReconnectTimer(player: RoomPlayerRecord): void {
    if (!player.reconnectTimer) {
      return;
    }

    this.adapter.clearTimeout(player.reconnectTimer);
    player.reconnectTimer = null;
  }

  public clearPlayerTimers(player: RoomPlayerRecord): void {
    this.clearReconnectTimer(player);
  }

  public clearRoomTimers(room: RoomRecord): void {
    this.clearRoomTimer(room);

    for (const player of room.players.values()) {
      this.clearPlayerTimers(player);
    }
  }
}
