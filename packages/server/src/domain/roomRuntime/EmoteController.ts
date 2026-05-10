import type { ResolvedEmoteConfig } from '@7ito/sketcherson-common/emotes';
import { normalizeRoomCode, type ApiResult, type SendEmoteSuccess } from '@7ito/sketcherson-common/room';
import type { RoomRecord } from './model';
import type { RoomIdGenerator } from './InMemoryRoomLifecycleMachine';

export interface EmoteControllerOptions {
  getEmoteConfig: () => ResolvedEmoteConfig;
  consumeEmoteRateLimit: (connectionId: string) => ApiResult<never> | null;
  ids: RoomIdGenerator;
  now: () => number;
  random: () => number;
}

export interface SendEmoteInput {
  room: RoomRecord;
  playerId: string;
  connectionId: string;
  code?: string;
  emoteId: string;
}

const EMOTE_ALLOWED_ROOM_STATUSES = ['lobby', 'countdown', 'round', 'reveal', 'paused'] as const;

export class EmoteController {
  private readonly getEmoteConfig: () => ResolvedEmoteConfig;
  private readonly consumeEmoteRateLimit: (connectionId: string) => ApiResult<never> | null;
  private readonly ids: RoomIdGenerator;
  private readonly now: () => number;
  private readonly random: () => number;

  public constructor(options: EmoteControllerOptions) {
    this.getEmoteConfig = options.getEmoteConfig;
    this.consumeEmoteRateLimit = options.consumeEmoteRateLimit;
    this.ids = options.ids;
    this.now = options.now;
    this.random = options.random;
  }

  public sendEmote(input: SendEmoteInput): ApiResult<SendEmoteSuccess> {
    const { room, playerId, connectionId, code, emoteId } = input;

    if (code && normalizeRoomCode(code) !== room.code) {
      return { ok: false, error: { code: 'ROOM_NOT_FOUND', message: 'Room not found or expired.' } };
    }

    if (!this.isEmoteStatus(room.status)) {
      return { ok: false, error: { code: 'FORBIDDEN', message: 'Emotes are only available in the lobby and during matches.' } };
    }

    const emotes = this.getEmoteConfig();

    if (!emotes.enabled) {
      return { ok: false, error: { code: 'FORBIDDEN', message: 'Emotes are not enabled for this game.' } };
    }

    if (!room.settings.emotesEnabled) {
      return { ok: false, error: { code: 'FORBIDDEN', message: 'Emotes are disabled for this room.' } };
    }

    if (!emotes.items.some((item) => item.id === emoteId)) {
      return { ok: false, error: { code: 'INVALID_EMOTE', message: 'That emote is not available.' } };
    }

    const activeDrawerPlayerId = room.match?.activeTurn?.drawerPlayerId ?? null;
    if (room.status !== 'lobby' && activeDrawerPlayerId === playerId) {
      return { ok: false, error: { code: 'FORBIDDEN', message: 'Active drawers cannot send emotes during a match.' } };
    }

    const rateLimitError = this.consumeEmoteRateLimit(connectionId);
    if (rateLimitError) {
      return rateLimitError;
    }

    return {
      ok: true,
      data: {
        event: {
          roomCode: room.code,
          target: room.status === 'lobby' ? 'lobby' : 'match',
          eventId: this.ids.randomUUID(),
          emoteId,
          createdAt: this.now(),
          x: 0.08 + this.random() * 0.84,
          y: 0.97 + this.random() * 0.03,
        },
      },
    };
  }

  private isEmoteStatus(status: RoomRecord['status']): boolean {
    return (EMOTE_ALLOWED_ROOM_STATUSES as readonly string[]).includes(status);
  }
}
