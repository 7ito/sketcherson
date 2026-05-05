import type { DrawingAction, DrawingState } from './drawing';
import type { PromptDisplayMetadata } from './promptEngine';

export type { ApiError, ApiResult } from './apiResult';
export { buildShareUrl, normalizeRoomCode } from './roomRules';

export const ROOM_CODE_LENGTH = 6;
export const MAX_PLAYERS_PER_ROOM = 8;
export const MIN_PLAYERS_TO_START = 2;
export const MAX_TOTAL_TURNS = 100;
export const PRE_ROUND_COUNTDOWN_SECONDS = 3;
export const REVEAL_DURATION_SECONDS = 4;
export const RECONNECT_GRACE_PERIOD_SECONDS = 60;
export const PAUSE_MAX_DURATION_SECONDS = 30 * 60;
export const PAUSE_REPAUSE_COOLDOWN_SECONDS = 10;
export const MAX_CHAT_MESSAGE_LENGTH = 140;
export const ROUND_TIMER_PRESETS = [60, 75, 90, 105, 120] as const;
export const FIRST_CORRECT_GUESS_TIME_CAP_PRESETS = [15, 30, 45, 60, 75, 90, 105, 120] as const;
export const GUESSING_DELAY_PRESETS = [0, 5, 10, 15] as const;
export const TURNS_PER_PLAYER_PRESETS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export const REROLLS_PER_TURN_PRESETS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 'unlimited'] as const;

export type LiveRoomStatus = 'countdown' | 'round' | 'reveal';
export type RoomStatus = 'lobby' | LiveRoomStatus | 'paused' | 'postgame';
export type RoundTimerPreset = (typeof ROUND_TIMER_PRESETS)[number];
export type FirstCorrectGuessTimeCapPreset = (typeof FIRST_CORRECT_GUESS_TIME_CAP_PRESETS)[number];
export type GuessingDelayPreset = (typeof GUESSING_DELAY_PRESETS)[number];
export type TurnsPerPlayerPreset = (typeof TURNS_PER_PLAYER_PRESETS)[number];
export type RerollsPerTurnPreset = (typeof REROLLS_PER_TURN_PRESETS)[number];
export type RerollsRemaining = number | 'unlimited';
export type PromptVisibility = 'hidden' | 'assigned' | 'revealed';

export interface LobbySettings {
  roundTimerSeconds: RoundTimerPreset;
  firstCorrectGuessTimeCapSeconds: FirstCorrectGuessTimeCapPreset;
  guessingDelaySeconds?: GuessingDelayPreset;
  hideCloseGuesses?: boolean;
  showCloseGuessAlerts?: boolean;
  turnsPerPlayer: TurnsPerPlayerPreset;
  rerollsPerTurn?: RerollsPerTurnPreset;
  artEnabled: boolean;
  enabledCollectionIds?: string[];
}

export interface RoomPlayer {
  id: string;
  nickname: string;
  connected: boolean;
  reconnectBy: number | null;
  reconnectRemainingMs?: number | null;
  isHost: boolean;
  canGuessFromTurnNumber?: number | null;
}

export interface MatchPauseState {
  mode: 'paused' | 'resuming';
  pausedPhase: LiveRoomStatus;
  phaseRemainingMs: number;
  pauseEndsAt: number | null;
  resumeEndsAt: number | null;
}

export interface ChatMessage {
  id: string;
  senderPlayerId: string | null;
  senderNickname: string | null;
  kind: 'message' | 'correctGuess' | 'otherCorrectGuess' | 'system' | 'roundHeader';
  text: string;
  createdAt: number;
  turnNumber?: number | null;
}

export type RoomFeedAudience =
  | { type: 'room' }
  | { type: 'player'; playerId: string }
  | { type: 'players'; playerIds: string[] };

export interface BaseRoomFeedItem {
  id: string;
  createdAt: number;
  turnNumber: number | null;
}

export interface PlayerChatFeedItem extends BaseRoomFeedItem {
  type: 'playerChat';
  senderPlayerId: string;
  senderNickname: string;
  text: string;
}

export interface RoundHeaderFeedItem extends BaseRoomFeedItem {
  type: 'roundHeader';
  roundNumber: number;
}

export interface SystemFeedItem extends BaseRoomFeedItem {
  type: 'system';
  event:
    | { type: 'playerJoined'; nickname: string }
    | { type: 'drawerAssigned'; drawerNickname: string }
    | { type: 'answerRevealed'; answer: string }
    | { type: 'allGuessersCorrect' }
    | { type: 'closeGuess'; guesserNickname: string; kind?: string; message?: string }
    | { type: 'gamePaused' }
    | { type: 'gameResumed' };
}

export interface CorrectGuessFeedItem extends BaseRoomFeedItem {
  type: 'correctGuess';
  visibility: 'self' | 'others';
  guesserPlayerId: string | null;
  guesserNickname: string | null;
  answer?: string;
  guessPosition?: number;
  totalGuessers?: number;
}

