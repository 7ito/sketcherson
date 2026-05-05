import type { ApiResult, CreateRoomSuccess, DrawingActionSuccess, JoinRoomSuccess, KickPlayerSuccess, LobbyDrawingActionSuccess, LobbySettings, PauseRoomSuccess, ReclaimRoomSuccess, RestartRoomSuccess, ResumeRoomSuccess, RoomState, RoomStateSuccess, RerollTurnSuccess, StartRoomSuccess, SubmitMessageSuccess, UpdateLobbySettingsSuccess } from '@7ito/sketcherson-common/room';
import type { DrawingAction, DrawingState } from '@7ito/sketcherson-common/drawing';
import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import {
  createBrowserJoinedSessionStore,
  createPreferredNicknameStore,
  createRoomClient,
  createSocketRoomDrawingTransport,
  createSocketRoomTransport,
  type ConnectionNotice,
  type JoinedSession,
  type RoomClient,
  type RoomExitNotice,
  type SessionRecoveryError,
} from '../client-room-runtime';
import { JOINED_SESSION_STORAGE_KEY } from '../lib/gameKeys';
import { writePreferredNickname } from '../lib/preferredNickname';
import { drawingSocket, socket } from '../lib/socket';

export type { ConnectionNotice, JoinedSession, RoomExitNotice, SessionRecoveryError } from '../client-room-runtime';

export interface RoomSessionContextValue {
  activeRoom: RoomState | null;
  joinedSession: JoinedSession | null;
  sessionRecoveryError: SessionRecoveryError | null;
  roomExitNotice: RoomExitNotice | null;
  connectionNotice?: ConnectionNotice | null;
  createRoom: (nickname: string) => Promise<ApiResult<CreateRoomSuccess>>;
  joinRoom: (code: string, nickname: string) => Promise<ApiResult<JoinRoomSuccess>>;
  reclaimStoredSession: (code: string) => Promise<ApiResult<ReclaimRoomSuccess> | null>;
  lookupRoom: (code: string) => Promise<ApiResult<RoomStateSuccess>>;
  updateLobbySettings: (code: string, settings: LobbySettings) => Promise<ApiResult<UpdateLobbySettingsSuccess>>;
  startRoom: (code: string) => Promise<ApiResult<StartRoomSuccess>>;
  pauseRoom: (code: string) => Promise<ApiResult<PauseRoomSuccess>>;
  resumeRoom: (code: string) => Promise<ApiResult<ResumeRoomSuccess>>;
  restartRoom: (code: string) => Promise<ApiResult<RestartRoomSuccess>>;
  kickPlayer: (code: string, playerId: string) => Promise<ApiResult<KickPlayerSuccess>>;
  rerollTurn: (code: string) => Promise<ApiResult<RerollTurnSuccess>>;
  submitDrawingAction: (code: string, action: DrawingAction) => Promise<ApiResult<DrawingActionSuccess>>;
  submitLobbyDrawingAction: (code: string, action: DrawingAction) => Promise<ApiResult<LobbyDrawingActionSuccess>>;
  submitRoomMessage: (code: string, text: string) => Promise<ApiResult<SubmitMessageSuccess>>;
}

interface RoomDrawingContextValue {
  lobbyDrawing: DrawingState | null;
  matchDrawing: DrawingState | null;
}

export const RoomSessionContext = createContext<RoomSessionContextValue | null>(null);
export const RoomDrawingContext = createContext<RoomDrawingContextValue | null>(null);

let defaultRoomClient: RoomClient | null = null;
let defaultRoomClientDestroyTimer: ReturnType<typeof setTimeout> | null = null;

function createDefaultRoomClient(): RoomClient {
  return createRoomClient({
    transport: createSocketRoomTransport(socket),
    drawingTransport: createSocketRoomDrawingTransport(drawingSocket),
    joinedSessionStore: createBrowserJoinedSessionStore(JOINED_SESSION_STORAGE_KEY),
    preferredNicknameStore: createPreferredNicknameStore(writePreferredNickname),
  });
}

