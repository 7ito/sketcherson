import { normalizeRoomCode, type ApiResult, type DrawingActionSuccess, type LobbyDrawingActionSuccess, type LobbySettings, type RoomState } from '@7ito/sketcherson-common/room';
import type { DrawingAction } from '@7ito/sketcherson-common/drawing';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { readPreferredNickname } from '../lib/preferredNickname';
import type { RoomSessionContextValue } from '../providers/RoomSessionProvider';

export interface RoomPageActions {
  saveSettings(settings: LobbySettings): Promise<string | null>;
  startGame(): Promise<string | null>;
  playAgain(): Promise<string | null>;
  pauseGame(): Promise<string | null>;
  resumeGame(): Promise<string | null>;
  restartGame(): Promise<string | null>;
  rerollPrompt(): Promise<string | null>;
  removePlayer(playerId: string): Promise<string | null>;
  submitMessage(text: string): Promise<string | null>;
  submitDrawingAction(action: DrawingAction): Promise<ApiResult<DrawingActionSuccess>>;
  submitLobbyDrawingAction(action: DrawingAction): Promise<ApiResult<LobbyDrawingActionSuccess>>;
}

export interface JoinRoomModel {
  nickname: string;
  error: string;
  isJoining: boolean;
  setNickname(nickname: string): void;
  submit(event?: FormEvent<HTMLFormElement>): Promise<void>;
}

export type RoomPageScreen =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'recovery-failed'; message: string }
  | { kind: 'removed'; message: string }
  | { kind: 'join'; room: RoomState | null; join: JoinRoomModel }
  | { kind: 'lobby'; room: RoomState; currentPlayerId: string; actions: RoomPageActions }
  | { kind: 'match'; room: RoomState; currentPlayerId: string; actions: RoomPageActions }
  | { kind: 'postgame'; room: RoomState; currentPlayerId: string; actions: RoomPageActions };

export interface RoomPageController {
  code: string;
  connectionNotice: RoomSessionContextValue['connectionNotice'];
  screen: RoomPageScreen;
}

interface UseRoomPageControllerOptions {
  codeParam: string | undefined;
  roomSession: RoomSessionContextValue;
}

function resolveActionError<T>(result: ApiResult<T>): string | null {
  return result.ok ? null : result.error.message;
}

function toErrorMessageAction<T>(action: () => Promise<ApiResult<T>>): () => Promise<string | null> {
  return async () => resolveActionError(await action());
}

function toErrorMessageActionWithArg<TArg, TResult>(
  action: (value: TArg) => Promise<ApiResult<TResult>>,
): (value: TArg) => Promise<string | null> {
  return async (value) => resolveActionError(await action(value));
}

