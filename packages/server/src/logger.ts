type LogLevel = 'info' | 'warn' | 'error';

type LogFields = Record<string, unknown>;

function serializeError(error: unknown): LogFields {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    error,
  };
}

export function logServerEvent(level: LogLevel, event: string, fields: LogFields = {}): void {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
  };

  const line = JSON.stringify(payload);

  if (level === 'error') {
    console.error(line);
    return;
  }

  if (level === 'warn') {
    console.warn(line);
    return;
  }

  console.info(line);
}

export function logServerError(event: string, error: unknown, fields: LogFields = {}): void {
  logServerEvent('error', event, {
    ...fields,
    ...serializeError(error),
  });
}
