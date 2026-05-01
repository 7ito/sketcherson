import type { ApiResult, CreateRoomSuccess, DrawingActionSuccess, JoinRoomSuccess, LobbyDrawingActionSuccess, LobbySettings, PauseRoomSuccess, ReclaimRoomSuccess, ResumeRoomSuccess, RerollTurnSuccess, RoomStateSuccess, StartRoomSuccess, SubmitMessageSuccess, UpdateLobbySettingsSuccess } from '@sketcherson/common/room';
import type { DrawingAction } from '@sketcherson/common/drawing';
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
  | { type: 'getBroadcastTargets'; code: string; origin: string }
  | { type: 'hasRoom'; code: string };

export type RoomQueryResult = ApiResult<RoomStateSuccess> | BroadcastTarget[] | boolean;

export interface RoomLifecycleMachine {
  onChanged(listener: (roomCode: string) => void): void;
  destroy(): void;
  dispatch(command: RoomCommand): RoomCommandResult;
  query(query: RoomQuery): RoomQueryResult;
}

