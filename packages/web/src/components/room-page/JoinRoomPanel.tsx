import { type FormEvent } from 'react';
import type { RoomState } from '@sketcherson/common/room';
import { formatShellCopy } from '@sketcherson/common/game';
import { PREFERRED_NICKNAME_MAX_LENGTH } from '../../lib/preferredNickname';
import { GAME_WEB_CONFIG } from '../../game';

const SHELL_JOIN_COPY = GAME_WEB_CONFIG.ui.copy.join;

export function JoinRoomPanel({
  roomCode,
  roomStatus,
  joinNickname,
  joinError,
  isJoining,
  onChangeNickname,
  onJoin,
}: {
  roomCode: string;
  roomStatus: RoomState['status'] | undefined;
  joinNickname: string;
  joinError: string;
  isJoining: boolean;
  onChangeNickname: (nickname: string) => void;
  onJoin: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="panel centered-panel">
      <p className="eyebrow">{SHELL_JOIN_COPY.eyebrow}</p>
      <h1>{formatShellCopy(SHELL_JOIN_COPY.title, { roomCode })}</h1>
      <p className="subtitle">
        {roomStatus === 'lobby'
          ? SHELL_JOIN_COPY.lobbySubtitle
          : SHELL_JOIN_COPY.liveMatchSubtitle}
      </p>

      <form className="join-form" onSubmit={onJoin}>
        <label>
          <span>{SHELL_JOIN_COPY.nicknameLabel}</span>
          <input
            value={joinNickname}
            onChange={(event) => onChangeNickname(event.target.value)}
            placeholder={SHELL_JOIN_COPY.nicknamePlaceholder}
            maxLength={PREFERRED_NICKNAME_MAX_LENGTH}
          />
        </label>
        {joinError ? <p className="error-text">{joinError}</p> : null}
        <button type="submit" disabled={isJoining}>
          {isJoining ? SHELL_JOIN_COPY.submittingButton : SHELL_JOIN_COPY.submitButton}
        </button>
      </form>
    </section>
  );
}
