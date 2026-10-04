import { createId } from '@/utils/id';
import type { KeyValueStore } from './storeDataSource';
import type { ClientErrorReport, ErrorReportRow, TelemetryApi, UsageRow } from './types';

/* Suivi technique en mode démo : mêmes règles que le serveur (supabase/migrations/0016_telemetry.sql),
   données conservées dans le navigateur. */

const ERRORS_KEY = 'ra:v2:telemetry:errors';
const USAGE_KEY = 'ra:v2:telemetry:usage';
export const MAX_DISTINCT_ERRORS_PER_DAY = 200;
export const MAX_USAGE_ROWS_PER_DAY = 1000;
export const ROUTE_PATTERN = /^\/[A-Za-z0-9/:_-]{0,150}$/;

/** Empreinte d'une erreur : message, premier appel de la pile et écran (comme le serveur) */
export function errorFingerprint(r: Pick<ClientErrorReport, 'message' | 'stack' | 'route'>): string {
  const text = `${r.message}|${(r.stack ?? '').split('\n')[1] ?? ''}|${r.route}`;
  // FNV-1a sur quatre graines : 32 caractères hexadécimaux, sans dépendance cryptographique
  return [0x811c9dc5, 0x01000193, 0x050c5d1f, 0x2166136f]
    .map((seed) => {
      let h = seed >>> 0;
      for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
      return h.toString(16).padStart(8, '0');
    })
    .join('');
}

type StoredError = ErrorReportRow & { fingerprint: string };

/** Ajoute une erreur au jour donné : regroupée et comptée, plafonnée en nombre d'erreurs distinctes. */
export function mergeError(rows: StoredError[], report: ClientErrorReport, role: string, day: string, now: string): StoredError[] {
  const message = (report.message.trim() || 'Erreur sans message').slice(0, 500);
  const route = (report.route.trim() || '/').slice(0, 200);
  const fingerprint = errorFingerprint({ message, stack: report.stack, route });
  const index = rows.findIndex((r) => r.day === day && r.fingerprint === fingerprint);
  if (index >= 0) {
    const next = [...rows];
    next[index] = { ...rows[index]!, count: Math.min(rows[index]!.count + 1, 1_000_000), lastAt: now };
    return next;
  }
  if (rows.filter((r) => r.day === day).length >= MAX_DISTINCT_ERRORS_PER_DAY) return rows;
  return [
    ...rows,
    {
      id: createId(),
      day,
      fingerprint,
      message,
      stack: report.stack?.slice(0, 4000),
      route,
      source: report.source,
      role,
      appVersion: report.appVersion?.slice(0, 40),
      userAgent: report.userAgent?.slice(0, 300),
      count: 1,
      firstAt: now,
      lastAt: now,
    },
  ];
}

/** Compte une ouverture d'écran (jour, modèle d'adresse, rôle), plafonnée en nombre de lignes par jour. */
export function mergeView(rows: UsageRow[], route: string, role: string, day: string): UsageRow[] {
  if (!ROUTE_PATTERN.test(route)) return rows;
  const index = rows.findIndex((r) => r.day === day && r.route === route && r.role === role);
  if (index >= 0) {
    const next = [...rows];
    next[index] = { ...rows[index]!, views: Math.min(rows[index]!.views + 1, 1_000_000) };
    return next;
  }
  if (rows.filter((r) => r.day === day).length >= MAX_USAGE_ROWS_PER_DAY) return rows;
  return [...rows, { day, route, role, views: 1 }];
}

export function createLocalTelemetry(store: KeyValueStore, today: () => string): TelemetryApi {
  const load = <T>(key: string): T[] => {
    try {
      return JSON.parse(store.getItem(key) ?? '[]') as T[];
    } catch {
      return [];
    }
  };
  const save = (key: string, rows: unknown[]) => {
    try {
      store.setItem(key, JSON.stringify(rows));
    } catch {
      // Stockage plein : le suivi technique est abandonné, jamais l'application
    }
  };
  return {
    async reportError(report, role) {
      save(ERRORS_KEY, mergeError(load<StoredError>(ERRORS_KEY), report, role, today(), new Date().toISOString()));
    },
    async trackView(route, role) {
      save(USAGE_KEY, mergeView(load<UsageRow>(USAGE_KEY), route, role, today()));
    },
    async errors(since) {
      return load<StoredError>(ERRORS_KEY)
        .filter((r) => r.day >= since)
        .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
        .map(({ fingerprint: _fingerprint, ...row }) => row);
    },
    async usage(since) {
      return load<UsageRow>(USAGE_KEY).filter((r) => r.day >= since);
    },
  };
}
