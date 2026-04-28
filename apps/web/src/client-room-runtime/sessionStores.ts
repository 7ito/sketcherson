import type { JoinedSession } from './types';

export interface JoinedSessionStore {
  read(): JoinedSession | null;
  write(session: JoinedSession | null): void;
}

export interface PreferredNicknameStore {
  write(nickname: string): void;
}

export function createBrowserJoinedSessionStore(storageKey: string): JoinedSessionStore {
  return {
    read() {
      if (typeof window === 'undefined') {
        return null;
      }

      try {
        const rawValue = window.localStorage.getItem(storageKey);
        if (!rawValue) {
          return null;
        }

        const parsedValue = JSON.parse(rawValue) as Partial<JoinedSession>;
        if (
          typeof parsedValue.playerId !== 'string' ||
          typeof parsedValue.roomCode !== 'string' ||
          typeof parsedValue.nickname !== 'string' ||
          typeof parsedValue.sessionToken !== 'string'
        ) {
          return null;
        }

        return {
          playerId: parsedValue.playerId,
          roomCode: parsedValue.roomCode,
          nickname: parsedValue.nickname,
          sessionToken: parsedValue.sessionToken,
        };
      } catch {
        return null;
      }
    },
    write(session) {
      if (typeof window === 'undefined') {
        return;
      }

      if (!session) {
        window.localStorage.removeItem(storageKey);
        return;
      }

      window.localStorage.setItem(storageKey, JSON.stringify(session));
    },
  };
}

export function createPreferredNicknameStore(writePreferredNickname: (nickname: string) => void): PreferredNicknameStore {
  return {
    write(nickname) {
      writePreferredNickname(nickname);
    },
  };
}
