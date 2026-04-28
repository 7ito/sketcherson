import type { DrawingTarget } from '@sketcherson/common/drawingRealtime';
import type { DrawingAction, DrawingActionAppliedEvent, DrawingState } from '@sketcherson/common/drawing';
import type { ApiResult } from '@sketcherson/common/room';
import type { RoomRecord } from './model';

export interface DrawingChannelActor {
  playerId: string;
  connectionId: string;
}

export interface ServerDrawingChannelOptions {
  applyDrawingAction: (drawing: DrawingState, action: DrawingAction) => ApiResult<null>;
  consumeDrawingRateLimit: (connectionId: string) => ApiResult<never> | null;
  touchRoom: (room: RoomRecord) => void;
  lobbyDrawingEnabled: boolean;
}

export interface DrawingChannelServer {
  apply(input: {
    room: RoomRecord;
    actor: DrawingChannelActor;
    target: DrawingTarget;
    action: DrawingAction;
  }): ApiResult<DrawingActionAppliedEvent>;
}

export class ServerDrawingChannel implements DrawingChannelServer {
  public constructor(private readonly options: ServerDrawingChannelOptions) {}

  public apply(input: {
    room: RoomRecord;
    actor: DrawingChannelActor;
    target: DrawingTarget;
    action: DrawingAction;
  }): ApiResult<DrawingActionAppliedEvent> {
    const rateLimitError = this.consumeRateLimitForAction(input.actor.connectionId, input.action);
    if (rateLimitError) {
      return rateLimitError;
    }

    const policyResult = this.getWritableDrawing(input);
    if (!policyResult.ok) {
      return policyResult;
    }

    const result = this.options.applyDrawingAction(policyResult.data, input.action);
    if (!result.ok) {
      return result;
    }

    this.options.touchRoom(input.room);

    return {
      ok: true,
      data: {
        code: input.room.code,
        action: input.action,
        revision: policyResult.data.revision,
        stateRevision: input.room.stateRevision,
      },
    };
  }

  private getWritableDrawing(input: {
    room: RoomRecord;
    actor: DrawingChannelActor;
    target: DrawingTarget;
    action: DrawingAction;
  }): ApiResult<DrawingState> {
    if (input.target === 'lobby') {
      if (!this.options.lobbyDrawingEnabled) {
        return {
          ok: false,
          error: {
            code: 'INVALID_STATE',
            message: 'Lobby drawing is disabled for this game.',
          },
        };
      }

      if (input.room.status !== 'lobby') {
        return {
          ok: false,
          error: {
            code: 'INVALID_STATE',
            message: 'Lobby drawing is only available in the lobby.',
          },
        };
      }

      if (input.action.type === 'undo' || input.action.type === 'redo' || input.action.type === 'clear') {
        return {
          ok: false,
          error: {
            code: 'INVALID_DRAW_ACTION',
            message: 'Undo, redo, and clear are not available in the lobby.',
          },
        };
      }

      return { ok: true, data: input.room.lobbyDrawing };
    }

    const match = input.room.match;
    const activeTurn = match?.activeTurn;

    if (!match || !activeTurn || input.room.status !== 'round') {
      return {
        ok: false,
        error: {
          code: 'INVALID_STATE',
          message: 'Drawing is only available during an active round.',
        },
      };
    }

    if (activeTurn.drawerPlayerId !== input.actor.playerId) {
      return {
        ok: false,
        error: {
          code: 'NOT_DRAWER',
          message: 'Only the active drawer can use the canvas tools.',
        },
      };
    }

    if (input.action.type === 'beginStroke' && activeTurn.drawing.activeStrokes.length > 0) {
      activeTurn.drawing.activeStrokes = [];
      activeTurn.drawing.snapshotDataUrl = null;
    }

    return { ok: true, data: activeTurn.drawing };
  }

  private consumeRateLimitForAction(connectionId: string, action: DrawingAction): ApiResult<never> | null {
    if (action.type === 'endStroke') {
      return null;
    }

    return this.options.consumeDrawingRateLimit(connectionId);
  }
}
