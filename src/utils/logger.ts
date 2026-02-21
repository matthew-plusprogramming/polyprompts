/**
 * Structured logging utility for PolyPrompts.
 *
 * Usage:
 *   import { createLogger, setSessionId } from '../utils/logger';
 *   const log = createLogger('ModuleName');
 *   log.info('something happened', { key: 'value' });
 *
 * DevTools filtering:
 *   Session:   — all logs from current session
 *   [Module]   — by module name
 *   completed  — all timing completions
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const IS_DEV = import.meta.env.DEV;

let sessionId = generateId();

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function setSessionId(id?: string): string {
  sessionId = id ?? generateId();
  return sessionId;
}

export function getSessionId(): string {
  return sessionId;
}

function shouldLog(level: LogLevel): boolean {
  if (IS_DEV) return true;
  return level === 'warn' || level === 'error';
}

function formatPrefix(module: string): string {
  return `[Session:${sessionId}] [${module}]`;
}

export interface Logger {
  debug: (msg: string, data?: Record<string, unknown>) => void;
  info: (msg: string, data?: Record<string, unknown>) => void;
  warn: (msg: string, data?: Record<string, unknown>) => void;
  error: (msg: string, data?: Record<string, unknown>) => void;
  time: (label: string) => () => void;
  child: (sub: string) => Logger;
}

export function createLogger(module: string): Logger {
  const prefix = () => formatPrefix(module);

  function log(level: LogLevel, msg: string, data?: Record<string, unknown>) {
    if (!shouldLog(level)) return;
    const fn = level === 'debug' ? console.debug
      : level === 'info' ? console.log
      : level === 'warn' ? console.warn
      : console.error;
    if (data) {
      fn(`${prefix()} ${msg}`, data);
    } else {
      fn(`${prefix()} ${msg}`);
    }
  }

  return {
    debug: (msg, data?) => log('debug', msg, data),
    info: (msg, data?) => log('info', msg, data),
    warn: (msg, data?) => log('warn', msg, data),
    error: (msg, data?) => log('error', msg, data),
    time: (label: string) => {
      if (!shouldLog('debug')) return () => {};
      const start = performance.now();
      log('debug', `${label} started`);
      return () => {
        const ms = (performance.now() - start).toFixed(1);
        log('debug', `${label} completed`, { durationMs: Number(ms) });
      };
    },
    child: (sub: string) => createLogger(`${module}.${sub}`),
  };
}

/**
 * Wraps a React reducer to log every dispatch with action type and changed keys.
 * UPDATE_TRANSCRIPT and UPDATE_METRICS are logged at debug level to avoid flooding.
 */
export function withReducerLogging<S, A extends { type: string }>(
  reducer: (state: S, action: A) => S,
  logger: Logger,
): (state: S, action: A) => S {
  const NOISY_ACTIONS = new Set(['UPDATE_TRANSCRIPT', 'UPDATE_METRICS']);

  return (state: S, action: A): S => {
    const next = reducer(state, action);
    if (next === state) return next;

    const changed: string[] = [];
    if (state && typeof state === 'object' && next && typeof next === 'object') {
      for (const key of Object.keys(next as Record<string, unknown>)) {
        if ((state as Record<string, unknown>)[key] !== (next as Record<string, unknown>)[key]) {
          changed.push(key);
        }
      }
    }

    const data: Record<string, unknown> = { changed };
    if (NOISY_ACTIONS.has(action.type)) {
      logger.debug(`dispatch ${action.type}`, data);
    } else {
      logger.info(`dispatch ${action.type}`, data);
    }
    return next;
  };
}
