import type { DrawingTarget } from '@7ito/sketcherson-common/drawingRealtime';
import { DRAWING_MAX_OPERATIONS, type DrawingAction, type DrawingActionAppliedEvent, type DrawingState, type DrawingStrokeOperation } from '@7ito/sketcherson-common/drawing';
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
  }): ApiResult<DrawingActionAppliedEvent & { actionApplied?: boolean }>;
}

export class ServerDrawingChannel implements DrawingChannelServer {
  private readonly lobbyStrokeOwners = new Map<string, string>();

  public constructor(private readonly options: ServerDrawingChannelOptions) {}

  public apply(input: {
    room: RoomRecord;
    actor: DrawingChannelActor;
    target: DrawingTarget;
    action: DrawingAction;
  }): ApiResult<DrawingActionAppliedEvent & { actionApplied?: boolean }> {
    const rateLimitError = this.consumeRateLimitForAction(input.actor.connectionId, input.action);
    if (rateLimitError) {
      return rateLimitError;
    }

    const policyResult = this.getWritableDrawing(input);
    if (!policyResult.ok) {
      return policyResult;
    }

    const preparationResult = input.target === 'lobby'
      ? this.prepareLobbyDrawingForAction(input.room, input.actor, input.action)
      : this.prepareMatchDrawingForAction(policyResult.data, input.action);
    if (!preparationResult.ok) {
      return preparationResult;
    }

    if (this.isAlreadyFinalizedEndStroke(policyResult.data, input.action)) {
      return {
        ok: true,
        data: {
          code: input.room.code,
          action: input.action,
          revision: policyResult.data.revision,
          stateRevision: input.room.stateRevision,
          actionApplied: false,
        },
      };
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
        finalizedStrokes: preparationResult.data.finalizedStrokes.length > 0
          ? preparationResult.data.finalizedStrokes
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

    return { ok: true, data: activeTurn.drawing };
  }

  private prepareMatchDrawingForAction(
    drawing: DrawingState,
    action: DrawingAction,
  ): ApiResult<{ finalizedStrokes: DrawingStrokeOperation[] }> {
    if (action.type === 'beginStroke' && drawing.activeStrokes.some((stroke) => stroke.id === action.strokeId)) {
      return { ok: true, data: { finalizedStrokes: [] } };
    }

    const finalizedStrokes = action.type === 'beginStroke'
      ? drawing.activeStrokes.filter((stroke) => stroke.id !== action.strokeId).map(cloneActiveStrokeOperation)
      : [];

    if (finalizedStrokes.length > 0) {
      const finalizeResult = finalizeActiveStrokesIntoOperations(
        drawing,
        finalizedStrokes,
        DRAWING_MAX_OPERATIONS,
        `Drawing history can only contain ${DRAWING_MAX_OPERATIONS} operations.`,
      );
      if (!finalizeResult.ok) {
        return finalizeResult;
      }
    }

    return { ok: true, data: { finalizedStrokes } };
  }

  private prepareLobbyDrawingForAction(
    room: RoomRecord,
    actor: DrawingChannelActor,
    action: DrawingAction,
  ): ApiResult<{ finalizedStrokes: DrawingStrokeOperation[] }> {
    this.pruneLobbyStrokeOwners(room);

    if (action.type === 'beginStroke' && room.lobbyDrawing.activeStrokes.some((stroke) => stroke.id === action.strokeId)) {
      return { ok: true, data: { finalizedStrokes: [] } };
    }

    const finalizedStrokes = action.type === 'beginStroke'
      ? this.getLobbyActiveStrokesOwnedByPlayer(room, actor.playerId).filter((stroke) => stroke.id !== action.strokeId)
      : [];

    if (finalizedStrokes.length > 0) {
      const finalizeResult = finalizeActiveStrokesIntoOperations(
        room.lobbyDrawing,
        finalizedStrokes,
        LOBBY_DRAWING_MAX_OPERATIONS,
        `Lobby drawing history can only contain ${LOBBY_DRAWING_MAX_OPERATIONS} operations.`,
      );
      if (!finalizeResult.ok) {
        return finalizeResult;
      }

      for (const strokeId of finalizedStrokes.map((stroke) => stroke.id)) {
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

  private isAlreadyFinalizedEndStroke(drawing: DrawingState, action: DrawingAction): boolean {
    if (action.type !== 'endStroke') {
      return false;
    }

    return !drawing.activeStrokes.some((stroke) => stroke.id === action.strokeId) &&
      drawing.operations.some((operation) => operation.kind === 'stroke' && operation.id === action.strokeId);
  }
}

function finalizeActiveStrokesIntoOperations(
  drawing: DrawingState,
  finalizedStrokes: DrawingStrokeOperation[],
  maxOperations: number,
  maxOperationsMessage: string,
): ApiResult<null> {
  if (drawing.operations.length + finalizedStrokes.length > maxOperations) {
    return {
      ok: false,
      error: {
        code: 'INVALID_DRAW_ACTION',
        message: maxOperationsMessage,
      },
    };
  }

  const finalizedStrokeIds = new Set(finalizedStrokes.map((stroke) => stroke.id));
  drawing.operations.push(...finalizedStrokes.map(cloneActiveStrokeOperation));
  drawing.activeStrokes = drawing.activeStrokes.filter((stroke) => !finalizedStrokeIds.has(stroke.id));
  drawing.undoneOperations = [];
  drawing.snapshotDataUrl = null;
  return { ok: true, data: null };
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
