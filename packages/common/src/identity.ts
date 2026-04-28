export function normalizeNickname(nickname: string): string {
  return nickname.trim();
}

export function normalizeNicknameForComparison(nickname: string): string {
  return normalizeNickname(nickname).toLowerCase();
}

export function isNicknameValid(nickname: string): boolean {
  return normalizeNickname(nickname).length > 0;
}
