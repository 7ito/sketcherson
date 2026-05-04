import type { ApiError, ApiResult, CreateRoomSuccess, JoinRoomSuccess, KickPlayerSuccess, PauseRoomSuccess, ReclaimRoomSuccess, ResumeRoomSuccess, RoomState, RoomStateSuccess, RerollTurnSuccess, StartRoomSuccess, SubmitMessageSuccess, UpdateLobbySettingsSuccess } from '@7ito/sketcherson-common/room';
import type { DrawingActionAppliedEvent } from '@7ito/sketcherson-common/drawing';
import type { RoomClientEventName, RoomRequest, RoomResponse } from '@7ito/sketcherson-common/roomEvents';
import {
  estimateSerializedPayloadBytes,
  recordDrawingAck,
  recordDrawingResync,
  recordRemoteDrawingEventReceived,
} from '../lib/drawingMetrics';
import { createRoomDrawingSync, type RoomDrawingView } from './RoomDrawingSync';
import type { RoomTransport, RoomTransportUnsubscribe } from './RoomTransport';
import type { JoinedSessionStore, PreferredNicknameStore } from './sessionStores';
import type { JoinedSession, RoomClient, RoomClientSnapshot } from './types';

type SessionActionSuccess = CreateRoomSuccess | JoinRoomSuccess | ReclaimRoomSuccess;
type RoomMutationSuccess =
  | UpdateLobbySettingsSuccess
  | StartRoomSuccess
  | PauseRoomSuccess
  | ResumeRoomSuccess
  | KickPlayerSuccess
  | RerollTurnSuccess
  | SubmitMessageSuccess;

type RoomMutationEventName = {
  [E in RoomClientEventName]: RoomResponse<E> extends ApiResult<RoomMutationSuccess> ? E : never;
}[RoomClientEventName];

export interface CreateRoomClientOptions {
  transport: RoomTransport;
  joinedSessionStore: JoinedSessionStore;
  preferredNicknameStore: PreferredNicknameStore;
}

const INITIAL_SNAPSHOT: RoomClientSnapshot = {
  activeRoom: null,
  joinedSession: null,
  sessionRecoveryError: null,
  roomExitNotice: null,
  connectionNotice: null,
  lobbyDrawing: null,
  matchDrawing: null,
};

