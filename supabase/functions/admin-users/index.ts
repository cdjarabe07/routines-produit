// Gestion des comptes réservée aux administrateurs (permission user.manage) :
// - create : crée le compte d'authentification et le profil, renvoie un mot de passe provisoire une seule fois ;
// - reset-password : génère un nouveau mot de passe provisoire (suite à une demande « mot de passe oublié »).
// La modification du rôle, de l'équipe ou du statut passe par l'API (RLS + triggers + audit).
// Tout se limite à l'entreprise de l'administrateur appelant : comptes créés dans son entreprise,
// réinitialisation refusée pour un compte d'une autre entreprise.
import { audit, callerCompany, callerWithPermission, corsHeaders, json, serviceClient, temporaryPassword } from '../_shared/http.ts';

const ROLES = ['operator', 'hancho', 'line_leader', 'quality', 'manager', 'admin'];
const SHIFTS = ['morning', 'afternoon', 'night'];
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max ? v.trim() : null);
const optId = (v: unknown) => (v === undefined || v === null || v === '' ? null : typeof v === 'string' && v.length <= 64 ? v : undefined);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'Méthode non autorisée.' });
  const admin = serviceClient();
  try {
    const caller = await callerWithPermission(admin, req, 'user.manage');
    if (!caller) {
      await audit(
        admin,
        null,
        'PERMISSION_DENIED',
        'admin-users',
        null,
        { reason: 'appel sans droit de gestion des utilisateurs' },
        await callerCompany(admin, req),
      );
      return json(req, 403, { error: 'Accès refusé.' });
    }
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return json(req, 400, { error: 'Requête invalide.' });

    if (body.action === 'create') {
      const u = body.user ?? {};
      const name = str(u.name, 120);
      const email = str(u.email, 254)?.toLowerCase() ?? null;
      const role = ROLES.includes(u.role) ? (u.role as string) : null;
      const shift = u.shift === undefined || u.shift === null ? null : SHIFTS.includes(u.shift) ? u.shift : undefined;
      const refs = { teamId: optId(u.teamId), lineId: optId(u.lineId), workstationId: optId(u.workstationId) };
      if (!name || !email || !EMAIL.test(email) || !role || shift === undefined || Object.values(refs).includes(undefined)) {
        return json(req, 400, { error: 'Données du compte invalides.' });
      }
      const { data: dup } = await admin.from('users').select('id').ilike('email', email).maybeSingle();
      if (dup) return json(req, 409, { error: 'Un utilisateur utilise déjà cette adresse email.' });

      const password = temporaryPassword();
      // Autorisation à usage unique exigée par la base (migration 0010) : l'inscription publique reste refusée
      const { error: authorizeError } = await admin.rpc('authorize_account_creation', { p_email: email });
      if (authorizeError) throw authorizeError;
      const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !created.user) return json(req, 409, { error: 'Création du compte d’authentification impossible.' });
      const { data: profile, error: profileError } = await admin
        .from('users')
        .insert({
          name,
          email,
          role,
          shift,
          zoneLabel: str(u.zoneLabel, 120),
          active: true,
          authId: created.user.id,
          companyId: caller.companyId,
          ...refs,
        })
        .select()
        .single();
      if (profileError) {
        await admin.auth.admin.deleteUser(created.user.id);
        return json(req, 400, { error: 'Profil invalide (équipe, ligne ou poste inconnu).' });
      }
      await audit(admin, caller.appUserId, 'USER_CREATED', 'users', profile.id, { role, email }, caller.companyId);
      return json(req, 200, { user: profile, temporaryPassword: password });
    }

    if (body.action === 'reset-password') {
      const userId = optId(body.userId);
      if (!userId) return json(req, 400, { error: 'Utilisateur manquant.' });
      const { data: target } = await admin
        .from('users')
        .select('id, authId, active')
        .eq('id', userId)
        .eq('companyId', caller.companyId)
        .maybeSingle();
      if (!target?.authId || !target.active) return json(req, 404, { error: 'Compte introuvable ou désactivé.' });
      const password = temporaryPassword();
      const { error } = await admin.auth.admin.updateUserById(target.authId, { password });
      if (error) return json(req, 500, { error: 'Réinitialisation impossible.' });
      // Toutes les sessions en cours du compte sont révoquées
      await admin.rpc('revoke_user_sessions', { p_auth: target.authId });
      await audit(admin, caller.appUserId, 'USER_PASSWORD_RESET', 'users', target.id, {}, caller.companyId);
      return json(req, 200, { temporaryPassword: password });
    }

    return json(req, 400, { error: 'Action inconnue.' });
  } catch (error) {
    console.error('admin-users', error);
    return json(req, 500, { error: 'Opération impossible. Consultez les journaux du serveur.' });
  }
});
