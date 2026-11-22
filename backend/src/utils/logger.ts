type LogLevel = 'info' | 'warn' | 'error';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'token',
  'authorization',
  'jwt',
  'secret',
  'phone',
]);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 3 || value === null || typeof value !== 'object') {
    return typeof value === 'string' ? value.slice(0, 200) : value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => redact(item, depth + 1));
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SENSITIVE_KEYS.has(key.toLowerCase()))
      .map(([key, item]) => [key, redact(item, depth + 1)])
  );
}

function emit(level: LogLevel, event: string, details?: Record<string, unknown>): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...(details ? { details: redact(details) } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}

export const logger = {
  info(event: string, details?: Record<string, unknown>): void {
    emit('info', event, details);
  },
  warn(event: string, details?: Record<string, unknown>): void {
    emit('warn', event, details);
  },
  error(event: string, details?: Record<string, unknown>): void {
    emit('error', event, details);
  },
};
