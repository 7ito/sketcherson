import { GAME_RUNTIME } from '../game';

export const JOINED_SESSION_STORAGE_KEY = GAME_RUNTIME.storage.key('joined-session');
export const PREFERRED_NICKNAME_COOKIE_NAME = GAME_RUNTIME.storage.cookie('preferred-nickname');
export const USER_SETTINGS_STORAGE_KEY = GAME_RUNTIME.storage.key('userSettings', ':');
export const DRAWING_METRICS_STORAGE_KEY = GAME_RUNTIME.storage.key('debug.drawingMetrics');
