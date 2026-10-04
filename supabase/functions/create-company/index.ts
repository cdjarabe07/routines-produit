// Création d'une entreprise cliente (opérateur de la plateforme uniquement) :
// entreprise, paramètres, réglages d'intégration, puis premier administrateur avec un mot de passe provisoire
// renvoyé une seule fois. Protégée par le jeton plateforme (en-tête x-platform-token ; seule son empreinte figure ici).
// Les comptes suivants sont créés par cet administrateur depuis l'application (fonction admin-users).
import { audit, json, serviceClient, sha256Hex, temporaryPassword } from '../_shared/http.ts';

const PLATFORM_TOKEN_SHA256 = 'cd98d171ed0e6d3cda09f45b81890c8eaa480ae286a055c2f75e574a5c1e0d77';
const SECTORS = ['generic', 'automotive', 'plastics', 'machining', 'food', 'electronics'];
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max ? v.trim() : null);

Deno.serve(async (req) => {
  // Appel serveur à serveur (script de l'opérateur) : aucune origine navigateur autorisée
  if (req.method !== 'POST') return json(req, 405, { error: 'Méthode non autorisée.' });
  const admin = serviceClient();
  const token = req.headers.get('x-platform-token') ?? '';
  if (!token || (await sha256Hex(token)) !== PLATFORM_TOKEN_SHA256) {
    await audit(admin, null, 'PERMISSION_DENIED', 'create-company', null, { reason: 'jeton plateforme absent ou invalide' });
    return json(req, 403, { error: 'Accès refusé.' });
  }
  let companyId: string | null = null;
  let authId: string | null = null;
  try {
    const body = await req.json().catch(() => null);
    const name = str(body?.name, 120);
    const sector = SECTORS.includes(body?.sector) ? (body.sector as string) : null;
    const timezone = str(body?.timezone, 64) ?? 'Europe/Paris';
    const adminName = str(body?.admin?.name, 120);
    const email = str(body?.admin?.email, 254)?.toLowerCase() ?? null;
    if (!name || !sector || !adminName || !email || !EMAIL.test(email)) return json(req, 400, { error: 'Données invalides.' });
    const { data: dup } = await admin.from('users').select('id').ilike('email', email).maybeSingle();
    if (dup) return json(req, 409, { error: 'Cette adresse email est déjà utilisée.' });

    const { data: created, error: companyError } = await admin.rpc('create_company', {
      p_name: name,
      p_sector: sector,
      p_timezone: timezone,
    });
    if (companyError || typeof created !== 'string') throw companyError ?? new Error('create_company');
    companyId = created;

    const password = temporaryPassword();
    const { error: authorizeError } = await admin.rpc('authorize_account_creation', { p_email: email });
    if (authorizeError) throw authorizeError;
    const { data: account, error: authError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (authError || !account.user) throw authError ?? new Error('createUser');
    authId = account.user.id;
    const { data: profile, error: profileError } = await admin
      .from('users')
      .insert({ name: adminName, email, role: 'admin', active: true, authId, companyId })
      .select('id')
      .single();
    if (profileError) throw profileError;
    await audit(admin, null, 'COMPANY_ADMIN_CREATED', 'users', profile.id, { email }, companyId);
    return json(req, 200, { companyId, adminEmail: email, temporaryPassword: password });
  } catch (error) {
    console.error('create-company', error);
    // Rien d'orphelin : compte d'authentification supprimé ; l'entreprise vide reste tracée dans le journal
    if (authId) await admin.auth.admin.deleteUser(authId);
    return json(req, 500, { error: 'Création impossible. Consultez les journaux du serveur.', companyId });
  }
});
