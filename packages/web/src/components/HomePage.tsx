import { normalizeRoomCode } from '@7ito/sketcherson-common/room';
import { FormEvent, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConnectionStatusBanner } from './ConnectionStatusBanner';
import { GameLogo } from './GameLogo';
import { PREFERRED_NICKNAME_MAX_LENGTH, readPreferredNickname } from '../lib/preferredNickname';
import { useRoomSession } from '../providers/RoomSessionProvider';
import { GAME_DEFINITION, GAME_WEB_CONFIG } from '../game';
import { useWebExtensionSlots } from './WebExtensionSlots';

type ModalMode = 'create' | 'join';

export function HomePage() {
  const navigate = useNavigate();
  const { connectionNotice, createRoom, joinRoom, joinedSession } = useRoomSession();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const getDefaultNickname = () => readPreferredNickname() ?? joinedSession?.nickname ?? '';

  const [mode, setMode] = useState<ModalMode>('create');
  const [nickname, setNickname] = useState(getDefaultNickname);
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const slots = useWebExtensionSlots();
  const uiConfig = GAME_WEB_CONFIG.ui;
  const homeCopy = uiConfig.copy.home;
  const skinIcons = uiConfig.skin.tokens.icons;
  const homeFooterNotice = uiConfig.notices.find((notice) => notice.placements?.includes('home-footer')) ?? null;

  const openModal = (m: ModalMode) => {
    setMode(m);
    setNickname(getDefaultNickname());
    setRoomCode('');
    setError('');
    dialogRef.current?.showModal();
  };

  const closeModal = () => {
    dialogRef.current?.close();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    if (mode === 'create') {
      const result = await createRoom(nickname);
      setIsSubmitting(false);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      navigate(`/room/${result.data.room.code}`);
    } else {
      const normalizedCode = normalizeRoomCode(roomCode);
      const result = await joinRoom(normalizedCode, nickname);
      setIsSubmitting(false);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      navigate(`/room/${result.data.room.code}`);
    }
  };

  return (
    <>
      <div className="home-bg" />
      <main
        className="home-page"
        data-shell-home-variant={uiConfig.presentation.layout.home.heroVariant}
        data-shell-button-style={uiConfig.presentation.components.buttonStyle}
        data-shell-card-style={uiConfig.presentation.components.cardStyle}
      >
        <div className="home-hero">
          <h1 className="home-title" aria-label={uiConfig.logo.ariaLabel}>
            <GameLogo logo={uiConfig.logo} partClassNames={['logo-part-primary', 'logo-part-accent']} />
          </h1>
          <p className="home-tagline">{GAME_DEFINITION.tagline}</p>
          {connectionNotice ? (
            <ConnectionStatusBanner
              tone={connectionNotice.state === 'offline' ? 'danger' : 'warning'}
              message={connectionNotice.message}
            />
          ) : null}
        </div>

        {slots.homePageAddon ? <div className="home-extension-slot">{slots.homePageAddon()}</div> : null}

        <div className="home-action-card">
          <button type="button" className="action-primary" onClick={() => openModal('create')}>
            <span className="home-card-icon">{skinIcons.createRoom}</span>
            {homeCopy.createRoomButton}
          </button>
          <div className="home-or-divider">
            <div className="home-or-circle">{homeCopy.actionDivider}</div>
          </div>
          <button type="button" className="action-accent" onClick={() => openModal('join')}>
            <span className="home-card-icon">{skinIcons.joinRoom}</span>
            {homeCopy.joinRoomButton}
          </button>
        </div>

        <dialog ref={dialogRef} className="home-dialog" onClose={() => setError('')}>
          <form onSubmit={handleSubmit}>
            <div className="home-dialog-header">
              <h2>{mode === 'create' ? homeCopy.createRoomButton : homeCopy.joinRoomButton}</h2>
              <button type="button" className="home-dialog-close" onClick={closeModal} aria-label={homeCopy.closeDialog}>
                {skinIcons.close}
              </button>
            </div>

            {mode === 'join' && (
              <label>
                <span>{homeCopy.roomCodeLabel}</span>
                <input
                  value={roomCode}
                  onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                  placeholder="ABC123"
                  maxLength={6}
                  autoFocus
                  style={{ textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700 }}
                />
              </label>
            )}

            <label>
              <span>{homeCopy.nicknameLabel}</span>
              <input
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                placeholder={
                  mode === 'create'
                    ? uiConfig.nicknamePlaceholders.create
                    : uiConfig.nicknamePlaceholders.join
                }
                maxLength={PREFERRED_NICKNAME_MAX_LENGTH}
                autoFocus={mode === 'create'}
              />
            </label>

            {error ? <p className="error-text">{error}</p> : null}

            <button
              type="submit"
              className={mode === 'create' ? 'action-primary' : 'action-accent'}
              disabled={isSubmitting}
            >
              {isSubmitting
                ? mode === 'create'
                  ? homeCopy.createSubmitting
                  : homeCopy.joinSubmitting
                : mode === 'create'
                  ? homeCopy.createRoomButton
                  : homeCopy.joinRoomButton}
            </button>
          </form>
        </dialog>

        {homeFooterNotice?.shortText ? (
          <div className="home-footer">
            {homeFooterNotice.shortText}
            {homeFooterNotice.policyUrl && homeFooterNotice.policyLabel ? (
              <>
                {' '}{homeCopy.policyPrefix}{' '}
                <a href={homeFooterNotice.policyUrl} target="_blank" rel="noreferrer">
                  {homeFooterNotice.policyLabel}
                </a>
              </>
            ) : null}
          </div>
        ) : null}
      </main>
    </>
  );
}