export function createRoomClient(options: CreateRoomClientOptions): RoomClient {
  const { transport, joinedSessionStore, preferredNicknameStore } = options;
  const listeners = new Set<() => void>();
  const unsubscribeCallbacks: RoomTransportUnsubscribe[] = [];
  const resyncingRoomCodes = new Set<string>();
  const drawingSync = createRoomDrawingSync();
  let activeRoomRef: RoomState | null = null;
  let snapshot: RoomClientSnapshot = {
    ...INITIAL_SNAPSHOT,
    joinedSession: joinedSessionStore.read(),
  };

  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  const setSnapshot = (nextSnapshot: RoomClientSnapshot) => {
    snapshot = nextSnapshot;
    notify();
  };

  const patchSnapshot = (patch: Partial<RoomClientSnapshot>) => {
    setSnapshot({
      ...snapshot,
      ...patch,
    });
  };

  const persistJoinedSession = (session: JoinedSession | null) => {
    joinedSessionStore.write(session);
    patchSnapshot({ joinedSession: session });
  };

  const patchRoomDrawingView = (view: RoomDrawingView) => {
    activeRoomRef = view.room;
    patchSnapshot({
      activeRoom: view.room,
      lobbyDrawing: view.drawings.lobby,
      matchDrawing: view.drawings.match,
    });
  };

  const applyRoomSnapshot = (roomState: RoomState | null) => {
    patchRoomDrawingView(drawingSync.bindRoom(roomState));
  };

  const applyDrawingSnapshot = (view: RoomDrawingView, target: 'match' | 'lobby') => {
    activeRoomRef = view.room;

    if (target === 'lobby') {
      patchSnapshot({ lobbyDrawing: view.drawings.lobby });
      return;
    }

    patchSnapshot({ matchDrawing: view.drawings.match });
  };

  const clearRecoveredRoomState = (roomCode: string) => {
    patchSnapshot({
      sessionRecoveryError: snapshot.sessionRecoveryError?.roomCode === roomCode ? null : snapshot.sessionRecoveryError,
      roomExitNotice: snapshot.roomExitNotice?.roomCode === roomCode ? null : snapshot.roomExitNotice,
    });
  };

  const buildJoinedSession = (data: SessionActionSuccess, fallbackNickname: string): JoinedSession => ({
    playerId: data.playerId,
    roomCode: data.room.code,
    nickname: data.room.players.find((player) => player.id === data.playerId)?.nickname ?? fallbackNickname,
    sessionToken: data.sessionToken,
  });

  const applyJoinedSessionResult = (data: SessionActionSuccess, fallbackNickname: string) => {
    const nextSession = buildJoinedSession(data, fallbackNickname);
    joinedSessionStore.write(nextSession);
    preferredNicknameStore.write(nextSession.nickname);
    const view = drawingSync.applySnapshot(data.room);
    activeRoomRef = view.room;
    setSnapshot({
      ...snapshot,
      joinedSession: nextSession,
      sessionRecoveryError: null,
      roomExitNotice: null,
      activeRoom: view.room,
      lobbyDrawing: view.drawings.lobby,
      matchDrawing: view.drawings.match,
    });
  };

  const applyRoomMutationResult = (roomCode: string, data: RoomMutationSuccess) => {
    const nextRecoveryError = snapshot.sessionRecoveryError?.roomCode === roomCode ? null : snapshot.sessionRecoveryError;
    const nextExitNotice = snapshot.roomExitNotice?.roomCode === roomCode ? null : snapshot.roomExitNotice;

    if (activeRoomRef?.code && activeRoomRef.code !== roomCode) {
      patchSnapshot({
        sessionRecoveryError: nextRecoveryError,
        roomExitNotice: nextExitNotice,
      });
      return;
    }

    const view = drawingSync.applySnapshot(data.room);
    activeRoomRef = view.room;
    setSnapshot({
      ...snapshot,
      sessionRecoveryError: nextRecoveryError,
      roomExitNotice: nextExitNotice,
      activeRoom: view.room,
      lobbyDrawing: view.drawings.lobby,
      matchDrawing: view.drawings.match,
    });
  };

  const queueRoomResync = (roomCode: string) => {
    if (resyncingRoomCodes.has(roomCode)) {
      return;
    }

    resyncingRoomCodes.add(roomCode);

    void transport.emitWithAck('room:getState', { code: roomCode })
      .then((result) => {
        if (!result.ok) {
          return;
        }

        if (activeRoomRef?.code !== roomCode) {
          return;
        }

        patchRoomDrawingView(drawingSync.applySnapshot(result.data.room));
      })
      .finally(() => {
        resyncingRoomCodes.delete(roomCode);
      });
  };

  const reclaimSession = async (session: JoinedSession): Promise<ApiResult<ReclaimRoomSuccess>> => {
    const result = await transport.emitWithAck('room:reclaim', {
      code: session.roomCode,
      sessionToken: session.sessionToken,
    });

    if (result.ok) {
      applyJoinedSessionResult(result.data, session.nickname);
      return result;
    }

    joinedSessionStore.write(null);
    const shouldClearActiveRoom = activeRoomRef?.code === session.roomCode;
    activeRoomRef = shouldClearActiveRoom ? null : activeRoomRef;
    drawingSync.bindRoom(activeRoomRef);
    setSnapshot({
      ...snapshot,
      joinedSession: null,
      activeRoom: shouldClearActiveRoom ? null : snapshot.activeRoom,
      lobbyDrawing: shouldClearActiveRoom ? null : snapshot.lobbyDrawing,
      matchDrawing: shouldClearActiveRoom ? null : snapshot.matchDrawing,
      sessionRecoveryError: {
        roomCode: session.roomCode,
        message: buildRecoveryMessage(session.roomCode, result.error),
      },
    });
    return result;
  };

  const runRoomMutation = async <E extends RoomMutationEventName>(
    event: E,
    payload: RoomRequest<E>,
    roomCode: string,
  ): Promise<RoomResponse<E>> => {
    const result = await transport.emitWithAck(event, payload);

    if (result.ok) {
      applyRoomMutationResult(roomCode, result.data as RoomMutationSuccess);
    }

    return result;
  };

  const handleRoomState = (roomState: RoomState) => {
    if (activeRoomRef && activeRoomRef.code !== roomState.code) {
      return;
    }

    patchRoomDrawingView(drawingSync.applySnapshot(roomState));
  };

  const handleRoomKicked = (payload: { roomCode: string; message: string }) => {
    const storedSession = joinedSessionStore.read();
    if (storedSession?.roomCode === payload.roomCode) {
      joinedSessionStore.write(null);
    }

    const shouldClearActiveRoom = activeRoomRef?.code === payload.roomCode;
    activeRoomRef = shouldClearActiveRoom ? null : activeRoomRef;
    drawingSync.bindRoom(activeRoomRef);
    setSnapshot({
      ...snapshot,
      joinedSession: storedSession?.roomCode === payload.roomCode ? null : snapshot.joinedSession,
      activeRoom: shouldClearActiveRoom ? null : snapshot.activeRoom,
      lobbyDrawing: shouldClearActiveRoom ? null : snapshot.lobbyDrawing,
      matchDrawing: shouldClearActiveRoom ? null : snapshot.matchDrawing,
      roomExitNotice: payload,
      sessionRecoveryError: snapshot.sessionRecoveryError?.roomCode === payload.roomCode ? null : snapshot.sessionRecoveryError,
    });
  };

  const handleDrawingActionApplied = (payload: DrawingActionAppliedEvent, target: 'match' | 'lobby') => {
    recordRemoteDrawingEventReceived({
      roomCode: payload.code,
      target,
      revision: payload.revision,
      payloadBytes: estimateSerializedPayloadBytes(payload),
    });

    const result = drawingSync.applyEvent(target, payload);
    applyDrawingSnapshot(result.view, target);

    if (result.status === 'requires-resync') {
      recordDrawingResync({
        roomCode: payload.code,
        target,
        revision: payload.revision,
        reason: 'revision_mismatch',
      });
      queueRoomResync(payload.code);
    }
  };

  const handleConnect = () => {
    patchSnapshot({ connectionNotice: null });

    const currentSession = snapshot.joinedSession;
    if (!currentSession || activeRoomRef?.code !== currentSession.roomCode) {
      return;
    }

    void reclaimSession(currentSession);
  };

  const handleDisconnect = (reason: string) => {
    if (reason === 'io client disconnect') {
      patchSnapshot({ connectionNotice: null });
      return;
    }

    patchSnapshot({
      connectionNotice: {
        state: 'reconnecting',
        message:
          'Connection to the game server was lost. Trying to reconnect. If the server restarted, active rooms may no longer be available.',
      },
    });
  };

  const handleConnectError = () => {
    patchSnapshot({
      connectionNotice: {
        state: 'offline',
        message:
          'Could not reach the game server. Retrying automatically. If the server restarted, previously active rooms may no longer exist.',
      },
    });
  };

  unsubscribeCallbacks.push(
    transport.on('room:state', handleRoomState),
    transport.on('room:kicked', handleRoomKicked),
    transport.on('room:drawingActionApplied', (payload) => handleDrawingActionApplied(payload, 'match')),
    transport.on('room:lobbyDrawingActionApplied', (payload) => handleDrawingActionApplied(payload, 'lobby')),
    transport.onConnectionEvent('connect', handleConnect),
    transport.onConnectionEvent('disconnect', handleDisconnect),
    transport.onConnectionEvent('connect_error', handleConnectError),
  );

  return {
    getSnapshot() {
      return snapshot;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async createRoom(nickname) {
      const result = await transport.emitWithAck('room:create', { nickname });

      if (result.ok) {
        applyJoinedSessionResult(result.data, nickname);
      }

      return result;
    },
    async joinRoom(code, nickname) {
      const result = await transport.emitWithAck('room:join', {
        code,
        nickname,
      });

      if (result.ok) {
        applyJoinedSessionResult(result.data, nickname);
      }

      return result;
    },
    async reclaimStoredSession(code) {
      const storedSession = joinedSessionStore.read();
      if (!storedSession || storedSession.roomCode !== code) {
        return null;
      }

      return reclaimSession(storedSession);
    },
    async lookupRoom(code) {
      return transport.emitWithAck('room:getState', { code });
    },
    async updateLobbySettings(code, settings) {
      return runRoomMutation('room:updateSettings', { code, settings }, code);
    },
    async startRoom(code) {
      return runRoomMutation('room:start', { code }, code);
    },
    async pauseRoom(code) {
      return runRoomMutation('room:pause', { code }, code);
    },
    async resumeRoom(code) {
      return runRoomMutation('room:resume', { code }, code);
    },
    async kickPlayer(code, playerId) {
      return runRoomMutation('room:kick', { code, playerId }, code);
    },
    async rerollTurn(code) {
      return runRoomMutation('room:reroll', { code }, code);
    },
    async submitDrawingAction(code, action) {
      const result = await transport.emitWithAck('room:drawingAction', {
        code,
        action,
      });

      recordDrawingAck({
        roomCode: code,
        target: 'match',
        actionType: action.type,
        ok: result.ok,
        ackBytes: estimateSerializedPayloadBytes(result),
        revision: result.ok ? result.data.revision : undefined,
      });

      if (!result.ok && action.type === 'endStroke') {
        recordDrawingResync({ roomCode: code, target: 'match', reason: 'action_rejected' });
        queueRoomResync(code);
      }

      return result;
    },
    async submitLobbyDrawingAction(code, action) {
      const result = await transport.emitWithAck('room:lobbyDrawingAction', { code, action });

      recordDrawingAck({
        roomCode: code,
        target: 'lobby',
        actionType: action.type,
        ok: result.ok,
        ackBytes: estimateSerializedPayloadBytes(result),
        revision: result.ok ? result.data.revision : undefined,
      });

      if (!result.ok && action.type === 'endStroke') {
        recordDrawingResync({ roomCode: code, target: 'lobby', reason: 'action_rejected' });
        queueRoomResync(code);
      }

      return result;
    },
    async submitRoomMessage(code, text) {
      return runRoomMutation('room:submitMessage', { code, text }, code);
    },
    destroy() {
      for (const unsubscribe of unsubscribeCallbacks) {
        unsubscribe();
      }
      unsubscribeCallbacks.length = 0;
      listeners.clear();
      resyncingRoomCodes.clear();
    },
  };
}

function buildRecoveryMessage(code: string, error: ApiError): string {
  if (error.code === 'ROOM_NOT_FOUND') {
    return 'Your previous room session could not be restored. The room may have expired or the server may have restarted.';
  }

  if (error.code === 'SESSION_EXPIRED') {
    return 'Your reserved seat expired before you reconnected. Join again if the room is still active.';
  }

  return `Could not restore your room session for ${code}. ${error.message}`;
}

