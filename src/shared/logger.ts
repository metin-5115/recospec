type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const PREFIX = '[PlayForge]'
const IS_DEV = import.meta.env.DEV

function log(level: LogLevel, ...args: unknown[]): void {
  if (!IS_DEV && level !== 'error') return
  // eslint-disable-next-line no-console
  console[level](PREFIX, ...args)
}

export const logger = {
  debug: (...args: unknown[]) => log('debug', ...args),
  info: (...args: unknown[]) => log('info', ...args),
  warn: (...args: unknown[]) => log('warn', ...args),
  error: (...args: unknown[]) => log('error', ...args),
}
