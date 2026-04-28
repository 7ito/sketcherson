export interface ApiError {
  code:
    | 'ROOM_NOT_FOUND'
    | 'ROOM_FULL'
    | 'INVALID_NICKNAME'
    | 'NICKNAME_TAKEN'
    | 'FORBIDDEN'
    | 'INVALID_SETTINGS'
    | 'NOT_ENOUGH_PLAYERS'
    | 'INVALID_STATE'
    | 'INVALID_DRAW_ACTION'
    | 'NOT_DRAWER'
    | 'REROLL_UNAVAILABLE'
    | 'INVALID_MESSAGE'
    | 'ALREADY_GUESSED'
    | 'SESSION_EXPIRED'
    | 'RATE_LIMITED';
  message: string;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };
