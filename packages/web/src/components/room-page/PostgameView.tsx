import { normalizeLobbySettingsForGame } from '@7ito/sketcherson-common/settings';
import { formatShellCopy } from '@7ito/sketcherson-common/game';
import { MAX_CHAT_MESSAGE_LENGTH, MIN_PLAYERS_TO_START, type CompletedTurnState, type LobbySettings, type RoomState } from '@7ito/sketcherson-common/room';
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GAME_DEFINITION, GAME_WEB_CONFIG } from '../../game';
import { useUserSettings } from '../../lib/userSettings';
import { GameLogo } from '../GameLogo';
import { ShellNotice } from '../ShellNotice';
import {
  buildPlayerAccentMap,
  canHostKickPlayer,
  getPlayerAccentStyle,
  useAutoScrollToBottom,
} from './helpers';
import { legacyChatMessagesToRoomFeed, renderStructuredRoomFeed } from './roomFeed';
import { SharedSettingsFields } from './RoomSettings';
import { SettingsGearButton } from './RoomShell';

const SHELL_ROOM_COPY = GAME_WEB_CONFIG.ui.copy.room;
const SHELL_COMMON_COPY = GAME_WEB_CONFIG.ui.copy.common;
const SHELL_DRAWING_COPY = GAME_WEB_CONFIG.ui.copy.drawing;
const SHELL_POSTGAME_COPY = GAME_WEB_CONFIG.ui.copy.postgame;
const SHELL_SKIN_ICONS = GAME_WEB_CONFIG.ui.skin.tokens.icons;

type PostgameRoundGroup = {
  roundNumber: number;
  turns: CompletedTurnState[];
};

export function groupCompletedTurnsForPostgame(
  turns: CompletedTurnState[],
  configuredRoundCount: number,
): PostgameRoundGroup[] {
  if (turns.length === 0) {
    return [];
  }

  const allTurnsHaveRoundNumbers = turns.every(
    (turn) => Number.isInteger(turn.roundNumber) && (turn.roundNumber ?? 0) > 0,
  );

  if (allTurnsHaveRoundNumbers) {
    const roundsByNumber = new Map<number, CompletedTurnState[]>();

    for (const turn of turns) {
      const roundNumber = turn.roundNumber as number;
      roundsByNumber.set(roundNumber, [...(roundsByNumber.get(roundNumber) ?? []), turn]);
    }

    return Array.from(roundsByNumber.entries())
      .sort(([leftRoundNumber], [rightRoundNumber]) => leftRoundNumber - rightRoundNumber)
      .map(([roundNumber, roundTurns]) => ({ roundNumber, turns: roundTurns }));
  }

  const fallbackRoundCount = Math.max(1, configuredRoundCount);
  const turnsPerRound = Math.max(1, Math.ceil(turns.length / fallbackRoundCount));
  const rounds: PostgameRoundGroup[] = [];

  for (let index = 0; index < turns.length; index += turnsPerRound) {
    rounds.push({
      roundNumber: rounds.length + 1,
      turns: turns.slice(index, index + turnsPerRound),
    });
  }

  return rounds;
}

