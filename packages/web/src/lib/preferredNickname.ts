import { isNicknameValid, normalizeNickname } from '@sketcherson/common/identity';
import { PREFERRED_NICKNAME_COOKIE_NAME } from './gameKeys';

export { PREFERRED_NICKNAME_COOKIE_NAME } from './gameKeys';
export const PREFERRED_NICKNAME_MAX_LENGTH = 24;

const PREFERRED_NICKNAME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function isPreferredNicknameValid(nickname: string): boolean {
  return isNicknameValid(nickname) && nickname.length <= PREFERRED_NICKNAME_MAX_LENGTH;
}

export function readPreferredNickname(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const encodedNickname = document.cookie
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${PREFERRED_NICKNAME_COOKIE_NAME}=`))
    ?.slice(PREFERRED_NICKNAME_COOKIE_NAME.length + 1);

  if (!encodedNickname) {
    return null;
  }

  try {
    const nickname = normalizeNickname(decodeURIComponent(encodedNickname));
    return isPreferredNicknameValid(nickname) ? nickname : null;
  } catch {
    return null;
  }
}

export function writePreferredNickname(nickname: string): void {
  if (typeof document === 'undefined') {
    return;
  }

  const normalizedNickname = normalizeNickname(nickname);
  if (!isPreferredNicknameValid(normalizedNickname)) {
    return;
  }

  document.cookie = `${PREFERRED_NICKNAME_COOKIE_NAME}=${encodeURIComponent(normalizedNickname)}; Max-Age=${PREFERRED_NICKNAME_COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
}
