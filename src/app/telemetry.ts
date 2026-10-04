import { useEffect } from 'react';
import { useLocation, useMatches } from 'react-router';
import { useCurrentUser } from '@/app/providers/AuthProvider';
import { useDataSource } from '@/app/providers/DataSourceProvider';
import type { ClientErrorReport, ClientErrorSource } from '@/services/data/types';

/* Suivi technique côté navigateur :
   - erreurs non rattrapées (fenêtre, promesses, écrans plantés) envoyées au serveur, sans identité de personne ;
   - fréquentation : une vue par écran ouvert, comptée par modèle d'adresse (/actions/:id, jamais l'identifiant). */

const MAX_ERRORS_PER_SESSION = 20;

let sink: ((report: ClientErrorReport) => void) | null = null;
let currentRoute = '/';
let sentThisSession = 0;
const seen = new Set<string>();

/** Modèle d'adresse d'un écran : chaque valeur de paramètre est remplacée par son nom */
export function routePattern(pathname: string, params: Record<string, string | undefined>): string {
  if (params['*'] !== undefined) return '/introuvable';
  const byValue = new Map<string, string>();
  for (const [key, value] of Object.entries(params)) if (value) byValue.set(value, key);
  const path = pathname
    .split('/')
    .map((segment) => {
      const key = byValue.get(segment) ?? byValue.get(safeDecode(segment));
      return key ? `:${key}` : segment;
    })
    .join('/');
  return path === '' ? '/' : path;
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function describe(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) return { message: error.message || error.name, stack: error.stack };
  if (typeof error === 'string') return { message: error };
  try {
    return { message: JSON.stringify(error) ?? String(error) };
  } catch {
    return { message: String(error) };
  }
}

/** Bruit sans valeur : erreurs d'extensions, scripts tiers opaques, avertissements bénins du navigateur */
export function isNoise(message: string, stack = ''): boolean {
  return (
    /ResizeObserver loop/i.test(message) ||
    message === 'Script error.' ||
    /(chrome|moz|safari(-web)?)-extension:\/\//.test(stack) ||
    /AbortError|The user aborted a request/i.test(message)
  );
}

/** Transmet une erreur (une seule fois par message et par écran, au plus 20 par session). */
export function reportClientError(error: unknown, source: ClientErrorSource): void {
  if (!sink) return;
  const { message, stack } = describe(error);
  if (isNoise(message, stack)) return;
  const key = `${message}|${currentRoute}`;
  if (seen.has(key) || sentThisSession >= MAX_ERRORS_PER_SESSION) return;
  seen.add(key);
  sentThisSession++;
  sink({
    message: message.slice(0, 500),
    stack: stack?.slice(0, 4000),
    route: currentRoute,
    source,
    appVersion: import.meta.env.VITE_APP_VERSION,
    userAgent: navigator.userAgent.slice(0, 300),
  });
}

/** Branché dans l'espace connecté : capte les erreurs et compte les écrans ouverts. */
export function useTelemetry(): void {
  const ds = useDataSource();
  const user = useCurrentUser();
  const { pathname } = useLocation();
  const matches = useMatches();
  const telemetry = ds.telemetry;
  const last = matches[matches.length - 1];
  const route = last ? routePattern(pathname, last.params) : pathname;

  useEffect(() => {
    if (!telemetry) return;
    sink = (report) => void telemetry.reportError(report, user.role).catch(() => undefined);
    const onError = (event: ErrorEvent) => reportClientError(event.error ?? event.message, 'window');
    const onRejection = (event: PromiseRejectionEvent) => reportClientError(event.reason, 'promise');
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    // La destination reste active si la coque disparaît : la page d’erreur de rendu doit encore pouvoir signaler
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [telemetry, user.role]);

  useEffect(() => {
    currentRoute = route;
    void telemetry?.trackView(route, user.role).catch(() => undefined);
  }, [telemetry, route, user.role]);
}
