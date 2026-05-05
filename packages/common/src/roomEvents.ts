import type { DrawingActionAppliedEvent } from './drawing';
import type {
  ApiResult,
  CreateRoomRequest,
  CreateRoomSuccess,
  DrawingActionRequest,
  DrawingActionSuccess,
  DrawingSnapshotRequest,
  DrawingSnapshotSuccess,
  JoinRoomRequest,
  JoinRoomSuccess,
  KickPlayerRequest,
  KickPlayerSuccess,
  LobbyDrawingActionRequest,
  LobbyDrawingActionSuccess,
  PauseRoomRequest,
  PauseRoomSuccess,
  ReclaimRoomRequest,
  ReclaimRoomSuccess,
  RerollTurnRequest,
  RerollTurnSuccess,
  ResumeRoomRequest,
  ResumeRoomSuccess,
  RoomState,
  RoomStateRequest,
  RoomStateSuccess,
  StartRoomRequest,
  StartRoomSuccess,
  SubmitMessageRequest,
  SubmitMessageSuccess,
  UpdateLobbySettingsRequest,
  UpdateLobbySettingsSuccess,
} from './room';

export interface RoomDrawingClientToServerEvents {
  'room:bindDrawingTransport': {
    request: { code: string; controlConnectionId: string };
    response: ApiResult<{ roomCode: string }>;
  };
  'room:drawingAction': {
    request: DrawingActionRequest;
    response: ApiResult<DrawingActionSuccess>;
  };
  'room:lobbyDrawingAction': {
    request: LobbyDrawingActionRequest;
    response: ApiResult<LobbyDrawingActionSuccess>;
  };
}

export interface RoomClientToServerEvents {
  'room:create': {
    request: CreateRoomRequest;
    response: ApiResult<CreateRoomSuccess>;
  };
  'room:join': {
    request: JoinRoomRequest;
    response: ApiResult<JoinRoomSuccess>;
  };
  'room:reclaim': {
    request: ReclaimRoomRequest;
    response: ApiResult<ReclaimRoomSuccess>;
  };
  'room:getState': {
    request: RoomStateRequest;
    response: ApiResult<RoomStateSuccess>;
  };
  'room:getDrawingSnapshot': {
    request: DrawingSnapshotRequest;
    response: ApiResult<DrawingSnapshotSuccess>;
  };
  'room:updateSettings': {
    request: UpdateLobbySettingsRequest;
    response: ApiResult<UpdateLobbySettingsSuccess>;
  };
  'room:start': {
    request: StartRoomRequest;
    response: ApiResult<StartRoomSuccess>;
  };
  'room:pause': {
    request: PauseRoomRequest;
    response: ApiResult<PauseRoomSuccess>;
  };
  'room:resume': {
    request: ResumeRoomRequest;
    response: ApiResult<ResumeRoomSuccess>;
  };
  'room:kick': {
    request: KickPlayerRequest;
    response: ApiResult<KickPlayerSuccess>;
  };
  'room:reroll': {
    request: RerollTurnRequest;
    response: ApiResult<RerollTurnSuccess>;
  };
  'room:drawingAction': {
    request: DrawingActionRequest;
    response: ApiResult<DrawingActionSuccess>;
  };
  'room:lobbyDrawingAction': {
    request: LobbyDrawingActionRequest;
    response: ApiResult<LobbyDrawingActionSuccess>;
  };
  'room:submitMessage': {
    request: SubmitMessageRequest;
    response: ApiResult<SubmitMessageSuccess>;
  };
}

export interface RoomServerToClientEvents {
  'room:state': RoomState;
  'room:kicked': {
    roomCode: string;
    message: string;
  };
  'room:drawingActionApplied': DrawingActionAppliedEvent;
  'room:lobbyDrawingActionApplied': DrawingActionAppliedEvent;
}

export type RoomClientEventName = keyof RoomClientToServerEvents;
export type RoomDrawingClientEventName = keyof RoomDrawingClientToServerEvents;
export type RoomServerEventName = keyof RoomServerToClientEvents;

export type RoomRequest<E extends RoomClientEventName> = RoomClientToServerEvents[E]['request'];
export type RoomResponse<E extends RoomClientEventName> = RoomClientToServerEvents[E]['response'];
export type RoomDrawingRequest<E extends RoomDrawingClientEventName> = RoomDrawingClientToServerEvents[E]['request'];
export type RoomDrawingResponse<E extends RoomDrawingClientEventName> = RoomDrawingClientToServerEvents[E]['response'];
export type RoomServerPayload<E extends RoomServerEventName> = RoomServerToClientEvents[E];

export type RoomClientToServerSocketEvents = {
  [E in RoomClientEventName]: (request: RoomRequest<E>, ack: (response: RoomResponse<E>) => void) => void;
};

export type RoomServerToClientSocketEvents = {
  [E in RoomServerEventName]: (payload: RoomServerPayload<E>) => void;
};

export type RoomDrawingClientToServerSocketEvents = {
  [E in RoomDrawingClientEventName]: (request: RoomDrawingRequest<E>, ack: (response: RoomDrawingResponse<E>) => void) => void;
};
