import type { ApiResult, DrawingActionSuccess, LobbyDrawingActionSuccess } from '@7ito/sketcherson-common/room';
import type { DrawingAction, DrawingState } from '@7ito/sketcherson-common/drawing';
import type { RoomRecord } from './model';
import { ServerDrawingChannel, type DrawingChannelServer } from './ServerDrawingChannel';

export interface DrawingControllerOptions {
  applyDrawingAction: (drawing: DrawingState, action: DrawingAction) => ApiResult<null>;
  consumeDrawingRateLimit: (connectionId: string) => ApiResult<never> | null;
  touchRoom: (room: RoomRecord) => void;
  lobbyDrawingEnabled: boolean;
}

interface DrawingActorInput {
  room: RoomRecord;
  playerId: string;
  connectionId: string;
  action: DrawingAction;
}

export class DrawingController {
  private readonly drawingChannel: DrawingChannelServer;

  public constructor(options: DrawingControllerOptions) {
    this.drawingChannel = new ServerDrawingChannel(options);
  }

  public applyMatchDrawingAction(input: DrawingActorInput): ApiResult<DrawingActionSuccess> {
    const result = this.drawingChannel.apply({
      room: input.room,
      actor: {
        playerId: input.playerId,
        connectionId: input.connectionId,
      },
      target: 'match',
      action: input.action,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        roomCode: result.data.code,
        revision: result.data.revision,
        stateRevision: result.data.stateRevision,
        authoritativeStroke: result.data.authoritativeStroke,
      },
    };
  }

  public applyLobbyDrawingAction(input: DrawingActorInput): ApiResult<LobbyDrawingActionSuccess> {
    const result = this.drawingChannel.apply({
      room: input.room,
      actor: {
        playerId: input.playerId,
        connectionId: input.connectionId,
      },
      target: 'lobby',
      action: input.action,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        roomCode: result.data.code,
        revision: result.data.revision,
        stateRevision: result.data.stateRevision,
        authoritativeStroke: result.data.authoritativeStroke,
      },
    };
  }
}
