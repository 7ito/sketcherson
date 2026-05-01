const BASE_EXTEND_FLUSH_INTERVAL_MS = 33;
const MAX_EXTEND_FLUSH_INTERVAL_MS = 132;

export function getBaseExtendFlushIntervalMs(): number {
  return BASE_EXTEND_FLUSH_INTERVAL_MS;
}

export function getScheduledExtendFlushIntervalMs(currentIntervalMs: number, inFlightCount: number): number {
  if (inFlightCount >= 2) {
    return Math.max(currentIntervalMs, BASE_EXTEND_FLUSH_INTERVAL_MS * 3);
  }

  if (inFlightCount >= 1) {
    return Math.max(currentIntervalMs, BASE_EXTEND_FLUSH_INTERVAL_MS * 2);
  }

  return currentIntervalMs;
}

export function updateExtendFlushIntervalFromAck(options: {
  currentIntervalMs: number;
  inFlightCount: number;
  ackDurationMs: number;
  ok: boolean;
}): number {
  const ackTargetIntervalMs = getAckTargetIntervalMs(options.ackDurationMs);
  const inFlightTargetIntervalMs = getScheduledExtendFlushIntervalMs(BASE_EXTEND_FLUSH_INTERVAL_MS, options.inFlightCount);
  const failureTargetIntervalMs = options.ok ? BASE_EXTEND_FLUSH_INTERVAL_MS : MAX_EXTEND_FLUSH_INTERVAL_MS;
  const targetIntervalMs = Math.max(ackTargetIntervalMs, inFlightTargetIntervalMs, failureTargetIntervalMs);

  if (targetIntervalMs > options.currentIntervalMs) {
    return Math.min(MAX_EXTEND_FLUSH_INTERVAL_MS, targetIntervalMs);
  }

  if (targetIntervalMs < options.currentIntervalMs) {
    return Math.max(targetIntervalMs, options.currentIntervalMs - BASE_EXTEND_FLUSH_INTERVAL_MS);
  }

  return options.currentIntervalMs;
}

function getAckTargetIntervalMs(ackDurationMs: number): number {
  if (ackDurationMs >= 220) {
    return MAX_EXTEND_FLUSH_INTERVAL_MS;
  }

  if (ackDurationMs >= 120) {
    return BASE_EXTEND_FLUSH_INTERVAL_MS * 3;
  }

  if (ackDurationMs >= 70) {
    return BASE_EXTEND_FLUSH_INTERVAL_MS * 2;
  }

  return BASE_EXTEND_FLUSH_INTERVAL_MS;
}
