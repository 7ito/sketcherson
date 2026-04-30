import type { LiveRoomStatus, LobbySettings, RoomState, RoundScoreChange, ScoreboardEntry, SystemFeedItem } from '@sketcherson/common/room';
import type { DrawingState } from '@sketcherson/common/drawing';
import type { PlannedTurn } from './turnPlan';

export interface RoomPlayerRecord {
  id: string;
  nickname: string;
  sessionToken: string;
  socketId: string | null;
  connected: boolean;
  reconnectBy: number | null;
  reconnectRemainingMs: number | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  canGuessFromTurnNumber: number | null;
}

export interface PauseRecord {
  mode: 'paused' | 'resuming';
  pausedPhase: LiveRoomStatus;
  phaseRemainingMs: number;
  pauseEndsAt: number | null;
  resumeEndsAt: number | null;
  roundElapsedMs: number | null;
}

export interface ActiveTurnRecord {
  turnNumber: number;
  drawerPlayerId: string;
  drawerNickname: string;
  promptId: string;
  prompt: string;
  rerollsRemaining: number;
  rerolledFrom: string | null;
  roundStartedAt: number | null;
  roundDurationMs: number;
  correctGuessPlayerIds: Set<string>;
  scoreChanges: Map<string, RoundScoreChange>;
  drawing: DrawingState;
}

export interface BaseRoomFeedRecord {
  id: string;
  createdAt: number;
  turnNumber: number | null;
}

export interface PlayerChatFeedRecord extends BaseRoomFeedRecord {
  type: 'playerChat';
  senderPlayerId: string;
  senderNickname: string;
  text: string;
}

export interface RoundHeaderFeedRecord extends BaseRoomFeedRecord {
  type: 'roundHeader';
  roundNumber: number;
}

export interface SystemFeedRecord extends BaseRoomFeedRecord {
  type: 'system';
  event: SystemFeedItem['event'];
}

export interface CorrectGuessFeedRecord extends BaseRoomFeedRecord {
  type: 'correctGuess';
  guesserPlayerId: string;
  guesserNickname: string;
  guessPosition?: number;
  totalGuessers?: number;
  answer: string;
}

export type RoomFeedRecord = PlayerChatFeedRecord | SystemFeedRecord | RoundHeaderFeedRecord | CorrectGuessFeedRecord;

export const ROOM_FEED_MAX_RECORDS = 200;

export function appendRoomFeedRecord(feed: RoomFeedRecord[], record: RoomFeedRecord): void {
  feed.push(record);

  if (feed.length > ROOM_FEED_MAX_RECORDS) {
    feed.splice(0, feed.length - ROOM_FEED_MAX_RECORDS);
  }
}

export interface ScoreRecord extends ScoreboardEntry {}

export interface CompletedTurnRecord {
  turnNumber: number;
  drawerPlayerId: string;
  drawerNickname: string;
  answer: string;
  rerolledFrom: string | null;
  finalImageDataUrl: string | null;
  scoreChanges: RoundScoreChange[];
}

export interface MatchRecord {
  turnPlan: PlannedTurn[];
  currentTurnIndex: number;
  activeTurn: ActiveTurnRecord | null;
  completedTurns: CompletedTurnRecord[];
  phaseEndsAt: number | null;
  feed: RoomFeedRecord[];
  scoreboard: Map<string, ScoreRecord>;
  pause: PauseRecord | null;
  pauseCooldownEndsAt: number | null;
  usedPromptIds: Set<string>;
  playersPerRound: number;
}

export interface RoomRecord {
  code: string;
  stateRevision: number;
  hostPlayerId: string;
  players: Map<string, RoomPlayerRecord>;
  status: RoomState['status'];
  settings: LobbySettings;
  match: MatchRecord | null;
  lobbyDrawing: DrawingState;
  lobbyFeed: RoomFeedRecord[];
  timer: ReturnType<typeof setTimeout> | null;
}
