import type { DrawingTarget } from '@7ito/sketcherson-common/drawingRealtime';
import type { DrawingAction, DrawingActionAppliedEvent, DrawingState, DrawingStrokeOperation } from '@7ito/sketcherson-common/drawing';
import type { ApiResult } from '@7ito/sketcherson-common/room';
import { estimateSerializedPayloadBytes, logDrawingTransportMetric } from '../../drawingMetrics';
import type { RoomRecord } from './model';

export const LOBBY_DRAWING_MAX_OPERATIONS = 500;

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

    const authoritativeStroke = input.action.type === 'endStroke'
      ? cloneActiveStroke(policyResult.data, input.action.strokeId)
      : undefined;
    const result = this.options.applyDrawingAction(policyResult.data, input.action);
    if (!result.ok) {
      return result;
    }

    this.options.touchRoom(input.room);
    logDrawingTransportMetric('drawing.retained_state', {
      roomCode: input.room.code,
      target: input.target,
      operationCount: policyResult.data.operations.length,
      activeStrokeCount: policyResult.data.activeStrokes.length,
      undoneOperationCount: policyResult.data.undoneOperations.length,
      retainedBytes: estimateSerializedPayloadBytes(policyResult.data),
    });

    return {
      ok: true,
      data: {
        code: input.room.code,
        action: input.action,
        revision: policyResult.data.revision,
        stateRevision: input.room.stateRevision,
        authoritativeStroke,
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

      const lobbyDrawingLimitResult = this.validateLobbyDrawingLimits(input.room, input.action);
      if (!lobbyDrawingLimitResult.ok) {
        return lobbyDrawingLimitResult;
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

  private validateLobbyDrawingLimits(room: RoomRecord, action: DrawingAction): ApiResult<null> {
    if (
      (action.type === 'beginStroke' || action.type === 'fill') &&
      room.lobbyDrawing.operations.length >= LOBBY_DRAWING_MAX_OPERATIONS
    ) {
      return {
        ok: false,
        error: {
          code: 'INVALID_DRAW_ACTION',
          message: `Lobby drawing history can only contain ${LOBBY_DRAWING_MAX_OPERATIONS} operations.`,
        },
      };
    }

    if (action.type === 'beginStroke') {
      const activeStrokeLimit = Math.max(1, room.players.size);
      if (room.lobbyDrawing.activeStrokes.length >= activeStrokeLimit) {
        return {
          ok: false,
          error: {
            code: 'INVALID_DRAW_ACTION',
            message: 'Lobby drawing already has the maximum number of active strokes.',
          },
        };
      }
    }

    return { ok: true, data: null };
  }

  private consumeRateLimitForAction(connectionId: string, action: DrawingAction): ApiResult<never> | null {
    if (action.type === 'endStroke') {
      return null;
    }

    return this.options.consumeDrawingRateLimit(connectionId);
  }
}

function cloneActiveStroke(drawing: DrawingState, strokeId: string): DrawingStrokeOperation | undefined {
  const stroke = drawing.activeStrokes.find((candidate) => candidate.id === strokeId);
  if (!stroke) {
    return undefined;
  }

  return {
    kind: 'stroke',
    id: stroke.id,
    tool: stroke.tool,
    color: stroke.color,
    size: stroke.size,
    points: stroke.points.map((point) => ({ ...point })),
  };
}
