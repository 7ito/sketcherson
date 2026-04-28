export function normalizeRoomCode(code: string): string {
  return code.trim().toUpperCase();
}

export function buildShareUrl(origin: string, code: string): string {
  const base = origin.endsWith('/') ? origin.slice(0, -1) : origin;
  return `${base}/room/${code}`;
}
