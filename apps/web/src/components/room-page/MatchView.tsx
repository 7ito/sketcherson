import { MAX_CHAT_MESSAGE_LENGTH, type ApiResult, type DrawingActionSuccess, type RoomState } from '@sketcherson/common/room';
import type { DrawingAction } from '@sketcherson/common/drawing';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { formatShellCopy } from '@sketcherson/common/game';
import { GAME_RUNTIME, GAME_WEB_CONFIG } from '../../game';
import { soundEffects } from '../../lib/soundEffects';
import { useUserSettings } from '../../lib/userSettings';
import { useRoomDrawing } from '../../providers/RoomSessionProvider';
import { DrawingCanvas } from '../DrawingCanvas';
import { GameLogo } from '../GameLogo';
import {
  buildPlayerAccentMap,
  canHostKickPlayer,
  capitalizeFirst,
  GAME_TERMINOLOGY,
  getCurrentTurnReferenceArtUrl,
  getPlayerAccentStyle,
  useAutoScrollToBottom,
  usePhaseCountdown,
} from './helpers';
import { legacyChatMessagesToRoomFeed, renderStructuredRoomFeed } from './roomFeed';
import { SettingsGearButton } from './RoomShell';

const SHELL_COMMON_COPY = GAME_WEB_CONFIG.ui.copy.common;
const SHELL_ROOM_COPY = GAME_WEB_CONFIG.ui.copy.room;
const SHELL_MATCH_COPY = GAME_WEB_CONFIG.ui.copy.match;
const SHELL_DRAWING_COPY = GAME_WEB_CONFIG.ui.copy.drawing;
const SHELL_SKIN_ICONS = GAME_WEB_CONFIG.ui.skin.tokens.icons;

