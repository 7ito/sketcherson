import { useCallback, useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { soundEffects } from '../lib/soundEffects';
import { useRoomAudio } from '../lib/roomAudio';
import { useUserSettings } from '../lib/userSettings';
import { useRoomSession } from '../providers/RoomSessionProvider';
import { useRoomPageController } from '../room-page-controller/useRoomPageController';
import { JoinRoomPanel } from './room-page/JoinRoomPanel';
import { LobbyView } from './room-page/LobbyView';
import { MatchView } from './room-page/MatchView';
import { PostgameView } from './room-page/PostgameView';
import { CenteredRoomStatus, RoomPageFrame } from './room-page/RoomShell';
import { SettingsModal } from './room-page/UserSettingsModal';

export function RoomPage() {
  const params = useParams();
  const controller = useRoomPageController({ codeParam: params.code, roomSession: useRoomSession() });
  const { code, connectionNotice, screen } = controller;
  const joinedScreen = screen.kind === 'lobby' || screen.kind === 'match' || screen.kind === 'postgame' ? screen : null;

  useRoomAudio(joinedScreen?.room ?? null, joinedScreen?.currentPlayerId ?? null);

  const [userSettings] = useUserSettings();
  const userSettingsDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    soundEffects.setVolume(userSettings.volume / 100);
  }, [userSettings.volume]);

  const openSettings = useCallback(() => {
    userSettingsDialogRef.current?.showModal();
  }, []);

  const closeSettings = useCallback(() => {
    userSettingsDialogRef.current?.close();
  }, []);

  if (screen.kind === 'loading') {
    return (
      <RoomPageFrame width="narrow" connectionNotice={connectionNotice}>
        <CenteredRoomStatus eyebrow="Checking room" title="Loading room…" />
      </RoomPageFrame>
    );
  }

  if (screen.kind === 'recovery-failed') {
    return (
      <RoomPageFrame width="narrow" connectionNotice={connectionNotice} noticePlacement="below">
        <CenteredRoomStatus
          eyebrow="Session recovery failed"
          title="Session could not be restored"
          subtitle={screen.message}
          action={
            <Link className="secondary-button inline-link status-action-link" to="/">
              Back to room entry
            </Link>
          }
        />
      </RoomPageFrame>
    );
  }

  if (screen.kind === 'removed') {
    return (
      <RoomPageFrame width="narrow" connectionNotice={connectionNotice}>
        <CenteredRoomStatus
          eyebrow="Removed from room"
          title="You were kicked from this room"
          subtitle={screen.message}
          action={
            <Link className="secondary-button inline-link" to="/">
              Back to room entry
            </Link>
          }
        />
      </RoomPageFrame>
    );
  }

  if (screen.kind === 'not-found') {
    return (
      <RoomPageFrame width="narrow" connectionNotice={connectionNotice} noticePlacement="below">
        <CenteredRoomStatus
          eyebrow="Room unavailable"
          title="Room not found"
          subtitle="This room link is no longer active. It may have expired, or the server may have restarted and cleared in-memory rooms."
          action={
            <Link className="secondary-button inline-link status-action-link" to="/">
              Back to room entry
            </Link>
          }
        />
      </RoomPageFrame>
    );
  }

  if (screen.kind === 'match') {
    return (
      <>
        <SettingsModal dialogRef={userSettingsDialogRef} onClose={closeSettings} />
        <MatchView
          room={screen.room}
          currentPlayerId={screen.currentPlayerId}
          connectionNotice={connectionNotice}
          onPause={screen.actions.pauseGame}
          onResume={screen.actions.resumeGame}
          onRestart={screen.actions.restartGame}
          onReroll={screen.actions.rerollPrompt}
          onKickPlayer={screen.actions.removePlayer}
          onSubmitDrawingAction={screen.actions.submitDrawingAction}
          onSubmitMessage={screen.actions.submitMessage}
          onOpenSettings={openSettings}
        />
      </>
    );
  }

  if (screen.kind === 'lobby') {
    return (
      <>
        <SettingsModal dialogRef={userSettingsDialogRef} onClose={closeSettings} />
        <LobbyView
          room={screen.room}
          currentPlayerId={screen.currentPlayerId}
          connectionNotice={connectionNotice}
          onSaveSettings={screen.actions.saveSettings}
          onStart={screen.actions.startGame}
          onKickPlayer={screen.actions.removePlayer}
          onSubmitLobbyDrawingAction={screen.actions.submitLobbyDrawingAction}
          onSubmitMessage={screen.actions.submitMessage}
          onOpenSettings={openSettings}
        />
      </>
    );
  }

  if (screen.kind === 'postgame') {
    return (
      <>
        <SettingsModal dialogRef={userSettingsDialogRef} onClose={closeSettings} />
        <PostgameView
          room={screen.room}
          currentPlayerId={screen.currentPlayerId}
          connectionNotice={connectionNotice}
          onSaveSettings={screen.actions.saveSettings}
          onPlayAgain={screen.actions.playAgain}
          onKickPlayer={screen.actions.removePlayer}
          onSubmitMessage={screen.actions.submitMessage}
          onOpenSettings={openSettings}
        />
      </>
    );
  }

  return (
    <RoomPageFrame width="narrow" connectionNotice={connectionNotice} noticePlacement="below">
      <JoinRoomPanel
        roomCode={code}
        roomStatus={screen.room?.status}
        joinNickname={screen.join.nickname}
        joinError={screen.join.error}
        isJoining={screen.join.isJoining}
        onChangeNickname={screen.join.setNickname}
        onJoin={screen.join.submit}
      />
    </RoomPageFrame>
  );
}