export function PostgameView({
  room,
  currentPlayerId,
  connectionNotice,
  onSaveSettings,
  onPlayAgain,
  onKickPlayer,
  onSubmitMessage,
  onOpenSettings,
}: {
  room: RoomState;
  currentPlayerId: string;
  connectionNotice: { state: string; message: string } | null | undefined;
  onSaveSettings: (settings: LobbySettings) => Promise<string | null>;
  onPlayAgain: () => Promise<string | null>;
  onKickPlayer: (playerId: string) => Promise<string | null>;
  onSubmitMessage: (text: string) => Promise<string | null>;
  onOpenSettings: () => void;
}) {
  const [userSettings] = useUserSettings();
  const [settingsDraft, setSettingsDraft] = useState(() => normalizeLobbySettingsForGame(GAME_DEFINITION, room.settings));
  const [settingsError, setSettingsError] = useState('');
  const [playAgainError, setPlayAgainError] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [kickError, setKickError] = useState('');
  const [kickingPlayerId, setKickingPlayerId] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState('');
  const [messageError, setMessageError] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const settingsDialogRef = useRef<HTMLDialogElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const matchFeed = room.match ? room.match.feed ?? legacyChatMessagesToRoomFeed(room.match.chatMessages) : [];
  const matchFeedLength = matchFeed.length;
  const { containerRef: chatFeedRef, handleScroll: handleChatFeedScroll } = useAutoScrollToBottom(matchFeedLength);

  const playerAccentColors = useMemo(() => buildPlayerAccentMap(room.players), [room.players]);
  const isViewerHost = room.players.some((player) => player.id === currentPlayerId && player.isHost);
  const connectedPlayerCount = room.players.filter((player) => player.connected).length;
  const canPlayAgain = isViewerHost && connectedPlayerCount >= MIN_PLAYERS_TO_START;

  const winner = room.match?.scoreboard[0] ?? null;
  const winnerCopyParts = SHELL_POSTGAME_COPY.winner.split('{nickname}');

  useEffect(() => {
    setSettingsDraft(normalizeLobbySettingsForGame(GAME_DEFINITION, room.settings));
  }, [room.settings]);

  const autoSaveSettings = useCallback(
    (next: LobbySettings) => {
      setSettingsDraft(next);
      setSettingsError('');

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

      saveTimerRef.current = setTimeout(() => {
        setIsSavingSettings(true);
        void onSaveSettings(next).then((error) => {
          setIsSavingSettings(false);
          if (error) setSettingsError(error);
        });
      }, 400);
    },
    [onSaveSettings],
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const handlePlayAgain = async () => {
    setPlayAgainError('');
    setIsStarting(true);

    const errorMessage = await onPlayAgain();

    setIsStarting(false);

    if (errorMessage) {
      setPlayAgainError(errorMessage);
    }
  };

  const handleKickPlayer = async (playerId: string) => {
    setKickError('');
    setKickingPlayerId(playerId);

    const errorMessage = await onKickPlayer(playerId);

    setKickingPlayerId(null);

    if (errorMessage) {
      setKickError(errorMessage);
    }
  };

  const handleSubmitMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = messageDraft.trim();
    if (!text) return;

    setMessageError('');
    setIsSendingMessage(true);
    setMessageDraft('');

    const errorMessage = await onSubmitMessage(text);

    setIsSendingMessage(false);

    if (errorMessage) {
      setMessageError(errorMessage);
    }
  };

  return (
    <div className="match-screen">
      <div className="topbar">
        <div className="topbar-left">
          <GameLogo className="topbar-logo" />
          <span className="room-tag">{room.code}</span>
        </div>

        <div className="topbar-center">
          {winner ? (
            <span className="postgame-winner-text">
              {winnerCopyParts[0]}
              <span style={getPlayerAccentStyle(winner.playerId, playerAccentColors)}>{winner.nickname}</span>
              {winnerCopyParts.slice(1).join(winner.nickname)}
            </span>
          ) : (
            <span className="postgame-winner-text">{SHELL_POSTGAME_COPY.gameOver}</span>
          )}
        </div>

        <div className="topbar-right">
          <span className="phase-badge phase-reveal">{SHELL_POSTGAME_COPY.postgamePhase}</span>
          {connectionNotice ? (
            <span className={`badge ${connectionNotice.state === 'offline' ? 'warning' : 'subdued'}`}>
              {connectionNotice.state === 'offline' ? SHELL_SKIN_ICONS.disconnected : SHELL_SKIN_ICONS.connected} {connectionNotice.message}
            </span>
          ) : null}
          <SettingsGearButton onClick={onOpenSettings} />
        </div>
      </div>

      <div className="game-body">
        <div className="game-sidebar">
          <div className="sidebar-header sidebar-header-scoreboard">
            {SHELL_ROOM_COPY.finalStandingsHeader}
            <span className="count">{room.match?.scoreboard.length ?? 0}</span>
          </div>

          <div className="sidebar-player-list">
            {room.match?.scoreboard.map((entry, index) => {
              const player = room.players.find((candidate) => candidate.id === entry.playerId);
              const rankClass = index === 0 ? 'sb-rank rank-1' : index === 1 ? 'sb-rank rank-2' : index === 2 ? 'sb-rank rank-3' : 'sb-rank';

              return (
                <div key={entry.playerId} className="sb-player-row">
                  <span className={rankClass}>{index + 1}</span>
                  <div className="sb-info">
                    <div className="sb-name-line">
                      <span className="sb-name" style={getPlayerAccentStyle(entry.playerId, playerAccentColors)}>{entry.nickname}</span>
                      {player?.isHost ? <span className="sb-label label-host">{SHELL_COMMON_COPY.host}</span> : null}
                      {entry.playerId === currentPlayerId ? <span className="sb-label label-correct">{SHELL_POSTGAME_COPY.youLabel}</span> : null}
                      {player && !player.connected ? <span className="sb-label label-reconnecting">{SHELL_SKIN_ICONS.reconnecting}</span> : null}
                    </div>
                  </div>
                  <div className="sb-score-col">
                    <div className="sb-score">{entry.score}</div>
                    {isViewerHost && player && canHostKickPlayer(player, currentPlayerId) ? (
                      <button
                        type="button"
                        className="sb-kick-btn"
                        onClick={() => void handleKickPlayer(player.id)}
                        disabled={kickingPlayerId === player.id}
                      >
                        {SHELL_COMMON_COPY.kick}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          {kickError ? <p className="error-text" style={{ padding: '0 0.5rem 0.5rem', fontSize: '0.75rem' }}>{kickError}</p> : null}

          <div className="postgame-sidebar-actions">
            {playAgainError ? <p className="error-text" style={{ fontSize: '0.75rem' }}>{playAgainError}</p> : null}
            <button type="button" disabled={!canPlayAgain || isStarting} onClick={handlePlayAgain}>
              {isStarting ? SHELL_POSTGAME_COPY.starting : SHELL_ROOM_COPY.playAgainButton}
            </button>
            {!canPlayAgain && isViewerHost ? (
              <p className="helper-text" style={{ fontSize: '0.72rem' }}>{formatShellCopy(SHELL_POSTGAME_COPY.needMorePlayersToRematch, { minPlayers: MIN_PLAYERS_TO_START })}</p>
            ) : null}
            {!isViewerHost ? (
              <p className="helper-text" style={{ fontSize: '0.72rem' }}>{SHELL_POSTGAME_COPY.waitingForHost}</p>
            ) : null}
            {isViewerHost ? (
              <button type="button" className="secondary-button compact-button" onClick={() => settingsDialogRef.current?.showModal()}>
                {SHELL_POSTGAME_COPY.rematchSettings}
              </button>
            ) : null}
          </div>
        </div>

        <div className="postgame-center">
          <div className="postgame-center-header">
            <h1 className="postgame-title">{SHELL_ROOM_COPY.postgameTitle}</h1>
          </div>
          {(() => {
            const turns = room.match?.completedTurns ?? [];
            const rounds = groupCompletedTurnsForPostgame(turns, room.settings.turnsPerPlayer);
            return rounds.map((round) => (
              <div key={round.roundNumber} className="postgame-round-group">
                <h2 className="postgame-round-heading">{formatShellCopy(SHELL_POSTGAME_COPY.roundHeading, { roundNumber: round.roundNumber })}</h2>
                <div className="postgame-gallery-grid">
                  {round.turns.map((turn) => {
                    const drawerColor = playerAccentColors.get(turn.drawerPlayerId) ?? GAME_WEB_CONFIG.ui.theme.colors.mutedText;

                    return (
                      <div key={turn.turnNumber} className="gallery-card">
                        <div className="gallery-card-header" style={{ background: `linear-gradient(135deg, ${drawerColor}22, ${drawerColor}08)`, borderBottom: `2px solid ${drawerColor}33` }}>
                          <span className="gallery-card-title" style={{ color: drawerColor }}>
                            {turn.answer} <span className="gallery-card-by">{formatShellCopy(SHELL_POSTGAME_COPY.galleryByline, { drawerNickname: turn.drawerNickname })}</span>
                          </span>
                          {turn.rerolledFrom ? <span className="badge warning">{SHELL_POSTGAME_COPY.rerolledBadge}</span> : null}
                        </div>
                        <div className="gallery-card-body">
                          {turn.finalImageDataUrl ? (
                            <img className="gallery-card-image" src={turn.finalImageDataUrl} alt={formatShellCopy(SHELL_POSTGAME_COPY.drawingAlt, { answer: turn.answer })} />
                          ) : (
                            <div className="gallery-card-no-image">{SHELL_DRAWING_COPY.noDrawingCaptured}</div>
                          )}
                        </div>
                        {turn.scoreChanges.length > 0 ? (
                          <div className="gallery-card-scores">
                            {turn.scoreChanges.map((change) => (
                              <span key={`${turn.turnNumber}-${change.playerId}`} className="gallery-card-score-chip">
                                <span style={getPlayerAccentStyle(change.playerId, playerAccentColors)}>{change.nickname}</span>
                                <span className="gallery-card-points">+{change.points}</span>
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ));
          })()}
          <ShellNotice placement="postgame-gallery" />
        </div>

        <div className="game-chat-panel">
          <div className="chat-panel-header chat-panel-header-chat">
            <span>{SHELL_ROOM_COPY.chatHeader}</span>
          </div>

          <div ref={chatFeedRef} className="chat-feed" aria-label="Room feed messages" onScroll={handleChatFeedScroll}>
            {matchFeedLength ? (
              renderStructuredRoomFeed(matchFeed, playerAccentColors, userSettings.profanityFilterEnabled)
            ) : (
              <div className="chat-msg-empty">{SHELL_COMMON_COPY.noMessagesYet}</div>
            )}
          </div>

          <form className="chat-compose" onSubmit={handleSubmitMessage}>
            <input
              ref={chatInputRef}
              className="chat-input"
              value={messageDraft}
              onChange={(event) => setMessageDraft(event.target.value)}
              placeholder={SHELL_POSTGAME_COPY.chatPlaceholder}
              maxLength={MAX_CHAT_MESSAGE_LENGTH}
            />
            <button
              type="submit"
              className="chat-send-btn"
              disabled={isSendingMessage || !messageDraft.trim()}
            >
              {SHELL_SKIN_ICONS.sendMessage}
            </button>
          </form>
          {messageError ? <p className="error-text" style={{ padding: '0 0.65rem 0.5rem', fontSize: '0.72rem' }}>{messageError}</p> : null}
        </div>
      </div>

      {isViewerHost ? (
        <dialog ref={settingsDialogRef} className="settings-dialog" onClose={() => setSettingsError('')}>
          <div className="settings-dialog-header">
            <h2>{SHELL_POSTGAME_COPY.rematchSettings}</h2>
            <button type="button" className="settings-dialog-close" onClick={() => settingsDialogRef.current?.close()} aria-label={SHELL_COMMON_COPY.close}>
              {SHELL_SKIN_ICONS.close}
            </button>
          </div>
          <div className="settings-dialog-body">
            <SharedSettingsFields variant="postgame" settings={settingsDraft} onChange={autoSaveSettings} />
            {isSavingSettings ? <p className="helper-text">{SHELL_COMMON_COPY.saving}</p> : null}
            {settingsError ? <p className="error-text">{settingsError}</p> : null}
          </div>
        </dialog>
      ) : null}
    </div>
  );
}
