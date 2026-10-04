// Utilitaires communs aux fonctions Edge : CORS restreint, réponses JSON sans détail interne, client service.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.57.4';

const DEFAULT_ORIGINS = 'https://routine-rose-five.vercel.app,http://localhost:5173,http://localhost:4173';
const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? DEFAULT_ORIGINS).split(',').map((o) => o.trim());

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  // Aucune origine générique : seules les adresses de l'application sont autorisées
  return allowed.includes(origin)
    ? {
        'Access-Control-Allow-Origin': origin,
        Vary: 'Origin',
        'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info, x-bootstrap-token',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Max-Age': '600',
      }
    : { Vary: 'Origin' };
}

export function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface Caller {
  appUserId: string;
  /** Entreprise de l'appelant : toute lecture ou écriture de la fonction s'y limite */
  companyId: string;
}

/** Utilisateur appelant (jeton de session) ayant la permission demandée, avec son entreprise ; null sinon. */
export async function callerWithPermission(admin: SupabaseClient, req: Request, permission: string): Promise<Caller | null> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: appUserId } = await admin.rpc('auth_user_has_perm', { p_auth: data.user.id, p: permission });
  if (typeof appUserId !== 'string') return null;
  const { data: companyId } = await admin.rpc('auth_user_company', { p_auth: data.user.id });
  return typeof companyId === 'string' ? { appUserId, companyId } : null;
}

/** Entreprise d'un appelant connecté, même sans la permission demandée (refus journalisés dans son entreprise). */
export async function callerCompany(admin: SupabaseClient, req: Request): Promise<string | null> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: companyId } = await admin.rpc('auth_user_company', { p_auth: data.user.id });
  return typeof companyId === 'string' ? companyId : null;
}

/** Événement du journal d'audit, rattaché à l'entreprise concernée (absente pour un appelant inconnu). */
export async function audit(
  admin: SupabaseClient,
  actorId: string | null,
  event: string,
  resource: string,
  resourceId: string | null,
  detail = {},
  companyId: string | null = null,
) {
  await admin.from('auditLog').insert({ actorId, event, resource, resourceId, detail, companyId });
}

/** Mot de passe provisoire robuste (18 caractères, alphabet sans ambiguïté, tirage uniforme). */
export function temporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  // Octets ≥ 220 rejetés : 220 = 4 × 55, chaque caractère a exactement la même probabilité
  const limit = 256 - (256 % alphabet.length);
  let out = '';
  while (out.length < 18) {
    for (const b of crypto.getRandomValues(new Uint8Array(32))) {
      if (b < limit && out.length < 18) out += alphabet[b % alphabet.length];
    }
  }
  return out;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
