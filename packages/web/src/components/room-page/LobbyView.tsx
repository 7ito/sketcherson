import { normalizeLobbySettingsForGame } from '@7ito/sketcherson-common/settings';
import { buildShareUrl, MAX_CHAT_MESSAGE_LENGTH, MIN_PLAYERS_TO_START, type ApiResult, type LobbyDrawingActionSuccess, type LobbySettings, type RoomState } from '@7ito/sketcherson-common/room';
import type { DrawingAction } from '@7ito/sketcherson-common/drawing';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { formatShellCopy } from '@7ito/sketcherson-common/game';
import { GAME_DEFINITION, GAME_WEB_CONFIG } from '../../game';
import { useUserSettings } from '../../lib/userSettings';
import { useRoomDrawing } from '../../providers/RoomSessionProvider';
import { DrawingCanvas } from '../DrawingCanvas';
import { GameLogo } from '../GameLogo';
import {
  buildPlayerAccentMap,
  canHostKickPlayer,
  getPlayerAccentStyle,
  PlayerConnectionBadge,
  useAutoScrollToBottom,
} from './helpers';
import { renderRoomFeedItem } from './roomFeed';
import { SettingsSummary, SharedSettingsFields } from './RoomSettings';
import { SettingsGearButton } from './RoomShell';

const SHELL_COMMON_COPY = GAME_WEB_CONFIG.ui.copy.common;
const SHELL_ROOM_COPY = GAME_WEB_CONFIG.ui.copy.room;
const SHELL_LOBBY_COPY = GAME_WEB_CONFIG.ui.copy.lobby;
const SHELL_SKIN_ICONS = GAME_WEB_CONFIG.ui.skin.tokens.icons;

export function buildLobbyInviteUrl(
  room: Pick<RoomState, 'code' | 'shareUrl'>,
  origin = typeof window === 'undefined' ? '' : window.location.origin,
): string {
  return origin ? buildShareUrl(origin, room.code) : room.shareUrl;
}

