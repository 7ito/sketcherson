import type { RoomClientEventName, RoomDrawingClientEventName, RoomDrawingRequest, RoomDrawingResponse, RoomRequest, RoomResponse, RoomServerEventName, RoomServerPayload } from '@7ito/sketcherson-common/roomEvents';

export type RoomTransportUnsubscribe = () => void;

export interface RoomConnectionEvents {
  connect: string | undefined;
  disconnect: string;
  connect_error: unknown;
}

export interface RoomDrawingTransport {
  emitWithAck<E extends RoomDrawingClientEventName>(event: E, payload: RoomDrawingRequest<E>): Promise<RoomDrawingResponse<E>>;
  on<E extends RoomServerEventName>(event: E, handler: (payload: RoomServerPayload<E>) => void): RoomTransportUnsubscribe;
  onConnectionEvent?<E extends keyof RoomConnectionEvents>(
    event: E,
    handler: (payload: RoomConnectionEvents[E]) => void,
  ): RoomTransportUnsubscribe;
}

export interface RoomTransport {
  emitWithAck<E extends RoomClientEventName>(event: E, payload: RoomRequest<E>): Promise<RoomResponse<E>>;
  on<E extends RoomServerEventName>(event: E, handler: (payload: RoomServerPayload<E>) => void): RoomTransportUnsubscribe;
  onConnectionEvent<E extends keyof RoomConnectionEvents>(
    event: E,
    handler: (payload: RoomConnectionEvents[E]) => void,
  ): RoomTransportUnsubscribe;
  getConnectionId?(): string | undefined;
}
