import type { RoomClientEventName, RoomDrawingClientEventName, RoomDrawingRequest, RoomDrawingResponse, RoomRequest, RoomResponse, RoomServerEventName, RoomServerPayload } from '@7ito/sketcherson-common/roomEvents';
import type { RoomConnectionEvents, RoomDrawingTransport, RoomTransport, RoomTransportUnsubscribe } from './RoomTransport';

interface SocketLike {
  id?: string;
  emit(event: string, payload: unknown, callback: (result: unknown) => void): unknown;
  on(event: string, handler: (...args: unknown[]) => void): unknown;
  off(event: string, handler: (...args: unknown[]) => void): unknown;
}

export function createSocketRoomTransport(socket: SocketLike): RoomTransport {
  return {
    emitWithAck<E extends RoomClientEventName>(event: E, payload: RoomRequest<E>): Promise<RoomResponse<E>> {
      return new Promise((resolve) => {
        socket.emit(event, payload, (result: unknown) => {
          resolve(result as RoomResponse<E>);
        });
      });
    },
    on<E extends RoomServerEventName>(event: E, handler: (payload: RoomServerPayload<E>) => void): RoomTransportUnsubscribe {
      const socketHandler = (payload: unknown) => handler(payload as RoomServerPayload<E>);
      socket.on(event, socketHandler);
      return () => {
        socket.off(event, socketHandler);
      };
    },
    onConnectionEvent<E extends keyof RoomConnectionEvents>(
      event: E,
      handler: (payload: RoomConnectionEvents[E]) => void,
    ): RoomTransportUnsubscribe {
      const socketHandler = (payload: unknown) => handler(payload as RoomConnectionEvents[E]);
      socket.on(event, socketHandler);
      return () => {
        socket.off(event, socketHandler);
      };
    },
    getConnectionId() {
      return socket.id;
    },
  };
}

export function createSocketRoomDrawingTransport(socket: SocketLike): RoomDrawingTransport {
  return {
    emitWithAck<E extends RoomDrawingClientEventName>(event: E, payload: RoomDrawingRequest<E>): Promise<RoomDrawingResponse<E>> {
      return new Promise((resolve) => {
        socket.emit(event, payload, (result: unknown) => {
          resolve(result as RoomDrawingResponse<E>);
        });
      });
    },
    on<E extends RoomServerEventName>(event: E, handler: (payload: RoomServerPayload<E>) => void): RoomTransportUnsubscribe {
      const socketHandler = (payload: unknown) => handler(payload as RoomServerPayload<E>);
      socket.on(event, socketHandler);
      return () => {
        socket.off(event, socketHandler);
      };
    },
  };
}
