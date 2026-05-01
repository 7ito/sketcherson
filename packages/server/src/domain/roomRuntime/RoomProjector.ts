import type { PromptDisplayMetadata, PromptEngine } from '@sketcherson/common/prompts';
import { buildShareUrl, type LiveRoomStatus, type RoomPlayer, type RoomState, type ScoreboardEntry } from '@sketcherson/common/room';
import type { DrawingState } from '@sketcherson/common/drawing';
import type { ResolvedDrawingGameRules } from '@sketcherson/common/game';
import type { ActiveTurnRecord, MatchRecord, RoomPlayerRecord, RoomRecord } from './model';
import { createRoomFeedProjector, type RoomFeedProjector } from './RoomFeedProjector';

export interface RoomProjectorOptions {
  referenceArtEnabled: boolean;
  rules: ResolvedDrawingGameRules;
  promptEngine: PromptEngine;
  now: () => number;
  getEffectiveMatchPhase: (room: RoomRecord) => LiveRoomStatus | null;
  getGuessingDelayRemainingMs: (room: RoomRecord, activeTurn: ActiveTurnRecord) => number;
}

export interface ProjectRoomInput {
  room: RoomRecord;
  origin: string;
  viewerPlayerId?: string;
}

export interface ProjectedBroadcastTarget {
  socketId: string;
  room: RoomState;
}

export class RoomProjector {
  private readonly referenceArtEnabled: boolean;
  private readonly rules: ResolvedDrawingGameRules;
  private readonly promptEngine: PromptEngine;
  private readonly now: () => number;
  private readonly getEffectiveMatchPhase: (room: RoomRecord) => LiveRoomStatus | null;
  private readonly getGuessingDelayRemainingMs: (room: RoomRecord, activeTurn: ActiveTurnRecord) => number;
  private readonly feedProjector: RoomFeedProjector;

  public constructor(options: RoomProjectorOptions) {
    this.referenceArtEnabled = options.referenceArtEnabled;
    this.rules = options.rules;
    this.promptEngine = options.promptEngine;
    this.now = options.now;
    this.getEffectiveMatchPhase = options.getEffectiveMatchPhase;
    this.getGuessingDelayRemainingMs = options.getGuessingDelayRemainingMs;
    this.feedProjector = createRoomFeedProjector();
  }

  public project(input: ProjectRoomInput): RoomState {
    const { room, origin, viewerPlayerId } = input;

    return {
      code: room.code,
      shareUrl: buildShareUrl(origin || '', room.code),
      stateRevision: room.stateRevision,
      status: room.status,
      serverReferenceArtEnabled: this.referenceArtEnabled,
      players: Array.from(room.players.values()).map((player) => this.toRoomPlayerState(room, player)),
      settings: room.settings,
      lobbyDrawing: room.status === 'lobby' && this.rules.features.lobbyDrawing ? cloneDrawingState(room.lobbyDrawing) : null,
      lobbyFeed: this.feedProjector.projectLobbyFeed({ records: room.lobbyFeed, viewerPlayerId }),
      match: room.match
        ? {
            phaseEndsAt: room.status === 'paused' ? null : room.match.phaseEndsAt,
            currentTurn: room.match.activeTurn
              ? this.toCurrentTurnState(room, room.match.activeTurn, viewerPlayerId)
              : null,
            completedTurns: room.match.completedTurns.map((turn) => ({
              turnNumber: turn.turnNumber,
              roundNumber: turn.roundNumber,
              drawerPlayerId: turn.drawerPlayerId,
              drawerNickname: turn.drawerNickname,
              answer: turn.answer,
              rerolledFrom: turn.rerolledFrom,
              finalImageDataUrl: turn.finalImageDataUrl,
              scoreChanges: turn.scoreChanges.map((change) => ({ ...change })),
            })),
            feed: this.feedProjector.projectMatchFeed({ records: room.match.feed, viewerPlayerId }),
            scoreboard: buildScoreboardEntries(room.match),
            pause: room.match.pause
              ? {
                  mode: room.match.pause.mode,
                  pausedPhase: room.match.pause.pausedPhase,
                  phaseRemainingMs: room.match.pause.phaseRemainingMs,
                  pauseEndsAt: room.match.pause.pauseEndsAt,
                  resumeEndsAt: room.match.pause.resumeEndsAt,
                }
              : null,
            pauseCooldownEndsAt:
              room.match.pauseCooldownEndsAt !== null && room.match.pauseCooldownEndsAt > this.now()
                ? room.match.pauseCooldownEndsAt
                : null,
          }
        : null,
    };
  }

  public projectBroadcastTargets(input: { room: RoomRecord; origin: string }): ProjectedBroadcastTarget[] {
    return Array.from(input.room.players.values())
      .filter((player) => player.connected && player.socketId)
      .map((player) => ({
        socketId: player.socketId as string,
        room: this.project({ room: input.room, origin: input.origin, viewerPlayerId: player.id }),
      }));
  }

