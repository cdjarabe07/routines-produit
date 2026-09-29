import type { AppEnv } from '@/app/config/env';

/* Couche d'intégration BI (Power BI ou autre outil) — AUCUNE simulation.
   Sans configuration, l'écran affiche explicitement « non connecté ». */

export type BIConfig =
  | { status: 'not_configured' }
  | { status: 'invalid'; reason: string }
  | { status: 'configured'; url: string; origin: string };

export function resolveBIConfig(env: Pick<AppEnv, 'biEmbedUrl' | 'biAllowedOrigin'>): BIConfig {
  if (!env.biEmbedUrl) return { status: 'not_configured' };
  let url: URL;
  try {
    url = new URL(env.biEmbedUrl);
  } catch {
    return { status: 'invalid', reason: 'VITE_BI_EMBED_URL n’est pas une adresse valide.' };
  }
  if (url.protocol !== 'https:') return { status: 'invalid', reason: 'Le rapport doit être servi en https.' };
  if (env.biAllowedOrigin && url.origin !== env.biAllowedOrigin) {
    return { status: 'invalid', reason: `L’origine ${url.origin} ne correspond pas à VITE_BI_ALLOWED_ORIGIN (${env.biAllowedOrigin}).` };
  }
  return { status: 'configured', url: url.toString(), origin: url.origin };
}
