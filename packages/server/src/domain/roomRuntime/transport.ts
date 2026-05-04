import type { ApiError, KickPlayerSuccess, RoomState } from '@7ito/sketcherson-common/room';

export interface ConnectionInput {
  connectionId: string;
  origin: string;
}

export interface ActorInput<TPayload = undefined> extends ConnectionInput {
  payload: TPayload;
}

export interface EmptyActorInput extends ConnectionInput {}

export type KickPlayerResult =
  | { ok: true; data: KickPlayerSuccess; kickedConnectionId: string | null }
  | { ok: false; error: ApiError };

export interface BroadcastTarget {
  connectionId: string;
  room: RoomState;
}
