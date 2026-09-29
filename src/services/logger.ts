/* Journalisation par niveaux, pilotée par VITE_LOG_LEVEL.
   Seul fichier autorisé à utiliser console (règle ESLint no-console). */

type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function resolveLevel(): Level {
  const raw = import.meta.env.VITE_LOG_LEVEL as string | undefined;
  if (raw && raw in ORDER) return raw as Level;
  return import.meta.env.DEV ? 'debug' : 'warn';
}

const threshold = ORDER[resolveLevel()];

function emit(level: Level, scope: string, message: string, data?: unknown) {
  if (ORDER[level] < threshold || import.meta.env.MODE === 'test') return;
  const line = `[${level.toUpperCase()}] [${scope}] ${message}`;
  const fn =
    level === 'debug' ? console.debug : level === 'info' ? console.info : level === 'warn' ? console.warn : console.error;
  if (data === undefined) fn(line);
  else fn(line, data);
}

export function createLogger(scope: string) {
  return {
    debug: (message: string, data?: unknown) => emit('debug', scope, message, data),
    info: (message: string, data?: unknown) => emit('info', scope, message, data),
    warn: (message: string, data?: unknown) => emit('warn', scope, message, data),
    error: (message: string, data?: unknown) => emit('error', scope, message, data),
  };
}
