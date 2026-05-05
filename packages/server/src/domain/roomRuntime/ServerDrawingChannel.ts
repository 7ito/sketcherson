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
  private readonly lobbyStrokeOwners = new Map<string, string>();

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

    const lobbyPreparationResult = input.target === 'lobby'
      ? this.prepareLobbyDrawingForAction(input.room, input.actor, input.action)
      : { ok: true as const, data: { finalizedStrokes: [] as DrawingStrokeOperation[] } };
    if (!lobbyPreparationResult.ok) {
      return lobbyPreparationResult;
    }

    const authoritativeStroke = input.action.type === 'endStroke'
      ? cloneActiveStroke(policyResult.data, input.action.strokeId)
      : undefined;
    const result = this.options.applyDrawingAction(policyResult.data, input.action);
    if (!result.ok) {
      return result;
    }

    this.updateLobbyStrokeOwnersAfterAppliedAction(input.room, input.actor, input.target, input.action);
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
        finalizedStrokes: lobbyPreparationResult.data.finalizedStrokes.length > 0
          ? lobbyPreparationResult.data.finalizedStrokes
          : undefined,
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

  private prepareLobbyDrawingForAction(
    room: RoomRecord,
    actor: DrawingChannelActor,
    action: DrawingAction,
  ): ApiResult<{ finalizedStrokes: DrawingStrokeOperation[] }> {
    this.pruneLobbyStrokeOwners(room);

    const finalizedStrokes = action.type === 'beginStroke'
      ? this.getLobbyActiveStrokesOwnedByPlayer(room, actor.playerId)
      : [];

    if (finalizedStrokes.length > 0) {
      if (room.lobbyDrawing.operations.length + finalizedStrokes.length >= LOBBY_DRAWING_MAX_OPERATIONS) {
        return {
          ok: false,
          error: {
            code: 'INVALID_DRAW_ACTION',
            message: `Lobby drawing history can only contain ${LOBBY_DRAWING_MAX_OPERATIONS} operations.`,
          },
        };
      }

      const finalizedStrokeIds = new Set(finalizedStrokes.map((stroke) => stroke.id));
      room.lobbyDrawing.operations.push(...finalizedStrokes.map(cloneActiveStrokeOperation));
      room.lobbyDrawing.activeStrokes = room.lobbyDrawing.activeStrokes.filter((stroke) => !finalizedStrokeIds.has(stroke.id));
      room.lobbyDrawing.undoneOperations = [];
      room.lobbyDrawing.snapshotDataUrl = null;

      for (const strokeId of finalizedStrokeIds) {
        this.lobbyStrokeOwners.delete(this.toLobbyStrokeOwnerKey(room.code, strokeId));
      }
    }

    const lobbyDrawingLimitResult = this.validateLobbyDrawingLimits(room, action);
    if (!lobbyDrawingLimitResult.ok) {
      return lobbyDrawingLimitResult;
    }

    return { ok: true, data: { finalizedStrokes } };
  }

  private updateLobbyStrokeOwnersAfterAppliedAction(
    room: RoomRecord,
    actor: DrawingChannelActor,
    target: DrawingTarget,
    action: DrawingAction,
  ): void {
    if (target !== 'lobby') {
      return;
    }

    if (action.type === 'beginStroke') {
      this.lobbyStrokeOwners.set(this.toLobbyStrokeOwnerKey(room.code, action.strokeId), actor.playerId);
      return;
    }

    if (action.type === 'endStroke') {
      this.lobbyStrokeOwners.delete(this.toLobbyStrokeOwnerKey(room.code, action.strokeId));
    }
  }

  private getLobbyActiveStrokesOwnedByPlayer(room: RoomRecord, playerId: string): DrawingStrokeOperation[] {
    return room.lobbyDrawing.activeStrokes
      .filter((stroke) => this.lobbyStrokeOwners.get(this.toLobbyStrokeOwnerKey(room.code, stroke.id)) === playerId)
      .map(cloneActiveStrokeOperation);
  }

  private pruneLobbyStrokeOwners(room: RoomRecord): void {
    const activeStrokeIds = new Set(room.lobbyDrawing.activeStrokes.map((stroke) => stroke.id));
    for (const key of [...this.lobbyStrokeOwners.keys()]) {
      const parsed = parseLobbyStrokeOwnerKey(key);
      if (!parsed || parsed.roomCode !== room.code || activeStrokeIds.has(parsed.strokeId)) {
        continue;
      }

      this.lobbyStrokeOwners.delete(key);
    }
  }

  private toLobbyStrokeOwnerKey(roomCode: string, strokeId: string): string {
    return `${roomCode}:${strokeId}`;
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

function cloneActiveStrokeOperation(stroke: DrawingStrokeOperation): DrawingStrokeOperation {
  return {
    kind: 'stroke',
    id: stroke.id,
    tool: stroke.tool,
    color: stroke.color,
    size: stroke.size,
    points: stroke.points.map((point) => ({ ...point })),
  };
}

function parseLobbyStrokeOwnerKey(key: string): { roomCode: string; strokeId: string } | null {
  const separatorIndex = key.indexOf(':');
  if (separatorIndex === -1) {
    return null;
  }

  return {
    roomCode: key.slice(0, separatorIndex),
    strokeId: key.slice(separatorIndex + 1),
  };
}

function cloneActiveStroke(drawing: DrawingState, strokeId: string): DrawingStrokeOperation | undefined {
  const stroke = drawing.activeStrokes.find((candidate) => candidate.id === strokeId);
  if (!stroke) {
    return undefined;
  }

  return cloneActiveStrokeOperation(stroke);
}
