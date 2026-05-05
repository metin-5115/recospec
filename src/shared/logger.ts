type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const PREFIX = '[PlayForge]'

function log(level: LogLevel, ...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console[level](PREFIX, ...args)
}

export const logger = {
  debug: (...args: unknown[]) => log('debug', ...args),
  info: (...args: unknown[]) => log('info', ...args),
  warn: (...args: unknown[]) => log('warn', ...args),
  error: (...args: unknown[]) => log('error', ...args),
}
