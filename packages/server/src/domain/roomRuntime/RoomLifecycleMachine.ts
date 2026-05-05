import type { ApiResult, CreateRoomSuccess, DrawingActionSuccess, DrawingSnapshotSuccess, JoinRoomSuccess, LobbyDrawingActionSuccess, LobbySettings, PauseRoomSuccess, ReclaimRoomSuccess, RestartRoomSuccess, ResumeRoomSuccess, RerollTurnSuccess, RoomStateSuccess, StartRoomSuccess, SubmitMessageSuccess, UpdateLobbySettingsSuccess } from '@7ito/sketcherson-common/room';
import type { DrawingAction } from '@7ito/sketcherson-common/drawing';
import type { RoomTimerFiredInput } from './timers';
import type { ActorInput, BroadcastTarget, ConnectionInput, EmptyActorInput, KickPlayerResult } from './transport';

export type RoomCommand =
  | ({ type: 'createRoom' } & ConnectionInput & { nickname: string })
  | ({ type: 'joinRoom' } & ConnectionInput & { code: string; nickname: string })
  | ({ type: 'reclaimRoom' } & ConnectionInput & { code: string; sessionToken: string })
  | ({ type: 'updateLobbySettings' } & ActorInput<{ settings: LobbySettings }>)
  | ({ type: 'startRoom' } & EmptyActorInput)
  | ({ type: 'pauseRoom' } & EmptyActorInput)
  | ({ type: 'resumeRoom' } & EmptyActorInput)
  | ({ type: 'restartRoom' } & EmptyActorInput)
  | ({ type: 'kickPlayer' } & ActorInput<{ playerId: string }>)
  | ({ type: 'rerollTurn' } & EmptyActorInput)
  | ({ type: 'submitMessage' } & ActorInput<{ text: string }>)
  | ({ type: 'applyDrawingAction' } & ActorInput<{ action: DrawingAction }>)
  | ({ type: 'applyLobbyDrawingAction' } & ActorInput<{ action: DrawingAction }>)
  | { type: 'disconnect'; connectionId: string }
  | { type: 'timerFired'; timer: RoomTimerFiredInput };

export type RoomCommandResult =
  | ApiResult<CreateRoomSuccess>
  | ApiResult<JoinRoomSuccess>
  | ApiResult<ReclaimRoomSuccess>
  | ApiResult<UpdateLobbySettingsSuccess>
  | ApiResult<StartRoomSuccess>
  | ApiResult<PauseRoomSuccess>
  | ApiResult<ResumeRoomSuccess>
  | ApiResult<RestartRoomSuccess>
  | KickPlayerResult
  | ApiResult<RerollTurnSuccess>
  | ApiResult<SubmitMessageSuccess>
  | ApiResult<DrawingActionSuccess>
  | ApiResult<LobbyDrawingActionSuccess>
  | string
  | null
  | void;

export type RoomQuery =
  | { type: 'getRoomState'; code: string; origin: string; viewerConnectionId?: string }
  | { type: 'getDrawingSnapshot'; code: string; target: 'match' | 'lobby'; viewerConnectionId?: string }
  | { type: 'getBroadcastTargets'; code: string; origin: string; drawingPayload?: 'include' | 'omit' }
  | { type: 'hasRoom'; code: string };

export type RoomQueryResult = ApiResult<RoomStateSuccess> | ApiResult<DrawingSnapshotSuccess> | BroadcastTarget[] | boolean;

export interface RoomLifecycleMachine {
  onChanged(listener: (roomCode: string) => void): void;
  destroy(): void;
  dispatch(command: RoomCommand): RoomCommandResult;
  query(query: RoomQuery): RoomQueryResult;
}
