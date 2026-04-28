import type { RoomClientEventName, RoomRequest, RoomResponse, RoomServerEventName, RoomServerPayload } from '@sketcherson/common/roomEvents';

export type RoomTransportUnsubscribe = () => void;

export interface RoomConnectionEvents {
  connect: string | undefined;
  disconnect: string;
  connect_error: unknown;
}

export interface RoomTransport {
  emitWithAck<E extends RoomClientEventName>(event: E, payload: RoomRequest<E>): Promise<RoomResponse<E>>;
  on<E extends RoomServerEventName>(event: E, handler: (payload: RoomServerPayload<E>) => void): RoomTransportUnsubscribe;
  onConnectionEvent<E extends keyof RoomConnectionEvents>(
    event: E,
    handler: (payload: RoomConnectionEvents[E]) => void,
  ): RoomTransportUnsubscribe;
}
