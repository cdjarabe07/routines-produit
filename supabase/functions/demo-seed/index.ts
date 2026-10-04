// Chargement / réinitialisation de l'environnement de DÉMONSTRATION.
// - Premier chargement : uniquement avec le jeton d'amorçage (seule son empreinte SHA-256 figure ici).
// - Ensuite : uniquement un administrateur connecté, et jamais si settings.environment = 'production'.
// Le journal d'audit n'est jamais effacé.
// Plusieurs entreprises : seule l'entreprise « demo » est concernée ; les autres ne sont jamais lues ni modifiées.
import {
  audit,
  callerCompany,
  callerWithPermission,
  corsHeaders,
  json,
  serviceClient,
  sha256Hex,
  temporaryPassword,
} from '../_shared/http.ts';

const BOOTSTRAP_TOKEN_SHA256 = '60505e81e20a044bbec11a68afdd381647a77c0c2d210a94d5859a316d745490';
const COMPANY = 'demo';
const MAX_BYTES = 8_000_000;
const COLLECTIONS = [
  'users',
  'teams',
  'lines',
  'workstations',
  'presence',
  'leaves',
  'checklists',
  'routineTemplates',
  'schedules',
  'routineRuns',
  'actions',
  'comments',
  'anomalies',
  'andonAlerts',
  'sequenceTemplates',
  'sequenceRuns',
  'productionOrders',
  'materialStocks',
  'stockMovements',
  'gembaWalks',
  'qualityChecks',
  'knowledgeItems',
  'favorites',
  'meetings',
  'handovers',
  'announcements',
  'notifications',
  'settings',
  'routineTriggers',
];
const ROLES = ['operator', 'hancho', 'line_leader', 'quality', 'manager', 'admin'];

type Row = Record<string, unknown>;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'Méthode non autorisée.' });
  const admin = serviceClient();
  // Comptes créés par cet appel : supprimés si le chargement échoue (pas de compte orphelin)
  const createdAuthIds: string[] = [];
  try {
    const raw = await req.text();
    if (raw.length > MAX_BYTES) return json(req, 413, { error: 'Jeu de données trop volumineux.' });
    const body = JSON.parse(raw) as { dataset?: Record<string, Row[]>; timezone?: string };
    const dataset = body.dataset;
    if (!dataset || typeof dataset !== 'object') return json(req, 400, { error: 'Jeu de données manquant.' });
    for (const name of COLLECTIONS) {
      if (!Array.isArray(dataset[name]) || dataset[name].length > 5000) return json(req, 400, { error: `Collection invalide : ${name}.` });
    }
    for (const u of dataset.users) {
      if (typeof u.id !== 'string' || typeof u.email !== 'string' || !ROLES.includes(String(u.role)))
        return json(req, 400, { error: 'Utilisateur invalide.' });
    }

    const { data: settings } = await admin.from('settings').select('environment').eq('companyId', COMPANY).maybeSingle();
    if (settings?.environment === 'production') return json(req, 403, { error: 'Réinitialisation interdite en production.' });

    const { count } = await admin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('companyId', COMPANY)
      .not('authId', 'is', null);
    const bootstrap = (count ?? 0) === 0;
    let actorId: string | null = null;
    if (bootstrap) {
      const token = req.headers.get('x-bootstrap-token') ?? '';
      if (!token || (await sha256Hex(token)) !== BOOTSTRAP_TOKEN_SHA256) return json(req, 403, { error: 'Accès refusé.' });
    } else {
      const caller = await callerWithPermission(admin, req, 'settings.manage');
      // Administrateur d'une autre entreprise : refusé (il ne peut pas réinitialiser la démonstration)
      if (!caller || caller.companyId !== COMPANY) {
        await audit(
          admin,
          null,
          'PERMISSION_DENIED',
          'demo-seed',
          null,
          { reason: 'reset sans droit administrateur' },
          await callerCompany(admin, req),
        );
        return json(req, 403, { error: 'Accès refusé.' });
      }
      actorId = caller.appUserId;
    }

    // Comptes d'authentification : conservés s'ils existent, créés sinon (mot de passe aléatoire renvoyé une seule fois)
    const { data: existing, error: listError } = await admin.from('users').select('id, authId').eq('companyId', COMPANY);
    if (listError) throw listError;
    const authById = new Map((existing ?? []).map((u) => [u.id as string, u.authId as string | null]));
    const passwords: Record<string, string> = {};
    // Comptes de démonstration déjà présents dans Auth mais pas encore liés (ex. chargement interrompu) : réutilisés
    const { data: authList, error: authListError } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (authListError) throw authListError;
    // Comptes déjà liés à un profil, toutes entreprises confondues : jamais réutilisés
    const { data: allLinked, error: linkedError } = await admin.from('users').select('authId').not('authId', 'is', null);
    if (linkedError) throw linkedError;
    const linked = new Set((allLinked ?? []).map((u) => u.authId as string));
    const unlinkedDemo = new Map(
      authList.users
        .filter((a) => a.app_metadata?.environment === 'demo' && a.email && !linked.has(a.id))
        .map((a) => [a.email!.toLowerCase(), a.id]),
    );
    for (const u of dataset.users) {
      const known = authById.get(u.id as string);
      if (known) {
        u.authId = known;
        continue;
      }
      const password = temporaryPassword();
      const reusable = unlinkedDemo.get(String(u.email).toLowerCase());
      if (reusable) {
        const { error } = await admin.auth.admin.updateUserById(reusable, { password });
        if (error) throw error;
        u.authId = reusable;
        passwords[String(u.email)] = password;
        continue;
      }
      const email = String(u.email).toLowerCase();
      // Autorisation à usage unique exigée par la base (migration 0010)
      const { error: authorizeError } = await admin.rpc('authorize_account_creation', { p_email: email });
      if (authorizeError) throw authorizeError;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { environment: 'demo' },
      });
      if (error) throw error;
      u.authId = data.user.id;
      createdAuthIds.push(data.user.id);
      passwords[String(u.email)] = password;
    }

    const timezone = typeof body.timezone === 'string' && body.timezone.length <= 64 ? body.timezone : 'Europe/Paris';
    const now = new Date().toISOString();
    const payload = {
      ...dataset,
      workshops: [{ id: 'atelier-1', name: 'Atelier de câblage', createdAt: now, updatedAt: now }],
      lines: dataset.lines.map((l) => ({ ...l, workshopId: 'atelier-1' })),
      settings: dataset.settings.map((s) => ({ ...s, timezone, environment: 'demo' })),
      actorId,
    };
    const { error } = await admin.rpc('seed_demo', { payload });
    if (error) throw error;
    return json(req, 200, {
      ok: true,
      bootstrap,
      passwords: bootstrap ? passwords : undefined,
      createdAccounts: Object.keys(passwords).length,
    });
  } catch (error) {
    // Détail technique dans les journaux serveur uniquement
    console.error('demo-seed', error);
    for (const id of createdAuthIds) await admin.auth.admin.deleteUser(id);
    return json(req, 500, { error: 'Réinitialisation impossible. Consultez les journaux du serveur.' });
  }
});
