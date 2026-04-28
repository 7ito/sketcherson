import type { ApiResult } from './apiResult';
import type { DrawingAction, DrawingActionAppliedEvent, DrawingState } from './drawing';
import { applyDrawingAction, applyRemoteDrawingEvent } from './drawingProtocol';

export type DrawingTarget = 'match' | 'lobby';

export interface DrawingRealtimeCoreAccessors<TRoom> {
  getCode(room: TRoom): string;
  getDrawing(room: TRoom, target: DrawingTarget): DrawingState | null;
  replaceDrawing(room: TRoom, target: DrawingTarget, drawing: DrawingState): TRoom;
  getRevision(room: TRoom): number | undefined;
  setRevision(room: TRoom, revision: number | undefined): TRoom;
  shouldPreserveDrawing?(input: {
    current: TRoom;
    incoming: TRoom;
    target: DrawingTarget;
    currentDrawing: DrawingState;
    incomingDrawing: DrawingState;
  }): boolean;
}

export interface DrawingRealtimeCore<TRoom> {
  applyLocalAction(input: {
    room: TRoom;
    target: DrawingTarget;
    action: DrawingAction;
  }): ApiResult<{
    room: TRoom;
    drawing: DrawingState;
    revision: number;
  }>;

  applyRemoteEvent(input: {
    room: TRoom | null;
    target: DrawingTarget;
    event: DrawingActionAppliedEvent;
  }): {
    room: TRoom | null;
    status: 'applied' | 'ignored-stale' | 'requires-resync';
  };

  mergeSnapshot(input: {
    current: TRoom | null;
    incoming: TRoom;
  }): TRoom;
}

export function createDrawingRealtimeCore<TRoom>(accessors: DrawingRealtimeCoreAccessors<TRoom>): DrawingRealtimeCore<TRoom> {
  return {
    applyLocalAction({ room, target, action }) {
      const drawing = accessors.getDrawing(room, target);
      if (!drawing) {
        return {
          ok: false,
          error: {
            code: 'INVALID_STATE',
            message: 'Drawing target is not available.',
          },
        };
      }

      const result = applyDrawingAction(drawing, action);
      if (!result.ok) {
        return result;
      }

      const currentRevision = accessors.getRevision(room);
      const nextRoom = accessors.setRevision(
        accessors.replaceDrawing(room, target, result.data),
        currentRevision === undefined ? undefined : currentRevision + 1,
      );

      return {
        ok: true,
        data: {
          room: nextRoom,
          drawing: result.data,
          revision: result.data.revision,
        },
      };
    },

    applyRemoteEvent({ room, target, event }) {
      if (!room || accessors.getCode(room) !== event.code) {
        return { room, status: 'ignored-stale' };
      }

      const drawing = accessors.getDrawing(room, target);
      if (!drawing) {
        return { room, status: 'ignored-stale' };
      }

      const result = applyRemoteDrawingEvent(drawing, event);
      if (result.status !== 'applied') {
        return { room, status: result.status };
      }

      const nextRevision = event.stateRevision ?? incrementRevision(accessors.getRevision(room));
      const nextRoom = accessors.setRevision(accessors.replaceDrawing(room, target, result.state), nextRevision);
      return { room: nextRoom, status: 'applied' };
    },

    mergeSnapshot({ current, incoming }) {
      if (!current || accessors.getCode(current) !== accessors.getCode(incoming)) {
        return incoming;
      }

      const currentRevision = accessors.getRevision(current);
      const incomingRevision = accessors.getRevision(incoming);
      if (currentRevision !== undefined && incomingRevision !== undefined && currentRevision > incomingRevision) {
        return current;
      }

      let nextRoom = incoming;
      for (const target of ['lobby', 'match'] as const) {
        const currentDrawing = accessors.getDrawing(current, target);
        const incomingDrawing = accessors.getDrawing(incoming, target);
        if (!currentDrawing || !incomingDrawing || currentDrawing.revision <= incomingDrawing.revision) {
          continue;
        }

        if (accessors.shouldPreserveDrawing?.({ current, incoming, target, currentDrawing, incomingDrawing }) ?? true) {
          nextRoom = accessors.replaceDrawing(nextRoom, target, currentDrawing);
        }
      }

      return nextRoom;
    },
  };
}

function incrementRevision(revision: number | undefined): number | undefined {
  return revision === undefined ? undefined : revision + 1;
}