export function LobbyView({
  room,
  currentPlayerId,
  connectionNotice,
  onSaveSettings,
  onStart,
  onKickPlayer,
  onSubmitLobbyDrawingAction,
  onSubmitMessage,
  onOpenSettings,
}: {
  room: RoomState;
  currentPlayerId: string;
  connectionNotice: { state: string; message: string } | null | undefined;
  onSaveSettings: (settings: LobbySettings) => Promise<string | null>;
  onStart: () => Promise<string | null>;
  onKickPlayer: (playerId: string) => Promise<string | null>;
  onSubmitLobbyDrawingAction: (action: DrawingAction) => Promise<ApiResult<LobbyDrawingActionSuccess>>;
  onSubmitMessage: (text: string) => Promise<string | null>;
  onOpenSettings: () => void;
}) {
  const lobbyDrawing = useRoomDrawing('lobby', room);
  const [userSettings] = useUserSettings();
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const [settingsDraft, setSettingsDraft] = useState(() => normalizeLobbySettingsForGame(GAME_DEFINITION, room.settings));
  const [settingsError, setSettingsError] = useState('');
  const [startError, setStartError] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [kickError, setKickError] = useState('');
  const [kickingPlayerId, setKickingPlayerId] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState('');
  const [messageError, setMessageError] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const lobbyFeed = room.lobbyFeed ?? [];
  const lobbyFeedLength = lobbyFeed.length;
  const { containerRef: chatFeedRef, handleScroll: handleChatFeedScroll } = useAutoScrollToBottom(lobbyFeedLength);

  const isViewerHost = room.players.some((player) => player.id === currentPlayerId && player.isHost);
  const connectedPlayerCount = room.players.filter((player) => player.connected).length;
  const canStart = isViewerHost && connectedPlayerCount >= MIN_PLAYERS_TO_START && room.status === 'lobby';
  const playerAccentColors = useMemo(() => buildPlayerAccentMap(room.players), [room.players]);

  useEffect(() => {
    setSettingsDraft(normalizeLobbySettingsForGame(GAME_DEFINITION, room.settings));
  }, [room.settings]);

  const handleCopy = async () => {
    if (!navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(buildLobbyInviteUrl(room));
    setCopyState('copied');
    window.setTimeout(() => setCopyState('idle'), 1500);
  };

  const handleSettingsChange = async (nextSettings: LobbySettings) => {
    setSettingsDraft(nextSettings);
    setSettingsError('');
    setIsSavingSettings(true);

    const errorMessage = await onSaveSettings(nextSettings);

    setIsSavingSettings(false);

    if (errorMessage) {
      setSettingsError(errorMessage);
    }
  };

  const handleStart = async () => {
    setStartError('');
    setIsStarting(true);

    const errorMessage = await onStart();

    setIsStarting(false);

    if (errorMessage) {
      setStartError(errorMessage);
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

  const handleSubmitMessage = async (event: FormEvent) => {
    event.preventDefault();
    const submittedMessage = messageDraft.trim();
    if (!submittedMessage) return;

    setMessageError('');
    setIsSendingMessage(true);
    setMessageDraft('');

    const errorMessage = await onSubmitMessage(submittedMessage);

    setIsSendingMessage(false);

    if (errorMessage) {
      setMessageError(errorMessage);
    }

    window.requestAnimationFrame(() => {
      chatInputRef.current?.focus();
    });
  };

  return (
    <div className="match-screen lobby-screen">
      {/* Top Bar */}
      <div className="topbar">
        <div className="topbar-left">
          <GameLogo className="topbar-logo" />
          <span className="lobby-status-dot" />
          <span className="lobby-status-text">{SHELL_ROOM_COPY.lobbyStatus}</span>
        </div>

        <div className="topbar-center">
          <span className="room-tag">
            <span className="room-tag-label">{SHELL_COMMON_COPY.roomCode}: </span>
            <span className="room-tag-value">{room.code}</span>
          </span>
          <button type="button" className="lobby-copy-btn" onClick={handleCopy} title={SHELL_LOBBY_COPY.copyInviteLink}>
            {copyState === 'copied' ? SHELL_SKIN_ICONS.correctGuess : SHELL_SKIN_ICONS.copyLink}
          </button>
        </div>

        <div className="topbar-right">
          <span className="lobby-player-count">{formatShellCopy(SHELL_COMMON_COPY.onlineCount, { count: connectedPlayerCount })}</span>
          {connectionNotice ? (
            <span className={`badge ${connectionNotice.state === 'offline' ? 'warning' : 'subdued'}`}>
              {connectionNotice.state === 'offline' ? SHELL_SKIN_ICONS.disconnected : SHELL_SKIN_ICONS.connected} {connectionNotice.message}
            </span>
          ) : null}
          <SettingsGearButton onClick={onOpenSettings} />
        </div>
      </div>

      {/* Game Body */}
      <div className="game-body">
        {/* Left Sidebar: Players */}
        <div className="game-sidebar">
          <div className="sidebar-header sidebar-header-players">
            {SHELL_ROOM_COPY.playersHeader}
            <span className="count">{room.players.length}</span>
          </div>

          <div className="sidebar-player-list">
            {room.players.map((player, index) => (
              <div key={player.id} className={`lobby-player-card${!player.connected ? ' lobby-player-disconnected' : ''}`}>
                <div
                  className="lobby-avatar"
                  style={{ background: playerAccentColors.get(player.id) ?? GAME_WEB_CONFIG.ui.theme.colors.mutedText }}
                >
                  {player.nickname.charAt(0).toUpperCase()}
                </div>
                <div className="lobby-player-info">
                  <span className="lobby-player-name" style={getPlayerAccentStyle(player.id, playerAccentColors)}>{player.nickname}</span>
                  <div className="lobby-player-tags">
                    {player.isHost ? <span className="lobby-tag lobby-tag-host">{SHELL_COMMON_COPY.host}</span> : null}
                    {player.connected
                      ? <span className="lobby-tag lobby-tag-connected">{SHELL_COMMON_COPY.connected}</span>
                      : <PlayerConnectionBadge player={player} roomStatus={room.status} />
                    }
                  </div>
                </div>
                {isViewerHost && canHostKickPlayer(player, currentPlayerId) ? (
                  <button
                    type="button"
                    className="lobby-kick-btn"
                    onClick={() => void handleKickPlayer(player.id)}
                    disabled={kickingPlayerId === player.id}
                  >
                    {kickingPlayerId === player.id ? '...' : SHELL_COMMON_COPY.kick}
                  </button>
                ) : null}
              </div>
            ))}
            {room.players.length < MIN_PLAYERS_TO_START ? (
              <div className="lobby-player-card lobby-player-empty">
                <div className="lobby-avatar lobby-avatar-empty">?</div>
                <div className="lobby-player-info">
                  <span className="lobby-player-name lobby-player-name-muted">{SHELL_ROOM_COPY.waitingForPlayers}</span>
                  <span className="lobby-player-tags">
                    <span className="lobby-tag lobby-tag-muted">
                      {formatShellCopy(SHELL_LOBBY_COPY.needMorePlayers, { count: MIN_PLAYERS_TO_START - room.players.length })}
                    </span>
                  </span>
                </div>
              </div>
            ) : null}
          </div>
          {kickError ? <p className="error-text" style={{ padding: '0.5rem 1rem' }}>{kickError}</p> : null}
        </div>

        {/* Center: Canvas */}
        <DrawingCanvas
          roomCode={room.code}
          drawing={lobbyDrawing}
          roomStatus={room.status}
          canDraw={true}
          onSubmitAction={onSubmitLobbyDrawingAction}
          target="lobby"
        />

        {/* Right: Settings + Chat */}
        <div className="game-chat-panel">
          <div className="chat-panel-header chat-panel-header-settings">
            <span>{SHELL_LOBBY_COPY.matchSettingsHeader}</span>
          </div>

          <div className="lobby-right-settings">
            {isViewerHost ? (
              <div className="lobby-settings-form">
                <SharedSettingsFields
                  variant="lobby"
                  settings={settingsDraft}
                  disabled={isSavingSettings || room.status !== 'lobby'}
                  onChange={(nextSettings) => {
                    void handleSettingsChange(nextSettings);
                  }}
                />
                {settingsError ? <p className="error-text">{settingsError}</p> : null}
                {isSavingSettings ? <p className="helper-text">{SHELL_COMMON_COPY.saving}</p> : null}
              </div>
            ) : (
              <SettingsSummary
                variant="lobby"
                settings={room.settings}
                helperText={SHELL_LOBBY_COPY.onlyHostCanChangeSettings}
              />
            )}

            <div className="lobby-start-section">
              {startError ? <p className="error-text">{startError}</p> : null}
              <button
                type="button"
                className="lobby-start-btn"
                disabled={!canStart || isStarting}
                onClick={handleStart}
              >
                {isStarting ? SHELL_LOBBY_COPY.startSubmitting : SHELL_ROOM_COPY.startGameButton}
              </button>
              {!canStart && isViewerHost ? (
                <p className="helper-text" style={{ textAlign: 'center' }}>
                  {formatShellCopy(SHELL_LOBBY_COPY.needMorePlayersToStart, { minPlayers: MIN_PLAYERS_TO_START })}
                </p>
              ) : null}
              {!isViewerHost ? (
                <p className="helper-text" style={{ textAlign: 'center' }}>
                  {SHELL_LOBBY_COPY.waitingForHostToStart}
                </p>
              ) : null}
            </div>
          </div>

          <div className="chat-panel-header chat-panel-header-chat lobby-chat-divider">
            <span>{SHELL_ROOM_COPY.chatHeader}</span>
          </div>
          <div ref={chatFeedRef} className="chat-feed" onScroll={handleChatFeedScroll}>
            {lobbyFeedLength ? (
              lobbyFeed.map((item) => renderRoomFeedItem(item, playerAccentColors, userSettings.profanityFilterEnabled))
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
              placeholder={SHELL_LOBBY_COPY.chatPlaceholder}
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
    </div>
  );
}
