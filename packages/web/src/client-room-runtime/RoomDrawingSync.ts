import type { DrawingActionAppliedEvent, DrawingState } from '@7ito/sketcherson-common/drawing';
import { createDrawingRealtimeCore, type DrawingTarget } from '@7ito/sketcherson-common/drawingRealtime';
import type { RoomState } from '@7ito/sketcherson-common/room';

export interface RoomDrawingView {
  room: RoomState | null;
  drawings: {
    lobby: DrawingState | null;
    match: DrawingState | null;
  };
}

export type RoomDrawingEventStatus = 'applied' | 'ignored-stale' | 'requires-resync';

export interface RoomDrawingSync {
  bindRoom(room: RoomState | null): RoomDrawingView;
  applySnapshot(room: RoomState): RoomDrawingView;
  applyEvent(target: DrawingTarget, event: DrawingActionAppliedEvent): {
    view: RoomDrawingView;
    status: RoomDrawingEventStatus;
  };
}

export function createRoomDrawingSync(): RoomDrawingSync {
  let activeRoom: RoomState | null = null;

  const buildView = (): RoomDrawingView => ({
    room: activeRoom,
    drawings: {
      lobby: drawingRealtimeCoreAccessors.getDrawing(activeRoom, 'lobby'),
      match: drawingRealtimeCoreAccessors.getDrawing(activeRoom, 'match'),
    },
  });

  return {
    bindRoom(room) {
      activeRoom = room;
      return buildView();
    },
    applySnapshot(room) {
      activeRoom = drawingRealtimeCore.mergeSnapshot({ current: activeRoom, incoming: room });
      return buildView();
    },
    applyEvent(target, event) {
      const result = drawingRealtimeCore.applyRemoteEvent({ room: activeRoom, target, event });
      activeRoom = result.room;

      return {
        view: buildView(),
        status: result.status,
      };
    },
  };
}

function areSameMatchTurn(current: RoomState, incoming: RoomState): boolean {
  const currentTurn = current.match?.currentTurn;
  const incomingTurn = incoming.match?.currentTurn;

  if (!currentTurn || !incomingTurn) {
    return false;
  }

  return (
    currentTurn.turnNumber === incomingTurn.turnNumber &&
    currentTurn.totalTurns === incomingTurn.totalTurns &&
    currentTurn.drawerPlayerId === incomingTurn.drawerPlayerId
  );
}

const drawingRealtimeCoreAccessors = {
  getCode(room: RoomState) {
    return room.code;
  },
  getDrawing(room: RoomState | null, target: DrawingTarget) {
    if (!room) {
      return null;
    }

    return target === 'lobby' ? room.lobbyDrawing : room.match?.currentTurn?.drawing ?? null;
  },
  replaceDrawing(room: RoomState, target: DrawingTarget, drawing: DrawingState): RoomState {
    if (target === 'lobby') {
      return {
        ...room,
        lobbyDrawing: drawing,
      };
    }

    if (!room.match?.currentTurn) {
      return room;
    }

    return {
      ...room,
      match: {
        ...room.match,
        currentTurn: {
          ...room.match.currentTurn,
          drawing,
        },
      },
    };
  },
  getRevision(room: RoomState) {
    return room.stateRevision;
  },
  setRevision(room: RoomState, revision: number | undefined): RoomState {
    return {
      ...room,
      stateRevision: revision,
    };
  },
  shouldPreserveDrawing({ current, incoming, target }: { current: RoomState; incoming: RoomState; target: DrawingTarget }) {
    return target === 'lobby' || areSameMatchTurn(current, incoming);
  },
};

const drawingRealtimeCore = createDrawingRealtimeCore<RoomState>(drawingRealtimeCoreAccessors);
