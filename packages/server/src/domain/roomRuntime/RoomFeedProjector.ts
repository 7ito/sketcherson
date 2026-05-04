import type { RoomFeedItem } from '@7ito/sketcherson-common/room';
import type { RoomFeedRecord } from './model';

export interface RoomFeedProjector {
  projectLobbyFeed(input: {
    records: readonly RoomFeedRecord[];
    viewerPlayerId?: string;
  }): RoomFeedItem[];

  projectMatchFeed(input: {
    records: readonly RoomFeedRecord[];
    viewerPlayerId?: string;
  }): RoomFeedItem[];
}

export function createRoomFeedProjector(): RoomFeedProjector {
  return new SemanticRoomFeedProjector();
}

class SemanticRoomFeedProjector implements RoomFeedProjector {
  public projectLobbyFeed(input: { records: readonly RoomFeedRecord[]; viewerPlayerId?: string }): RoomFeedItem[] {
    return input.records
      .filter((item) => this.isVisibleToViewer(item, input.viewerPlayerId))
      .map((item) => this.projectFeedItemForViewer(item, input.viewerPlayerId));
  }

  public projectMatchFeed(input: { records: readonly RoomFeedRecord[]; viewerPlayerId?: string }): RoomFeedItem[] {
    return input.records
      .filter((item) => this.isVisibleToViewer(item, input.viewerPlayerId))
      .map((item) => this.projectFeedItemForViewer(item, input.viewerPlayerId));
  }

  private isVisibleToViewer(item: RoomFeedRecord, viewerPlayerId: string | undefined): boolean {
    const audience = item.audience ?? (item.audiencePlayerIds ? { type: 'players' as const, playerIds: item.audiencePlayerIds } : { type: 'room' as const });

    if (audience.type === 'room') {
      return true;
    }

    if (audience.type === 'player') {
      return viewerPlayerId === audience.playerId;
    }

    return viewerPlayerId !== undefined && audience.playerIds.includes(viewerPlayerId);
  }

  private projectFeedItemForViewer(item: RoomFeedRecord, viewerPlayerId: string | undefined): RoomFeedItem {
    const base = {
      id: item.id,
      createdAt: item.createdAt,
      turnNumber: item.turnNumber,
    };

    if (item.type === 'playerChat') {
      return {
        ...base,
        type: 'playerChat',
        senderPlayerId: item.senderPlayerId,
        senderNickname: item.senderNickname,
        text: item.text,
      };
    }

    if (item.type === 'roundHeader') {
      return {
        ...base,
        type: 'roundHeader',
        roundNumber: item.roundNumber,
      };
    }

    if (item.type === 'system') {
      return {
        ...base,
        type: 'system',
        event: item.event,
      };
    }

    const isSelf = viewerPlayerId === item.guesserPlayerId;

    return {
      ...base,
      type: 'correctGuess',
      visibility: isSelf ? 'self' : 'others',
      guesserPlayerId: isSelf ? null : item.guesserPlayerId,
      guesserNickname: isSelf ? null : item.guesserNickname,
      ...(isSelf
        ? {
            answer: item.answer,
            guessPosition: item.guessPosition,
            totalGuessers: item.totalGuessers,
          }
        : {}),
    };
  }
}
