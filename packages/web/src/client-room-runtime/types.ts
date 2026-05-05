import type { ApiResult, CreateRoomSuccess, DrawingActionSuccess, JoinRoomSuccess, KickPlayerSuccess, LobbyDrawingActionSuccess, LobbySettings, PauseRoomSuccess, ReclaimRoomSuccess, RestartRoomSuccess, ResumeRoomSuccess, RoomState, RoomStateSuccess, RerollTurnSuccess, StartRoomSuccess, SubmitMessageSuccess, UpdateLobbySettingsSuccess } from '@7ito/sketcherson-common/room';
import type { DrawingAction, DrawingState } from '@7ito/sketcherson-common/drawing';

export interface JoinedSession {
  playerId: string;
  roomCode: string;
  nickname: string;
  sessionToken: string;
}

export interface SessionRecoveryError {
  roomCode: string;
  message: string;
}

export interface RoomExitNotice {
  roomCode: string;
  message: string;
}

export interface ConnectionNotice {
  state: 'reconnecting' | 'offline';
  message: string;
}

export interface RoomClientSnapshot {
  activeRoom: RoomState | null;
  joinedSession: JoinedSession | null;
  sessionRecoveryError: SessionRecoveryError | null;
  roomExitNotice: RoomExitNotice | null;
  connectionNotice: ConnectionNotice | null;
  lobbyDrawing: DrawingState | null;
  matchDrawing: DrawingState | null;
}

export interface RoomClient {
  getSnapshot(): RoomClientSnapshot;
  subscribe(listener: () => void): () => void;
  createRoom(nickname: string): Promise<ApiResult<CreateRoomSuccess>>;
  joinRoom(code: string, nickname: string): Promise<ApiResult<JoinRoomSuccess>>;
  reclaimStoredSession(code: string): Promise<ApiResult<ReclaimRoomSuccess> | null>;
  lookupRoom(code: string): Promise<ApiResult<RoomStateSuccess>>;
  updateLobbySettings(code: string, settings: LobbySettings): Promise<ApiResult<UpdateLobbySettingsSuccess>>;
  startRoom(code: string): Promise<ApiResult<StartRoomSuccess>>;
  pauseRoom(code: string): Promise<ApiResult<PauseRoomSuccess>>;
  resumeRoom(code: string): Promise<ApiResult<ResumeRoomSuccess>>;
  restartRoom(code: string): Promise<ApiResult<RestartRoomSuccess>>;
  kickPlayer(code: string, playerId: string): Promise<ApiResult<KickPlayerSuccess>>;
  rerollTurn(code: string): Promise<ApiResult<RerollTurnSuccess>>;
  submitDrawingAction(code: string, action: DrawingAction): Promise<ApiResult<DrawingActionSuccess>>;
  submitLobbyDrawingAction(code: string, action: DrawingAction): Promise<ApiResult<LobbyDrawingActionSuccess>>;
  submitRoomMessage(code: string, text: string): Promise<ApiResult<SubmitMessageSuccess>>;
  destroy(): void;
}
