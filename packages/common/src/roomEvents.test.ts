import { describe, expectTypeOf, it } from 'vitest';
import type {
  ApiResult,
  CreateRoomRequest,
  CreateRoomSuccess,
  KickPlayerRequest,
  KickPlayerSuccess,
  StartRoomRequest,
  StartRoomSuccess,
} from './room';
import type {
  RoomClientToServerSocketEvents,
  RoomRequest,
  RoomResponse,
  RoomServerPayload,
  RoomServerToClientSocketEvents,
} from './roomEvents';

describe('room event contract types', () => {
  it('derives client request and response types from the event name', () => {
    expectTypeOf<RoomRequest<'room:create'>>().toEqualTypeOf<CreateRoomRequest>();
    expectTypeOf<RoomResponse<'room:create'>>().toEqualTypeOf<ApiResult<CreateRoomSuccess>>();

    expectTypeOf<RoomRequest<'room:start'>>().toEqualTypeOf<StartRoomRequest>();
    expectTypeOf<RoomResponse<'room:start'>>().toEqualTypeOf<ApiResult<StartRoomSuccess>>();

    expectTypeOf<RoomRequest<'room:kick'>>().toEqualTypeOf<KickPlayerRequest>();
    expectTypeOf<RoomResponse<'room:kick'>>().toEqualTypeOf<ApiResult<KickPlayerSuccess>>();
  });

  it('derives Socket.IO adapter event maps from the shared room contract', () => {
    expectTypeOf<Parameters<RoomClientToServerSocketEvents['room:start']>[0]>().toEqualTypeOf<StartRoomRequest>();
    expectTypeOf<Parameters<RoomClientToServerSocketEvents['room:start']>[1]>().toEqualTypeOf<(
      response: ApiResult<StartRoomSuccess>,
    ) => void>();

    expectTypeOf<RoomServerPayload<'room:kicked'>>().toEqualTypeOf<{ roomCode: string; message: string }>();
    expectTypeOf<Parameters<RoomServerToClientSocketEvents['room:kicked']>[0]>().toEqualTypeOf<{
      roomCode: string;
      message: string;
    }>();
  });
});