export type RoomFeedItem = PlayerChatFeedItem | SystemFeedItem | RoundHeaderFeedItem | CorrectGuessFeedItem;

export interface ScoreboardEntry {
  playerId: string;
  nickname: string;
  score: number;
}

export interface RoundScoreChange {
  playerId: string;
  nickname: string;
  points: number;
  reason: 'drawer' | 'guesser';
}

export interface CurrentTurnState {
  turnNumber: number;
  roundNumber?: number;
  totalTurns: number;
  drawerPlayerId: string;
  drawerNickname: string;
  prompt: string | null;
  promptVisibility: PromptVisibility;
  promptDisplayMetadata?: PromptDisplayMetadata | null;
  referenceArtUrl?: string | null;
  rerollsRemaining: RerollsRemaining;
  rerolledFrom: string | null;
  correctGuessPlayerIds: string[];
  guessingDelayRemainingMs?: number | null;
  drawing: DrawingState | null;
}

export interface CompletedTurnState {
  turnNumber: number;
  roundNumber?: number;
  drawerPlayerId: string;
  drawerNickname: string;
  answer: string;
  rerolledFrom: string | null;
  finalImageDataUrl: string | null;
  scoreChanges: RoundScoreChange[];
}

export interface MatchState {
  phaseEndsAt: number | null;
  currentTurn: CurrentTurnState | null;
  completedTurns: CompletedTurnState[];
  feed: RoomFeedItem[];
  /** @deprecated Use feed. */
  chatMessages?: ChatMessage[];
  scoreboard: ScoreboardEntry[];
  pause?: MatchPauseState | null;
  pauseCooldownEndsAt?: number | null;
}

export interface RoomState {
  code: string;
  shareUrl: string;
  stateRevision?: number;
  status: RoomStatus;
  serverReferenceArtEnabled?: boolean;
  players: RoomPlayer[];
  settings: LobbySettings;
  match: MatchState | null;
  lobbyDrawing: DrawingState | null;
  lobbyFeed: RoomFeedItem[];
}

export type LobbyPlayer = RoomPlayer;
export type LobbyRoomState = RoomState;

export interface CreateRoomRequest {
  nickname: string;
}

export interface JoinRoomRequest {
  code: string;
  nickname: string;
}

export interface ReclaimRoomRequest {
  code: string;
  sessionToken: string;
}

export interface RoomStateRequest {
  code: string;
}

export interface DrawingSnapshotRequest {
  code: string;
  target: 'match' | 'lobby';
}

export interface UpdateLobbySettingsRequest {
  code: string;
  settings: LobbySettings;
}

export interface StartRoomRequest {
  code: string;
}

export interface PauseRoomRequest {
  code: string;
}

export interface ResumeRoomRequest {
  code: string;
}

export interface KickPlayerRequest {
  code: string;
  playerId: string;
}

export interface RerollTurnRequest {
  code: string;
}

export interface DrawingActionRequest {
  code: string;
  action: DrawingAction;
}

export interface LobbyDrawingActionRequest {
  code: string;
  action: DrawingAction;
}

export interface SubmitMessageRequest {
  code: string;
  text: string;
}

export interface CreateRoomSuccess {
  playerId: string;
  sessionToken: string;
  room: RoomState;
}

export interface JoinRoomSuccess {
  playerId: string;
  sessionToken: string;
  room: RoomState;
}

export interface ReclaimRoomSuccess {
  playerId: string;
  sessionToken: string;
  room: RoomState;
}

export interface RoomStateSuccess {
  room: RoomState;
}

export interface DrawingSnapshotSuccess {
  roomCode: string;
  target: 'match' | 'lobby';
  revision: number;
  stateRevision?: number;
  drawing: DrawingState;
}

export interface UpdateLobbySettingsSuccess {
  room: RoomState;
}

export interface StartRoomSuccess {
  room: RoomState;
}

export interface PauseRoomSuccess {
  room: RoomState;
}

export interface ResumeRoomSuccess {
  room: RoomState;
}

export interface KickPlayerSuccess {
  room: RoomState;
  kickedPlayerId: string;
}

export interface RerollTurnSuccess {
  room: RoomState;
}

export interface DrawingActionSuccess {
  roomCode: string;
  revision: number;
  stateRevision?: number;
  authoritativeStroke?: import('./drawing').DrawingStrokeOperation;
  finalizedStrokes?: import('./drawing').DrawingStrokeOperation[];
  actionApplied?: boolean;
}

export interface LobbyDrawingActionSuccess {
  roomCode: string;
  revision: number;
  stateRevision?: number;
  authoritativeStroke?: import('./drawing').DrawingStrokeOperation;
  finalizedStrokes?: import('./drawing').DrawingStrokeOperation[];
  actionApplied?: boolean;
}

export interface SubmitMessageSuccess {
  room: RoomState;
}