  private toCurrentTurnState(room: RoomRecord, activeTurn: ActiveTurnRecord, viewerPlayerId: string | undefined): NonNullable<NonNullable<RoomState['match']>['currentTurn']> {
    const referenceArtUrl = this.resolveReferenceArtForViewer(room, activeTurn, viewerPlayerId);

    return {
      turnNumber: activeTurn.turnNumber,
      totalTurns: room.match?.turnPlan.length ?? 0,
      drawerPlayerId: activeTurn.drawerPlayerId,
      drawerNickname: activeTurn.drawerNickname,
      prompt: this.resolvePromptForViewer(room, activeTurn, viewerPlayerId),
      promptVisibility: this.getPromptVisibility(room, activeTurn, viewerPlayerId),
      promptDisplayMetadata: this.resolvePromptDisplayMetadataForViewer(room, activeTurn, viewerPlayerId),
      referenceArtUrl,
      rerollsRemaining: activeTurn.rerollsRemaining,
      rerolledFrom: this.resolveRerolledFromForViewer(room, activeTurn, viewerPlayerId),
      correctGuessPlayerIds: Array.from(activeTurn.correctGuessPlayerIds),
      guessingDelayRemainingMs:
        this.getEffectiveMatchPhase(room) === 'round'
          ? this.getGuessingDelayRemainingMs(room, activeTurn)
          : 0,
      drawing: cloneDrawingState(activeTurn.drawing),
    };
  }

  private toRoomPlayerState(room: RoomRecord, player: RoomPlayerRecord): RoomPlayer {
    return {
      id: player.id,
      nickname: player.nickname,
      connected: player.connected,
      reconnectBy: player.reconnectBy,
      reconnectRemainingMs: player.reconnectRemainingMs,
      isHost: player.id === room.hostPlayerId,
      canGuessFromTurnNumber: player.canGuessFromTurnNumber,
    };
  }

  private resolvePromptForViewer(
    room: RoomRecord,
    activeTurn: ActiveTurnRecord,
    viewerPlayerId: string | undefined,
  ): string | null {
    if (this.getEffectiveMatchPhase(room) === 'reveal') {
      return activeTurn.prompt;
    }

    if (viewerPlayerId && viewerPlayerId === activeTurn.drawerPlayerId) {
      return activeTurn.prompt;
    }

    return null;
  }

  private resolvePromptDisplayMetadataForViewer(
    room: RoomRecord,
    activeTurn: ActiveTurnRecord,
    viewerPlayerId: string | undefined,
  ): PromptDisplayMetadata | null {
    if (this.getEffectiveMatchPhase(room) === 'reveal') {
      return this.promptEngine.getDisplayMetadata(activeTurn.promptId);
    }

    if (viewerPlayerId && viewerPlayerId === activeTurn.drawerPlayerId) {
      return this.promptEngine.getDisplayMetadata(activeTurn.promptId);
    }

    return null;
  }

  private resolveRerolledFromForViewer(
    room: RoomRecord,
    activeTurn: ActiveTurnRecord,
    viewerPlayerId: string | undefined,
  ): string | null {
    if (!activeTurn.rerolledFrom) {
      return null;
    }

    if (this.getEffectiveMatchPhase(room) === 'reveal') {
      return activeTurn.rerolledFrom;
    }

    if (viewerPlayerId && viewerPlayerId === activeTurn.drawerPlayerId) {
      return activeTurn.rerolledFrom;
    }

    return null;
  }

  private resolveReferenceArtForViewer(
    room: RoomRecord,
    activeTurn: ActiveTurnRecord,
    viewerPlayerId: string | undefined,
  ): string | null {
    if (!this.referenceArtEnabled || !room.settings.artEnabled || this.rules.features.referenceArt === 'disabled') {
      return null;
    }

    if (this.getEffectiveMatchPhase(room) === 'reveal') {
      return this.rules.features.referenceArt === 'drawer-and-reveal'
        ? this.promptEngine.getReferenceArtUrl(activeTurn.promptId)
        : null;
    }

    if (viewerPlayerId && viewerPlayerId === activeTurn.drawerPlayerId) {
      return this.promptEngine.getReferenceArtUrl(activeTurn.promptId);
    }

    return null;
  }

  private getPromptVisibility(
    room: RoomRecord,
    activeTurn: ActiveTurnRecord,
    viewerPlayerId: string | undefined,
  ): 'hidden' | 'assigned' | 'revealed' {
    if (this.getEffectiveMatchPhase(room) === 'reveal') {
      return 'revealed';
    }

    if (viewerPlayerId && viewerPlayerId === activeTurn.drawerPlayerId) {
      return 'assigned';
    }

    return 'hidden';
  }

}

function buildScoreboardEntries(match: MatchRecord): ScoreboardEntry[] {
  return Array.from(match.scoreboard.values()).sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return left.nickname.localeCompare(right.nickname);
  });
}

function cloneDrawingState(drawing: DrawingState): DrawingState {
  return {
    width: drawing.width,
    height: drawing.height,
    revision: drawing.revision,
    snapshotDataUrl: drawing.snapshotDataUrl,
    operations: drawing.operations.map((operation) =>
      operation.kind === 'stroke'
        ? {
            ...operation,
            points: operation.points.map((point) => ({ ...point })),
          }
        : operation.kind === 'fill'
          ? {
              ...operation,
              point: { ...operation.point },
            }
        : { ...operation },
    ),
    undoneOperations: drawing.undoneOperations.map((operation) =>
      operation.kind === 'stroke'
        ? {
            ...operation,
            points: operation.points.map((point) => ({ ...point })),
          }
        : operation.kind === 'fill'
          ? {
              ...operation,
              point: { ...operation.point },
            }
          : { ...operation },
    ),
    activeStrokes: drawing.activeStrokes.map((stroke) => ({
      ...stroke,
      points: stroke.points.map((point) => ({ ...point })),
    })),
  };
}
