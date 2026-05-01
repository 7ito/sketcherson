import { useCallback, useSyncExternalStore } from 'react';
import { USER_SETTINGS_STORAGE_KEY } from './gameKeys';

interface UserSettings {
  volume: number;
  profanityFilterEnabled: boolean;
}

const DEFAULT_SETTINGS: UserSettings = {
  volume: 50,
  profanityFilterEnabled: true,
};

let cachedSettings: UserSettings | null = null;
const listeners = new Set<() => void>();

function readSettings(): UserSettings {
  if (cachedSettings) {
    return cachedSettings;
  }

  try {
    const raw = localStorage.getItem(USER_SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<UserSettings>;
      cachedSettings = { ...DEFAULT_SETTINGS, ...parsed };
      return cachedSettings;
    }
  } catch {
    // Ignore corrupted data.
  }

  cachedSettings = { ...DEFAULT_SETTINGS };
  return cachedSettings;
}

function writeSettings(next: UserSettings): void {
  cachedSettings = next;
  localStorage.setItem(USER_SETTINGS_STORAGE_KEY, JSON.stringify(next));
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): UserSettings {
  return readSettings();
}

export function useUserSettings(): [UserSettings, (patch: Partial<UserSettings>) => void] {
  const settings = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const update = useCallback((patch: Partial<UserSettings>) => {
    writeSettings({ ...readSettings(), ...patch });
  }, []);

  return [settings, update];
}

export function getUserSettings(): UserSettings {
  return readSettings();
}
