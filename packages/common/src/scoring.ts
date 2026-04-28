export function calculateGuesserScore(elapsedMs: number, roundDurationMs: number): number {
  const safeRoundDurationMs = Math.max(roundDurationMs, 1);
  const progress = Math.min(1, Math.max(0, elapsedMs / safeRoundDurationMs));
  return Math.round(100 - progress * 70);
}