function getDefaultRoomClient(): RoomClient {
  if (defaultRoomClientDestroyTimer) {
    clearTimeout(defaultRoomClientDestroyTimer);
    defaultRoomClientDestroyTimer = null;
  }

  defaultRoomClient ??= createDefaultRoomClient();
  return defaultRoomClient;
}

function retainDefaultRoomClient(client: RoomClient): void {
  if (defaultRoomClient !== client || !defaultRoomClientDestroyTimer) {
    return;
  }

  clearTimeout(defaultRoomClientDestroyTimer);
  defaultRoomClientDestroyTimer = null;
}

function releaseDefaultRoomClient(client: RoomClient): void {
  if (defaultRoomClient !== client) {
    return;
  }

  if (defaultRoomClientDestroyTimer) {
    clearTimeout(defaultRoomClientDestroyTimer);
  }

  defaultRoomClientDestroyTimer = setTimeout(() => {
    if (defaultRoomClient === client) {
      client.destroy();
      defaultRoomClient = null;
    }

    defaultRoomClientDestroyTimer = null;
  }, 0);
}

export function RoomSessionProvider({ children }: { children: ReactNode }): ReactNode {
  const clientRef = useRef<RoomClient | null>(null);

  if (!clientRef.current) {
    clientRef.current = getDefaultRoomClient();
  }

  const client = clientRef.current;
  const snapshot = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);

  useEffect(() => {
    retainDefaultRoomClient(client);

    return () => {
      releaseDefaultRoomClient(client);
      clientRef.current = null;
    };
  }, [client]);

  const value = useMemo<RoomSessionContextValue>(
    () => ({
      activeRoom: snapshot.activeRoom,
      joinedSession: snapshot.joinedSession,
      sessionRecoveryError: snapshot.sessionRecoveryError,
      roomExitNotice: snapshot.roomExitNotice,
      connectionNotice: snapshot.connectionNotice,
      createRoom: client.createRoom,
      joinRoom: client.joinRoom,
      reclaimStoredSession: client.reclaimStoredSession,
      lookupRoom: client.lookupRoom,
      updateLobbySettings: client.updateLobbySettings,
      startRoom: client.startRoom,
      pauseRoom: client.pauseRoom,
      resumeRoom: client.resumeRoom,
      restartRoom: client.restartRoom,
      kickPlayer: client.kickPlayer,
      rerollTurn: client.rerollTurn,
      submitDrawingAction: client.submitDrawingAction,
      submitLobbyDrawingAction: client.submitLobbyDrawingAction,
      submitRoomMessage: client.submitRoomMessage,
    }),
    [client, snapshot],
  );

  const drawingValue = useMemo<RoomDrawingContextValue>(
    () => ({
      lobbyDrawing: snapshot.lobbyDrawing,
      matchDrawing: snapshot.matchDrawing,
    }),
    [snapshot.lobbyDrawing, snapshot.matchDrawing],
  );

  return (
    <RoomSessionContext.Provider value={value}>
      <RoomDrawingContext.Provider value={drawingValue}>{children}</RoomDrawingContext.Provider>
    </RoomSessionContext.Provider>
  );
}

export function useRoomSession(): RoomSessionContextValue {
  const context = useContext(RoomSessionContext);

  if (!context) {
    throw new Error('useRoomSession must be used within a RoomSessionProvider');
  }

  return context;
}

export function useRoomDrawing(target: 'match' | 'lobby', fallbackRoom?: RoomState | null): DrawingState | null {
  const context = useContext(RoomDrawingContext);

  if (!context) {
    return target === 'lobby' ? fallbackRoom?.lobbyDrawing ?? null : fallbackRoom?.match?.currentTurn?.drawing ?? null;
  }

  return target === 'lobby' ? context.lobbyDrawing : context.matchDrawing;
}
