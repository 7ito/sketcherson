import { logServerEvent } from './logger';

const DRAWING_METRICS_ENABLED = readBooleanFlag(process.env.DRAWING_METRICS, false);

export function estimateSerializedPayloadBytes(payload: unknown): number {
  try {
    const serialized = JSON.stringify(payload);
    if (!serialized) {
      return 0;
    }

    return Buffer.byteLength(serialized, 'utf8');
  } catch {
    return 0;
  }
}

export function logDrawingTransportMetric(event: string, fields: Record<string, unknown>): void {
  if (!DRAWING_METRICS_ENABLED) {
    return;
  }

  logServerEvent('info', event, fields);
}

function readBooleanFlag(rawValue: string | undefined, defaultValue: boolean): boolean {
  if (rawValue === undefined) {
    return defaultValue;
  }

  const normalized = rawValue.trim().toLowerCase();

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  return defaultValue;
}