export function useRoomPageController({ codeParam, roomSession }: UseRoomPageControllerOptions): RoomPageController {
  const code = useMemo(() => normalizeRoomCode(codeParam ?? ''), [codeParam]);
  const {
    activeRoom,
    joinedSession,
    joinRoom,
    kickPlayer,
    connectionNotice,
    lookupRoom,
    pauseRoom,
    reclaimStoredSession,
    restartRoom,
    resumeRoom,
    rerollTurn,
    roomExitNotice,
    sessionRecoveryError,
    startRoom,
    submitDrawingAction,
    submitLobbyDrawingAction,
    submitRoomMessage,
    updateLobbySettings,
  } = roomSession;
  const [lookupState, setLookupState] = useState<'loading' | 'ready' | 'not-found' | 'recovery-failed' | 'removed'>('loading');
  const [lookedUpRoom, setLookedUpRoom] = useState<RoomState | null>(null);
  const [joinNickname, setJoinNickname] = useState(() => readPreferredNickname() ?? joinedSession?.nickname ?? '');
  const [joinError, setJoinError] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const currentPlayerId = joinedSession?.roomCode === code ? joinedSession.playerId : null;
  const joinedActiveRoom = currentPlayerId && activeRoom?.code === code ? activeRoom : null;

  const actions = useMemo<RoomPageActions>(
    () => ({
      saveSettings: toErrorMessageActionWithArg((settings: LobbySettings) => updateLobbySettings(code, settings)),
      startGame: toErrorMessageAction(() => startRoom(code)),
      playAgain: toErrorMessageAction(() => startRoom(code)),
      pauseGame: toErrorMessageAction(() => pauseRoom(code)),
      resumeGame: toErrorMessageAction(() => resumeRoom(code)),
      restartGame: toErrorMessageAction(() => restartRoom(code)),
      rerollPrompt: toErrorMessageAction(() => rerollTurn(code)),
      removePlayer: toErrorMessageActionWithArg((playerId: string) => kickPlayer(code, playerId)),
      submitMessage: toErrorMessageActionWithArg((text: string) => submitRoomMessage(code, text)),
      submitDrawingAction: (action) => submitDrawingAction(code, action),
      submitLobbyDrawingAction: (action) => submitLobbyDrawingAction(code, action),
    }),
    [code, kickPlayer, pauseRoom, rerollTurn, restartRoom, resumeRoom, startRoom, submitDrawingAction, submitLobbyDrawingAction, submitRoomMessage, updateLobbySettings],
  );

  useEffect(() => {
    if (roomExitNotice?.roomCode === code) {
      setLookedUpRoom(null);
      setLookupState('removed');
      return;
    }

    if (sessionRecoveryError?.roomCode === code) {
      setLookedUpRoom(null);
      setLookupState('recovery-failed');
    }
  }, [code, roomExitNotice, sessionRecoveryError]);

  useEffect(() => {
    if (!code) {
      setLookedUpRoom(null);
      setLookupState('not-found');
      return;
    }

    if (roomExitNotice?.roomCode === code) {
      setLookedUpRoom(null);
      setLookupState('removed');
      return;
    }

    if (sessionRecoveryError?.roomCode === code) {
      setLookedUpRoom(null);
      setLookupState('recovery-failed');
      return;
    }

    if (joinedSession?.roomCode === code && activeRoom?.code === code) {
      setLookedUpRoom(activeRoom);
      setLookupState('ready');
      return;
    }

    let cancelled = false;

    const loadRoom = async () => {
      const reclaimResult = await reclaimStoredSession(code);
      if (cancelled) return;

      if (reclaimResult?.ok) {
        setLookedUpRoom(reclaimResult.data.room);
        setLookupState('ready');
        return;
      }

      if (reclaimResult && !reclaimResult.ok) {
        setLookedUpRoom(null);
        setLookupState('recovery-failed');
        return;
      }

      const lookupResult = await lookupRoom(code);
      if (cancelled) return;

      if (lookupResult.ok) {
        setLookedUpRoom(lookupResult.data.room);
        setLookupState('ready');
        return;
      }

      setLookedUpRoom(null);
      setLookupState('not-found');
    };

    void loadRoom();

    return () => {
      cancelled = true;
    };
  }, [activeRoom, code, joinedSession?.roomCode, lookupRoom, reclaimStoredSession, roomExitNotice, sessionRecoveryError]);

  const join: JoinRoomModel = useMemo(
    () => ({
      nickname: joinNickname,
      error: joinError,
      isJoining,
      setNickname: setJoinNickname,
      submit: async (event) => {
        event?.preventDefault();
        setJoinError('');
        setIsJoining(true);

        const result = await joinRoom(code, joinNickname);
        setIsJoining(false);

        if (!result.ok) {
          setJoinError(result.error.message);
          return;
        }

        setLookedUpRoom(result.data.room);
        setLookupState('ready');
      },
    }),
    [code, isJoining, joinError, joinNickname, joinRoom],
  );

  let screen: RoomPageScreen;
  if (lookupState === 'loading') {
    screen = { kind: 'loading' };
  } else if (lookupState === 'recovery-failed') {
    screen = {
      kind: 'recovery-failed',
      message: sessionRecoveryError?.roomCode === code ? sessionRecoveryError.message : 'Your previous room session could not be restored.',
    };
  } else if (lookupState === 'removed') {
    screen = { kind: 'removed', message: roomExitNotice?.roomCode === code ? roomExitNotice.message : 'The host removed you from the room.' };
  } else if (lookupState === 'not-found') {
    screen = { kind: 'not-found' };
  } else if (joinedActiveRoom && currentPlayerId) {
    if (joinedActiveRoom.status === 'lobby') {
      screen = { kind: 'lobby', room: joinedActiveRoom, currentPlayerId, actions };
    } else if (joinedActiveRoom.status === 'postgame') {
      screen = { kind: 'postgame', room: joinedActiveRoom, currentPlayerId, actions };
    } else {
      screen = { kind: 'match', room: joinedActiveRoom, currentPlayerId, actions };
    }
  } else {
    screen = { kind: 'join', room: lookedUpRoom, join };
  }

  return { code, connectionNotice, screen };
}