export function MatchView({
  room,
  currentPlayerId,
  connectionNotice,
  onPause,
  onResume,
  onReroll,
  onKickPlayer,
  onSubmitDrawingAction,
  onSubmitMessage,
  onOpenSettings,
}: {
  room: RoomState;
  currentPlayerId: string;
  connectionNotice: { state: string; message: string } | null | undefined;
  onPause: () => Promise<string | null>;
  onResume: () => Promise<string | null>;
  onReroll: () => Promise<string | null>;
  onKickPlayer: (playerId: string) => Promise<string | null>;
  onSubmitDrawingAction: (action: DrawingAction) => Promise<ApiResult<DrawingActionSuccess>>;
  onSubmitMessage: (text: string) => Promise<string | null>;
  onOpenSettings: () => void;
}) {
  const matchDrawing = useRoomDrawing('match', room);
  const [userSettings] = useUserSettings();
  const currentTurn = room.match?.currentTurn ?? null;
  const phaseEndsAt = room.match?.phaseEndsAt ?? null;
  const pauseState = room.match?.pause ?? null;
  const liveSecondsRemaining = usePhaseCountdown(phaseEndsAt);
  const resumeCountdownSeconds = usePhaseCountdown(pauseState?.resumeEndsAt ?? null);
  const pauseWindowSeconds = usePhaseCountdown(pauseState?.pauseEndsAt ?? null);
  const pauseCooldownSeconds = usePhaseCountdown(room.match?.pauseCooldownEndsAt ?? null);
  const [rerollError, setRerollError] = useState('');
  const [isRerolling, setIsRerolling] = useState(false);
  const [pauseError, setPauseError] = useState('');
  const [isPausing, setIsPausing] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [messageDraft, setMessageDraft] = useState('');
  const chatInputRef = useRef<HTMLInputElement>(null);
  const matchFeed = room.match ? room.match.feed ?? legacyChatMessagesToRoomFeed(room.match.chatMessages) : [];
  const matchFeedLength = matchFeed.length;
  const { containerRef: chatFeedRef, handleScroll: handleChatFeedScroll } = useAutoScrollToBottom(matchFeedLength);
  const [messageError, setMessageError] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [kickError, setKickError] = useState('');
  const [kickingPlayerId, setKickingPlayerId] = useState<string | null>(null);
  const roundWarningTurnRef = useRef<number | null>(null);

  const effectivePhase = room.status === 'paused' ? pauseState?.pausedPhase ?? null : room.status;
  const isViewerHost = room.players.some((player) => player.id === currentPlayerId && player.isHost);
  const isCurrentDrawer = currentTurn?.drawerPlayerId === currentPlayerId;
  const hasGuessedCorrectly = Boolean(currentTurn?.correctGuessPlayerIds.includes(currentPlayerId));
  const canReroll = Boolean(
    GAME_RUNTIME.rules.features.reroll && isCurrentDrawer && currentTurn && currentTurn.rerollsRemaining > 0 && ['countdown', 'round'].includes(room.status),
  );
  const canPauseMatch = GAME_RUNTIME.rules.features.pause;
  const canDraw = Boolean(isCurrentDrawer && room.status === 'round' && currentTurn);
  const latestCompletedTurn = room.match?.completedTurns[room.match.completedTurns.length - 1] ?? null;
  const revealSummary = effectivePhase === 'reveal' ? latestCompletedTurn : null;
  const playersById = useMemo(() => new Map(room.players.map((player) => [player.id, player])), [room.players]);
  const playerAccentColors = useMemo(() => buildPlayerAccentMap(room.players), [room.players]);
  const currentPlayer = playersById.get(currentPlayerId);
  const isWaitingToGuess = Boolean(
    effectivePhase === 'round' &&
      currentTurn &&
      currentPlayer?.canGuessFromTurnNumber !== undefined &&
      currentPlayer.canGuessFromTurnNumber !== null &&
      currentPlayer.canGuessFromTurnNumber > currentTurn.turnNumber,
  );
  const isPauseCountdownRunning = room.status === 'paused' && pauseState?.mode === 'resuming';
  const secondsRemaining =
    room.status === 'paused'
      ? isPauseCountdownRunning
        ? resumeCountdownSeconds
        : pauseState
          ? Math.ceil(pauseState.phaseRemainingMs / 1000)
          : null
      : liveSecondsRemaining;
  const guessingDelayEndsAt = useMemo(() => {
    if (room.status !== 'round' || effectivePhase !== 'round') {
      return null;
    }

    const remainingMs = currentTurn?.guessingDelayRemainingMs ?? 0;
    return remainingMs > 0 ? Date.now() + remainingMs : null;
  }, [currentTurn?.guessingDelayRemainingMs, currentTurn?.turnNumber, effectivePhase, room.status]);
  const liveGuessingDelaySecondsRemaining = usePhaseCountdown(guessingDelayEndsAt);
  const guessingDelaySecondsRemaining =
    effectivePhase === 'round' && currentTurn && !isCurrentDrawer
      ? room.status === 'paused'
        ? Math.max(0, Math.ceil((currentTurn.guessingDelayRemainingMs ?? 0) / 1000))
        : liveGuessingDelaySecondsRemaining ?? 0
      : 0;
  const isGuessingDelayActive = guessingDelaySecondsRemaining > 0;
  const canSendMessage = !(effectivePhase === 'round' && (hasGuessedCorrectly || isGuessingDelayActive));

  const timerPercent = secondsRemaining !== null ? Math.max(0, Math.min(100, (secondsRemaining / room.settings.roundTimerSeconds) * 100)) : 0;

  useEffect(() => {
    if (room.status !== 'round' || !currentTurn || !phaseEndsAt) {
      return;
    }

    if (roundWarningTurnRef.current === currentTurn.turnNumber) {
      return;
    }

    const warningDelayMs = phaseEndsAt - Date.now() - 10_000;
    if (warningDelayMs <= 0) {
      return;
    }

    const warningTimer = window.setTimeout(() => {
      roundWarningTurnRef.current = currentTurn.turnNumber;
      void soundEffects.play('roundWarning');
    }, warningDelayMs);

    return () => {
      window.clearTimeout(warningTimer);
    };
  }, [currentTurn?.turnNumber, phaseEndsAt, room.status]);

  const handleReroll = async () => {
    setRerollError('');
    setIsRerolling(true);
    const errorMessage = await onReroll();
    setIsRerolling(false);
    if (errorMessage) setRerollError(errorMessage);
  };

  const handlePause = async () => {
    setPauseError('');
    setIsPausing(true);
    const errorMessage = await onPause();
    setIsPausing(false);
    if (errorMessage) setPauseError(errorMessage);
  };

  const handleResume = async () => {
    setPauseError('');
    setIsResuming(true);
    const errorMessage = await onResume();
    setIsResuming(false);
    if (errorMessage) setPauseError(errorMessage);
  };

  const focusChatInput = () => {
    window.requestAnimationFrame(() => {
      chatInputRef.current?.focus();
    });
  };

  const handleSubmitMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSendingMessage || !canSendMessage || !messageDraft.trim()) return;
    const submittedMessage = messageDraft;
    setMessageError('');
    setIsSendingMessage(true);
    setMessageDraft('');
    focusChatInput();
    const errorMessage = await onSubmitMessage(submittedMessage);
    setIsSendingMessage(false);
    if (errorMessage) {
      setMessageError(errorMessage);
      setMessageDraft((draft) => (draft ? draft : submittedMessage));
    }
    focusChatInput();
  };

  const handleKickPlayer = async (playerId: string) => {
    setKickError('');
    setKickingPlayerId(playerId);
    const errorMessage = await onKickPlayer(playerId);
    setKickingPlayerId(null);
    if (errorMessage) setKickError(errorMessage);
  };

  useEffect(() => {
    if (canDraw || !canSendMessage) return;

    const handleTypingShortcut = (event: KeyboardEvent) => {
      if (!isChatFocusShortcut(event)) return;

      event.preventDefault();
      chatInputRef.current?.focus();
      setMessageDraft((draft) => (draft.length >= MAX_CHAT_MESSAGE_LENGTH ? draft : `${draft}${event.key}`));
    };

    window.addEventListener('keydown', handleTypingShortcut);
    return () => window.removeEventListener('keydown', handleTypingShortcut);
  }, [canDraw, canSendMessage]);

  const phaseLabel =
    room.status === 'paused'
      ? isPauseCountdownRunning
        ? SHELL_MATCH_COPY.phaseResuming
        : SHELL_MATCH_COPY.phasePaused
      : room.status === 'countdown'
      ? SHELL_MATCH_COPY.phaseCountdown
      : room.status === 'round'
        ? SHELL_MATCH_COPY.phaseActive
        : room.status === 'reveal'
          ? SHELL_MATCH_COPY.phaseReveal
          : SHELL_MATCH_COPY.phaseDone;

  const phaseBadgeClass =
    room.status === 'paused'
      ? 'phase-badge phase-paused'
      : room.status === 'countdown'
      ? 'phase-badge phase-countdown'
      : room.status === 'reveal'
        ? 'phase-badge phase-reveal'
        : '';

  const timerClass =
    secondsRemaining !== null && secondsRemaining <= 5
      ? 'timer-value timer-danger'
      : secondsRemaining !== null && secondsRemaining <= 15
        ? 'timer-value timer-warning'
        : 'timer-value';

  return (
    <div className="match-screen">
      {/* Top Bar */}
      <div className="topbar">
        <div className="topbar-left">
          <GameLogo className="topbar-logo" />
          <span className="room-tag">{room.code}</span>
        </div>

        <div className="topbar-center">
          {currentTurn ? (
            <span className="turn-badge">
              {formatShellCopy(SHELL_MATCH_COPY.roundBadge, {
                currentRound: Math.floor((currentTurn.turnNumber - 1) / (currentTurn.totalTurns / room.settings.turnsPerPlayer)) + 1,
                totalRounds: room.settings.turnsPerPlayer,
              })}
            </span>
          ) : null}

          <div className="timer-block">
            <span className={timerClass}>{secondsRemaining ?? '—'}</span>
            <div className="timer-bar">
              <div className="timer-bar-fill" style={{ width: `${timerPercent}%` }} />
            </div>
          </div>

          {phaseBadgeClass ? <span className={phaseBadgeClass}>{phaseLabel}</span> : null}
        </div>

        <div className="topbar-right">
          {currentTurn ? (
            <span className="drawer-tag">
              {formatShellCopy(SHELL_MATCH_COPY.drawerTag, { drawerIcon: SHELL_SKIN_ICONS.drawer, drawerNickname: currentTurn.drawerNickname })}
            </span>
          ) : null}
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
        {/* Left Sidebar: Scoreboard and prompt reference */}
        <div className="game-sidebar">
          <div className="sidebar-header sidebar-header-scoreboard">
            {SHELL_ROOM_COPY.scoreboardHeader}
            <span className="count">{room.players.length}</span>
          </div>

          <div className="sidebar-player-list">
            {room.match?.scoreboard.map((entry, index) => {
              const player = playersById.get(entry.playerId);
              const guessedCorrectly = currentTurn?.correctGuessPlayerIds.includes(entry.playerId);
              const isDrawing = entry.playerId === currentTurn?.drawerPlayerId;

              const rowClass = isDrawing
                ? 'sb-player-row sb-drawing'
                : guessedCorrectly
                  ? 'sb-player-row sb-correct'
                  : 'sb-player-row';

              const rankClass = index === 0 ? 'sb-rank rank-1' : index === 1 ? 'sb-rank rank-2' : index === 2 ? 'sb-rank rank-3' : 'sb-rank';

              return (
                <div key={entry.playerId} className={rowClass}>
                  <span className={rankClass}>{index + 1}</span>
                  <div className="sb-info">
                    <div className="sb-name-line">
                      <span className="sb-name" style={getPlayerAccentStyle(entry.playerId, playerAccentColors)}>{entry.nickname}</span>
                      {isDrawing ? <span className="sb-label label-drawing">{SHELL_MATCH_COPY.drawingLabel}</span> : null}
                      {guessedCorrectly ? <span className="sb-label label-correct">{SHELL_SKIN_ICONS.correctGuess}</span> : null}
                      {player?.isHost ? <span className="sb-label label-host">{SHELL_MATCH_COPY.hostLabel}</span> : null}
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
                        {SHELL_MATCH_COPY.kickLabel}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          {kickError ? <p className="error-text" style={{ padding: '0 0.5rem 0.5rem', fontSize: '0.75rem' }}>{kickError}</p> : null}

          {/* Prompt reference, drawer only */}
          {isCurrentDrawer && currentTurn && currentTurn.promptVisibility !== 'hidden' ? (
            <div className="prompt-ref">
              <div className="prompt-ref-header">{formatShellCopy(SHELL_MATCH_COPY.promptHeader, { promptNoun: GAME_TERMINOLOGY.promptNoun })}</div>
              <div className="prompt-ref-frame">
                {getCurrentTurnReferenceArtUrl(currentTurn) ? (
                  <img
                    className="prompt-ref-art"
                    src={getCurrentTurnReferenceArtUrl(currentTurn) ?? undefined}
                    alt={`${capitalizeFirst(GAME_TERMINOLOGY.referenceArtLabel)} for ${currentTurn.prompt ?? GAME_TERMINOLOGY.promptNoun}`}
                  />
                ) : (
                  <div className="prompt-ref-image-placeholder">
                    <span className="placeholder-icon">{SHELL_SKIN_ICONS.referencePlaceholder}</span>
                    <span>{SHELL_DRAWING_COPY.referenceImagePlaceholder}</span>
                  </div>
                )}
                <div className="prompt-ref-name">{currentTurn.prompt ?? '???'}</div>
              </div>
              <div className="prompt-ref-hint">{SHELL_MATCH_COPY.promptOnlyYouCanSee}</div>
              <div className="prompt-ref-actions">
                {canReroll ? (
                  <button
                    type="button"
                    className="secondary-button compact-button"
                    onClick={handleReroll}
                    disabled={isRerolling}
                    style={{ width: '100%' }}
                  >
                    {isRerolling ? SHELL_MATCH_COPY.rerolling : `${GAME_TERMINOLOGY.rerollLabel} (${currentTurn.rerollsRemaining} left)`}
                  </button>
                ) : null}
                {currentTurn.rerolledFrom ? (
                  <p className="prompt-ref-hint">{formatShellCopy(SHELL_MATCH_COPY.rerolledFrom, { previousPrompt: currentTurn.rerolledFrom })}</p>
                ) : null}
                {rerollError ? <p className="error-text" style={{ fontSize: '0.72rem' }}>{rerollError}</p> : null}
              </div>
            </div>
          ) : null}

          {/* Non-drawer: show prompt during reveal */}
          {!isCurrentDrawer && effectivePhase === 'reveal' && currentTurn && currentTurn.promptVisibility === 'revealed' ? (
            <div className="prompt-ref">
              <div className="prompt-ref-header">{GAME_TERMINOLOGY.answerLabel}</div>
              <div className="prompt-ref-frame">
                {getCurrentTurnReferenceArtUrl(currentTurn) ? (
                  <img
                    className="prompt-ref-art"
                    src={getCurrentTurnReferenceArtUrl(currentTurn) ?? undefined}
                    alt={`${capitalizeFirst(GAME_TERMINOLOGY.referenceArtLabel)} for ${currentTurn.prompt ?? GAME_TERMINOLOGY.promptNoun}`}
                  />
                ) : (
                  <div className="prompt-ref-image-placeholder">
                    <span className="placeholder-icon">{SHELL_SKIN_ICONS.referencePlaceholder}</span>
                    <span>{SHELL_DRAWING_COPY.referenceImagePlaceholder}</span>
                  </div>
                )}
                <div className="prompt-ref-name">{currentTurn.prompt ?? '???'}</div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Center: Canvas */}
        <DrawingCanvas
          roomCode={room.code}
          drawing={matchDrawing}
          roomStatus={room.status}
          canDraw={canDraw}
          onSubmitAction={onSubmitDrawingAction}
        />

        {/* Right: Chat + Info */}
        <div className="game-chat-panel">
          <div className="chat-panel-header chat-panel-header-chat">
            <span>{SHELL_ROOM_COPY.chatAndGuessesHeader}</span>
            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {effectivePhase === 'round' && hasGuessedCorrectly ? <span className="badge warning">{SHELL_MATCH_COPY.guessedBadge}</span> : null}
              {isGuessingDelayActive ? <span className="badge subdued">{formatShellCopy(SHELL_MATCH_COPY.waitBadge, { seconds: guessingDelaySecondsRemaining })}</span> : null}
              {isWaitingToGuess ? <span className="badge subdued">{SHELL_MATCH_COPY.nextRoundBadge}</span> : null}
              {room.status === 'paused' ? <span className="badge warning">{SHELL_MATCH_COPY.pausedBadge}</span> : null}
            </div>
          </div>

          {/* Contextual info section */}
          {(revealSummary || (isViewerHost && canPauseMatch) || pauseState || isGuessingDelayActive) ? (
            <div className="chat-panel-info">
              {/* Reveal summary */}
              {revealSummary ? (
                <div className="chat-info-card">
                  <span className="card-label">{SHELL_MATCH_COPY.revealResultHeader}</span>
                  <span className="card-value text-green">{revealSummary.answer}</span>
                  <span className="card-helper">{formatShellCopy(SHELL_MATCH_COPY.drawnBy, { drawerNickname: revealSummary.drawerNickname })}</span>
                  {revealSummary.scoreChanges.length > 0 ? (
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                      {revealSummary.scoreChanges.map((change) => (
                        <span key={change.playerId} className="badge subdued">
                          {change.nickname} +{change.points}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="card-helper">{SHELL_MATCH_COPY.noCorrectGuesses}</span>
                  )}
                </div>
              ) : null}

              {/* Guessing delay info */}
              {isGuessingDelayActive ? (
                <div className="chat-info-card">
                  <span className="card-label">{SHELL_MATCH_COPY.guessingUnlocksHeader}</span>
                  <span className="card-value text-orange">{guessingDelaySecondsRemaining}s</span>
                  <span className="card-helper">{SHELL_MATCH_COPY.guessingDelayHelper}</span>
                </div>
              ) : null}

              {/* Pause info */}
              {room.status === 'paused' && pauseState?.mode === 'paused' ? (
                <div className="chat-info-card">
                  <span className="card-label">{SHELL_MATCH_COPY.pauseWindowHeader}</span>
                  <span className="card-value text-orange">{formatShellCopy(SHELL_MATCH_COPY.pauseWindowRemaining, { seconds: pauseWindowSeconds ?? 0 })}</span>
                  <span className="card-helper">{SHELL_MATCH_COPY.autoResumeHelper}</span>
                </div>
              ) : null}

              {/* Host controls */}
              {isViewerHost && canPauseMatch ? (
                <div className="chat-info-card">
                  <span className="card-label">{SHELL_MATCH_COPY.hostControlsHeader}</span>
                  {room.status === 'paused' ? (
                    <button
                      type="button"
                      className="secondary-button compact-button"
                      onClick={handleResume}
                      disabled={isResuming || isPauseCountdownRunning}
                      style={{ marginTop: '0.3rem' }}
                    >
                      {isPauseCountdownRunning ? SHELL_MATCH_COPY.resumeCountdown : SHELL_MATCH_COPY.resumeMatch}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="secondary-button compact-button"
                        onClick={handlePause}
                        disabled={isPausing || Boolean(pauseCooldownSeconds && pauseCooldownSeconds > 0)}
                        style={{ marginTop: '0.3rem' }}
                      >
                        {isPausing ? SHELL_MATCH_COPY.pausingMatch : SHELL_MATCH_COPY.pauseMatch}
                      </button>
                      {pauseCooldownSeconds && pauseCooldownSeconds > 0 ? (
                        <span className="card-helper">{formatShellCopy(SHELL_MATCH_COPY.pauseCooldownHelper, { seconds: pauseCooldownSeconds })}</span>
                      ) : null}
                    </>
                  )}
                  {pauseError ? <p className="error-text" style={{ fontSize: '0.72rem' }}>{pauseError}</p> : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Chat feed */}
          <div ref={chatFeedRef} className="chat-feed" aria-label="Room feed messages" onScroll={handleChatFeedScroll}>
            {matchFeedLength ? (
              renderStructuredRoomFeed(matchFeed, playerAccentColors, userSettings.profanityFilterEnabled)
            ) : (
              <div className="chat-msg-empty">{SHELL_COMMON_COPY.noMessagesYet}</div>
            )}
          </div>

          {/* Chat input */}
          <form className="chat-compose" onSubmit={handleSubmitMessage}>
            <input
              ref={chatInputRef}
              className="chat-input"
              value={messageDraft}
              onChange={(event) => setMessageDraft(event.target.value)}
              placeholder={
                isCurrentDrawer
                  ? SHELL_MATCH_COPY.chatPlaceholderDrawer
                  : isGuessingDelayActive
                    ? formatShellCopy(SHELL_MATCH_COPY.chatPlaceholderGuessingLocked, { seconds: guessingDelaySecondsRemaining })
                    : SHELL_MATCH_COPY.chatPlaceholderGuesser
              }
              maxLength={MAX_CHAT_MESSAGE_LENGTH}
              disabled={!canSendMessage}
            />
            <button
              type="submit"
              className="chat-send-btn"
              disabled={isSendingMessage || !canSendMessage || !messageDraft.trim()}
            >
              {SHELL_SKIN_ICONS.sendMessage}
            </button>
          </form>
          {messageError ? <p className="error-text" style={{ padding: '0 0.65rem 0.5rem', fontSize: '0.72rem' }}>{messageError}</p> : null}
          {!messageError && isGuessingDelayActive ? (
            <p className="helper-text" style={{ padding: '0 0.65rem 0.5rem', fontSize: '0.72rem' }}>
              {formatShellCopy(SHELL_MATCH_COPY.guessingDelayFooter, { seconds: guessingDelaySecondsRemaining })}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function isChatFocusShortcut(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.key.length !== 1) {
    return false;
  }

  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return true;
  }

  return !(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target.isContentEditable);
}
