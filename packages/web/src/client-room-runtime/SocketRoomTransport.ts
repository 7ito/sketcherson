import type { RoomClientEventName, RoomRequest, RoomResponse, RoomServerEventName, RoomServerPayload } from '@7ito/sketcherson-common/roomEvents';
import type { RoomConnectionEvents, RoomTransport, RoomTransportUnsubscribe } from './RoomTransport';

interface SocketLike {
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
  };
}
