import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, anonClient, as, callFunction, configured, passwordOf, tokenOf } from './helpers';

/* Voir docs/SECURITY_TESTS.md. Chaque test simule un client hostile : requêtes directes à l'API, sans l'interface. */

const suite = configured ? describe : describe.skip;
const today = () => new Date().toISOString().slice(0, 10);

suite('Pré-requis', () => {
  it('ne s’exécute que sur un environnement de démonstration', async () => {
    const admin = await as('admin');
    const { data } = await admin.from('settings').select('environment').single();
    expect(data?.environment).toBe('demo');
  });
});

suite('AUTH — authentification', () => {
  it('refuse un mot de passe incorrect', async () => {
    const { error } = await anonClient().auth.signInWithPassword({ email: ACCOUNTS.operatorA.email, password: 'Routines2026' });
    expect(error).not.toBeNull();
  });

  it('refuse l’inscription publique (bloquée par la base, pas seulement par la limite d’emails)', async () => {
    const { data, error } = await anonClient().auth.signUp({
      email: `intrus-${Date.now()}@atelier-test.fr`,
      password: 'Un-mot-de-passe-long-1',
    });
    expect(error).not.toBeNull();
    // 429 = simple limite d'envoi d'emails : ce ne serait PAS un refus d'inscription
    expect(error?.status).not.toBe(429);
    expect(data.session).toBeNull();
  });

  it.each(['users', 'routineRuns', 'actions', 'auditLog', 'settings', 'notifications'])(
    'un visiteur non connecté ne lit rien dans %s',
    async (table) => {
      const { data, error } = await anonClient().from(table).select('*').limit(5);
      // Accès révoqué pour « anon » : erreur de permission ou aucune ligne
      expect(error !== null || (data ?? []).length === 0).toBe(true);
    },
  );

  it('un jeton falsifié est rejeté', async () => {
    const forged =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
      Buffer.from(JSON.stringify({ sub: '00000000-0000-0000-0000-000000000000', role: 'authenticated', exp: 4102444800 })).toString(
        'base64url',
      ) +
      '.c2lnbmF0dXJlLWZhdXNzZQ';
    const res = await callFunction('admin-users', { action: 'create', user: {} }, { token: forged });
    expect(res.status).toBeGreaterThanOrEqual(401);
    expect(res.status).toBeLessThan(404);
  });

  it('un compte désactivé ne peut plus se connecter, et sa session ouverte perd l’accès', async () => {
    const admin = await as('admin');
    const spare = anonClient();
    await spare.auth.signInWithPassword({ email: ACCOUNTS.spare.email, password: passwordOf('spare') });
    try {
      const { error: deactivateError } = await admin.from('users').update({ active: false }).eq('id', ACCOUNTS.spare.id);
      expect(deactivateError).toBeNull();
      // Session encore détenue par le navigateur : la RLS ne la reconnaît plus comme membre actif
      const { data: rows } = await spare.from('andonAlerts').select('id').limit(1);
      expect(rows ?? []).toHaveLength(0);
      const { error } = await anonClient().auth.signInWithPassword({ email: ACCOUNTS.spare.email, password: passwordOf('spare') });
      expect(error).not.toBeNull();
    } finally {
      await admin.from('users').update({ active: true }).eq('id', ACCOUNTS.spare.id);
    }
  });
});

suite('RBAC — rôles et permissions', () => {
  let operator: SupabaseClient;
  beforeAll(async () => {
    operator = await as('operatorA');
  });

  it('un opérateur ne peut pas s’attribuer le rôle administrateur', async () => {
    const { data, error } = await operator.from('users').update({ role: 'admin' }).eq('id', ACCOUNTS.operatorA.id).select();
    expect(error !== null || (data ?? []).length === 0).toBe(true);
    const { data: me } = await operator.from('users').select('role').eq('id', ACCOUNTS.operatorA.id).single();
    expect(me?.role).toBe('operator');
  });

  it('un administrateur ne peut pas modifier son propre rôle', async () => {
    const admin = await as('admin');
    const { error } = await admin.from('users').update({ role: 'operator' }).eq('id', ACCOUNTS.admin.id);
    expect(error?.code).toBe('42501');
  });

  it('un opérateur ne peut pas modifier les paramètres ni les standards', async () => {
    const s = await operator.from('settings').update({ plantName: 'Piraté' }).neq('id', '').select();
    expect(s.error !== null || (s.data ?? []).length === 0).toBe(true);
    const r = await operator.from('routineTemplates').insert({ title: 'Routine pirate' }).select();
    expect(r.error).not.toBeNull();
  });

  it('un opérateur ne peut pas créer de compte (API d’administration)', async () => {
    const res = await callFunction(
      'admin-users',
      { action: 'create', user: { name: 'Intrus', email: `intrus-${Date.now()}@atelier.local`, role: 'admin' } },
      { token: await tokenOf(operator) },
    );
    expect(res.status).toBe(403);
  });

  it('un opérateur ne peut pas réinitialiser le mot de passe d’un autre compte', async () => {
    const res = await callFunction(
      'admin-users',
      { action: 'reset-password', userId: ACCOUNTS.admin.id },
      { token: await tokenOf(operator) },
    );
    expect(res.status).toBe(403);
  });

  it('un manager ne peut pas réinitialiser l’environnement', async () => {
    const res = await callFunction('demo-seed', { dataset: {} }, { token: await tokenOf(await as('manager')) });
    expect([400, 403]).toContain(res.status);
  });

  it('un opérateur ne peut pas réinitialiser l’environnement', async () => {
    const res = await callFunction('demo-seed', { dataset: minimalDataset() }, { token: await tokenOf(operator) });
    expect(res.status).toBe(403);
  });

  it('un jeton d’amorçage inventé ne donne aucun accès', async () => {
    const res = await callFunction('demo-seed', { dataset: minimalDataset() }, { headers: { 'x-bootstrap-token': 'devine' } });
    expect(res.status).toBe(403);
  });

  it('personne ne peut changer l’environnement « demo » / « production » par l’API', async () => {
    const admin = await as('admin');
    const { error } = await admin.from('settings').update({ environment: 'production' }).neq('id', '');
    expect(error?.code).toBe('42501');
  });

  it('les fonctions serveur internes ne sont pas appelables', async () => {
    for (const [fn, args] of [
      ['seed_demo', { payload: {} }],
      ['revoke_user_sessions', { p_auth: '00000000-0000-0000-0000-000000000000' }],
      ['auth_user_has_perm', { p_auth: '00000000-0000-0000-0000-000000000000', p: 'user.manage' }],
      ['authorize_account_creation', { p_email: 'intrus@atelier-test.fr' }],
    ] as const) {
      const { error } = await operator.rpc(fn, args);
      expect(error, fn).not.toBeNull();
    }
  });
});

suite('SCOPE — périmètre des données', () => {
  it('un opérateur ne voit pas les exécutions de l’autre ligne', async () => {
    const operator = await as('operatorA');
    const { data } = await operator.from('routineRuns').select('assigneeId');
    const assignees = new Set((data ?? []).map((r) => r.assigneeId));
    expect(assignees.has(ACCOUNTS.operatorB.id)).toBe(false);
  });

  it('un opérateur ne voit que ses propres notifications', async () => {
    const { data } = await (await as('operatorA')).from('notifications').select('userId');
    expect((data ?? []).every((n) => n.userId === ACCOUNTS.operatorA.id)).toBe(true);
  });

  it('un opérateur ne voit pas les actions qui ne le concernent pas', async () => {
    const { data } = await (await as('operatorA')).from('actions').select('assigneeId, backupId, createdBy');
    const me = ACCOUNTS.operatorA.id;
    expect((data ?? []).every((a) => [a.assigneeId, a.backupId, a.createdBy].includes(me))).toBe(true);
  });

  it('un Line Leader ne voit que les planifications de sa ligne', async () => {
    const leader = await as('lineLeaderA');
    const admin = await as('admin');
    const lineA = 'line-a';
    const teamsA = new Set(((await admin.from('teams').select('id').eq('lineId', lineA)).data ?? []).map((t) => t.id));
    const usersA = new Set(
      ((await admin.from('users').select('id, lineId, teamId')).data ?? [])
        .filter((u) => u.lineId === lineA || teamsA.has(u.teamId))
        .map((u) => u.id),
    );
    const { data } = await leader.from('schedules').select('id, lineId, teamId, assigneeId');
    expect((data ?? []).length).toBeGreaterThan(0);
    const outside = (data ?? []).filter((s) => s.lineId !== lineA && !teamsA.has(s.teamId) && !usersA.has(s.assigneeId));
    expect(outside).toEqual([]);
    // Et au moins une planification existe hors de son périmètre (le test est donc discriminant)
    const all = (await admin.from('schedules').select('id')).data ?? [];
    expect(all.length).toBeGreaterThan((data ?? []).length);
  });

  it('un opérateur ne lit pas la production ni le journal d’audit', async () => {
    const operator = await as('operatorA');
    for (const table of ['productionOrders', 'auditLog']) {
      const { data } = await operator.from(table).select('id').limit(1);
      expect(data ?? [], table).toHaveLength(0);
    }
  });
});

suite('IDOR — accès direct par identifiant', () => {
  let foreignRun: { id: string };
  let foreignAction: { id: string };
  let operator: SupabaseClient;

  beforeAll(async () => {
    operator = await as('operatorA');
    const admin = await as('admin');
    foreignRun = (await admin.from('routineRuns').select('id').eq('assigneeId', ACCOUNTS.operatorB.id).limit(1).single()).data!;
    const me = ACCOUNTS.operatorA.id;
    const { data: actions } = await admin.from('actions').select('id, assigneeId, backupId, createdBy');
    foreignAction = actions!.find((a) => ![a.assigneeId, a.backupId, a.createdBy].includes(me))!;
    expect(foreignRun && foreignAction).toBeTruthy();
  });

  it('GET : une exécution d’un autre opérateur est introuvable', async () => {
    const { data } = await operator.from('routineRuns').select('*').eq('id', foreignRun.id).maybeSingle();
    expect(data).toBeNull();
  });

  it('PATCH : impossible de modifier l’exécution d’un autre', async () => {
    const { data } = await operator.from('routineRuns').update({ comment: 'modifié' }).eq('id', foreignRun.id).select();
    expect(data ?? []).toHaveLength(0);
  });

  it('PATCH : impossible de clore l’action d’un autre', async () => {
    const { data } = await operator.from('actions').update({ status: 'done' }).eq('id', foreignAction.id).select();
    expect(data ?? []).toHaveLength(0);
  });

  it('DELETE : aucune suppression hors droits', async () => {
    const admin = await as('admin');
    const before = (await admin.from('actions').select('id', { count: 'exact', head: true })).count;
    await operator.from('actions').delete().eq('id', foreignAction.id);
    await operator.from('routineRuns').delete().eq('id', foreignRun.id);
    await operator.from('users').delete().eq('id', ACCOUNTS.operatorB.id);
    const after = (await admin.from('actions').select('id', { count: 'exact', head: true })).count;
    expect(after).toBe(before);
    const { data: user } = await admin.from('users').select('id').eq('id', ACCOUNTS.operatorB.id).maybeSingle();
    expect(user).not.toBeNull();
  });

  it('POST : impossible de créer au nom d’un autre utilisateur', async () => {
    const ws = (await operator.from('workstations').select('id').limit(1).single()).data!;
    const andon = await operator
      .from('andonAlerts')
      .insert({ workstationId: ws.id, type: 'quality', urgency: 'low', detail: 'test', status: 'active', raisedBy: ACCOUNTS.operatorB.id })
      .select();
    expect(andon.error).not.toBeNull();
    const action = await operator
      .from('actions')
      .insert({
        title: 'Action usurpée',
        assigneeId: ACCOUNTS.operatorA.id,
        priority: 'low',
        status: 'todo',
        dueDate: today(),
        source: { type: 'manual' },
        createdBy: ACCOUNTS.admin.id,
      })
      .select();
    expect(action.error).not.toBeNull();
  });

  it('POST : impossible de créer une notification pour autrui', async () => {
    const { error } = await operator.from('notifications').insert({ userId: ACCOUNTS.admin.id, kind: 'access_request', title: 'faux' });
    expect(error).not.toBeNull();
  });
});

suite('DATA — validation et intégrité', () => {
  it('refuse un lien de connaissance non https (javascript:)', async () => {
    const admin = await as('admin');
    const { error } = await admin.from('knowledgeItems').insert({
      code: `XSS${Date.now() % 100000}`,
      title: 'Lien',
      category: 'safety',
      kind: 'link',
      summary: 'test',
      url: 'javascript:alert(1)',
      version: '1',
      owner: 'test',
      status: 'draft',
    });
    expect(error?.code).toBe('23514');
  });

  it('refuse une photo qui n’est pas une image JPEG encodée', async () => {
    const operator = await as('operatorA');
    const { error } = await operator.from('anomalies').insert({
      description: 'Photo piégée',
      category: 'other',
      severity: 'minor',
      status: 'open',
      reportedBy: ACCOUNTS.operatorA.id,
      origin: { type: 'manual' },
      photo: 'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+',
    });
    expect(error?.code).toBe('23514');
  });

  it('refuse un texte trop long', async () => {
    const operator = await as('operatorA');
    const { error } = await operator.from('anomalies').insert({
      description: 'x'.repeat(2001),
      category: 'other',
      severity: 'minor',
      status: 'open',
      reportedBy: ACCOUNTS.operatorA.id,
      origin: { type: 'manual' },
    });
    expect(error?.code).toBe('23514');
  });

  it('impose les horodatages serveur (createdAt falsifié ignoré)', async () => {
    const operator = await as('operatorA');
    const { data, error } = await operator
      .from('anomalies')
      .insert({
        description: '<img src=x onerror=alert(1)> stocké tel quel, jamais interprété',
        category: 'other',
        severity: 'minor',
        status: 'open',
        reportedBy: ACCOUNTS.operatorA.id,
        origin: { type: 'manual' },
        createdAt: '2001-01-01T00:00:00Z',
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(new Date(data!.createdAt).getFullYear()).toBeGreaterThan(2020);
    expect(data!.description).toContain('<img');
  });

  it('saisie d’une routine : auteur imposé par le serveur, pas d’écrasement global des résultats', async () => {
    const leader = await as('lineLeaderA');
    const { data: run } = await leader
      .from('routineRuns')
      .select('id, results')
      .eq('assigneeId', ACCOUNTS.lineLeaderA.id)
      .is('completedAt', null)
      .limit(1)
      .maybeSingle();
    expect(run, 'exécution en cours attendue dans le jeu du jour (sc-ll-safety)').toBeTruthy();
    const direct = await leader.from('routineRuns').update({ results: {} }).eq('id', run!.id);
    expect(direct.error?.code).toBe('42501');
    const { data, error } = await leader.rpc('record_run_result', {
      p_run: run!.id,
      p_key: 'test-securite',
      p_result: { status: 'ok', by: ACCOUNTS.admin.id, at: '2001-01-01T00:00:00Z' },
    });
    expect(error).toBeNull();
    const saved = (data as { results: Record<string, { by: string; at: string }> }).results['test-securite'];
    expect(saved.by).toBe(ACCOUNTS.lineLeaderA.id);
    expect(new Date(saved.at).getFullYear()).toBeGreaterThan(2020);
    // Les saisies existantes sont conservées
    for (const key of Object.keys(run!.results as object)) expect((data as { results: object }).results).toHaveProperty([key]);
  });

  it('saisie d’une routine : impossible sur l’exécution d’un autre', async () => {
    const admin = await as('admin');
    const foreign = (await admin.from('routineRuns').select('id').eq('assigneeId', ACCOUNTS.operatorB.id).limit(1).single()).data!;
    const { error } = await (await as('operatorA')).rpc('record_run_result', { p_run: foreign.id, p_key: 'x', p_result: { status: 'ok' } });
    expect(error).not.toBeNull();
  });

  it('refuse de modifier l’email ou la dernière connexion d’un compte', async () => {
    const admin = await as('admin');
    const email = await admin.from('users').update({ email: 'autre@atelier.local' }).eq('id', ACCOUNTS.operatorB.id);
    expect(email.error?.code).toBe('42501');
    const last = await admin.from('users').update({ lastSignInAt: '2001-01-01T00:00:00Z' }).eq('id', ACCOUNTS.operatorB.id);
    expect(last.error?.code).toBe('42501');
  });
});

suite('API — journal d’audit, limitation de débit, CORS', () => {
  it('le journal d’audit est lisible par l’administrateur mais ni modifiable ni supprimable', async () => {
    const admin = await as('admin');
    const { data } = await admin.from('auditLog').select('id, event').order('at', { ascending: false }).limit(1).single();
    expect(data).toBeTruthy();
    const upd = await admin.from('auditLog').update({ event: 'EFFACÉ' }).eq('id', data!.id).select();
    expect(upd.error !== null || (upd.data ?? []).length === 0).toBe(true);
    await admin.from('auditLog').delete().eq('id', data!.id);
    const ins = await admin.from('auditLog').insert({ event: 'FAUX', resource: 'x' });
    expect(ins.error).not.toBeNull();
    const { data: still } = await admin.from('auditLog').select('event').eq('id', data!.id).single();
    expect(still?.event).toBe(data!.event);
  });

  it('les connexions et refus d’accès sont journalisés par le serveur', async () => {
    const operator = await as('operatorA');
    await callFunction('admin-users', { action: 'reset-password', userId: ACCOUNTS.admin.id }, { token: await tokenOf(operator) });
    await operator.rpc('record_sign_in');
    const admin = await as('admin');
    const { data } = await admin
      .from('auditLog')
      .select('event')
      .gte('at', new Date(Date.now() - 5 * 60_000).toISOString());
    const events = new Set((data ?? []).map((e) => e.event));
    expect(events.has('PERMISSION_DENIED')).toBe(true);
    expect(events.has('USER_LOGIN')).toBe(true);
  });

  it('limite le déclenchement d’alertes Andon en rafale', async () => {
    const operator = await as('operatorA');
    const stations = (await operator.from('workstations').select('id')).data ?? [];
    // Un seul Andon actif par type et par poste : on varie poste et type pour atteindre la limite (10 / 10 min)
    const attempts = stations.flatMap((w) => ['quality', 'equipment', 'material', 'safety'].map((type) => ({ w: w.id, type })));
    let accepted = 0;
    let refused = false;
    for (const { w, type } of attempts) {
      const { error } = await operator
        .from('andonAlerts')
        .insert({ workstationId: w, type, urgency: 'low', detail: 'rafale', status: 'active', raisedBy: ACCOUNTS.operatorA.id });
      if (!error) accepted++;
      if (error?.code === '54000') {
        refused = true;
        break;
      }
    }
    expect(refused).toBe(true);
    expect(accepted).toBeLessThanOrEqual(10);
  });

  it('limite les demandes « mot de passe oublié » par identifiant', async () => {
    const admin = await as('admin');
    const since = new Date().toISOString();
    for (let i = 0; i < 6; i++) await anonClient().rpc('request_access_help', { p_identifier: ACCOUNTS.spare.email });
    const { data } = await admin.from('notifications').select('id').eq('kind', 'access_request').gte('createdAt', since);
    expect((data ?? []).length).toBeLessThanOrEqual(3);
  });

  it('CORS : aucune origine étrangère n’est autorisée', async () => {
    const res = await callFunction('admin-users', {}, { origin: 'https://attaquant.example' });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    const ok = await callFunction('admin-users', {}, { origin: 'https://routine-rose-five.vercel.app' });
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://routine-rose-five.vercel.app');
  });
});

suite('Régressions corrigées (migration 0013)', () => {
  it('une annonce peut être retirée par qui peut l’écrire, pas par un opérateur', async () => {
    const manager = await as('manager');
    const { data: created, error } = await manager
      .from('announcements')
      .insert({ text: 'Annonce de test', date: today(), authorId: ACCOUNTS.manager.id })
      .select('id')
      .single();
    expect(error).toBeNull();
    const byOperator = await (await as('operatorA')).from('announcements').delete().eq('id', created!.id).select('id');
    expect(byOperator.data ?? []).toHaveLength(0);
    const byManager = await manager.from('announcements').delete().eq('id', created!.id).select('id');
    expect(byManager.data ?? []).toHaveLength(1);
  });

  it('la notification Andon porte le libellé français du type', async () => {
    // Opérateur de la ligne B : le quota d'Andon de l'opérateur A est consommé par le test de limitation de débit
    const operator = await as('operatorB');
    // Un seul Andon actif par type et par poste : premier poste de la ligne B libre pour un Andon « équipement »
    let alert: { id: string } | null = null;
    for (const workstationId of ['ws-p5', 'ws-p6', 'ws-p7', 'ws-p8']) {
      const res = await operator
        .from('andonAlerts')
        .insert({ workstationId, type: 'equipment', urgency: 'low', detail: 'test', status: 'active', raisedBy: ACCOUNTS.operatorB.id })
        .select('id')
        .single();
      if (!res.error) {
        alert = res.data;
        break;
      }
      expect(res.error.code).toBe('23505');
    }
    expect(alert).not.toBeNull();
    const { data } = await (await as('manager')).from('notifications').select('title').eq('link', `/andon/${alert!.id}`);
    expect((data ?? []).map((n) => n.title)).toEqual([expect.stringMatching(/^Andon équipement — /)]);
  });

  it('les invités sont prévenus d’un changement d’heure de réunion, pas d’un simple compte-rendu', async () => {
    const manager = await as('manager');
    const operator = await as('operatorA');
    const { data: meeting } = await manager.from('meetings').select('id, startTime').eq('id', 'mt-today').single();
    const count = async () =>
      ((await operator.from('notifications').select('id').eq('link', '/reunions/mt-today').like('title', 'Réunion modifiée%')).data ?? [])
        .length;
    const before = await count();
    await manager.from('meetings').update({ minutes: 'Compte-rendu de test' }).eq('id', 'mt-today');
    expect(await count()).toBe(before);
    const later = meeting!.startTime === '16:00';
    const { error } = await manager
      .from('meetings')
      .update({ startTime: later ? '16:30' : '16:00', endTime: later ? '17:00' : '16:30' })
      .eq('id', 'mt-today');
    expect(error).toBeNull();
    expect(await count()).toBe(before + 1);
  });
});

suite('TELEMETRY — erreurs et fréquentation (migration 0016)', () => {
  it('un visiteur non connecté ne peut ni signaler ni compter', async () => {
    const anon = anonClient();
    const r1 = await anon.rpc('track_screen_view', { p_route: '/andon' });
    const r2 = await anon.rpc('report_client_error', {
      p_message: 'x',
      p_stack: null,
      p_route: '/',
      p_source: 'window',
      p_version: null,
      p_agent: null,
    });
    expect(r1.error).not.toBeNull();
    expect(r2.error).not.toBeNull();
  });

  it('un opérateur signale et compte, mais ne lit pas le suivi', async () => {
    const operator = await as('operatorA');
    expect((await operator.rpc('track_screen_view', { p_route: '/app/routines' })).error).toBeNull();
    const marker = `Erreur de test sécurité ${Date.now()}`;
    expect(
      (
        await operator.rpc('report_client_error', {
          p_message: marker,
          p_stack: 'Error\n    at test',
          p_route: '/app',
          p_source: 'react',
          p_version: 'test',
          p_agent: 'vitest',
        })
      ).error,
    ).toBeNull();
    for (const table of ['errorReports', 'usageDaily']) {
      const { data } = await operator.from(table).select('*').limit(5);
      expect(data ?? []).toHaveLength(0);
    }
    const admin = await as('admin');
    const { data } = await admin.from('errorReports').select('message, role, route, count').eq('message', marker);
    // Rôle conservé, aucune identité de personne
    expect(data).toEqual([{ message: marker, role: 'operator', route: '/app', count: 1 }]);
  });

  it('aucune écriture directe dans les tables de suivi, même pour l’administrateur', async () => {
    const admin = await as('admin');
    const insert = await admin.from('usageDaily').insert({ day: today(), route: '/faux', role: 'admin', views: 999 });
    expect(insert.error).not.toBeNull();
    const update = await admin.from('errorReports').update({ count: 1 }).neq('id', '');
    expect((update.data ?? []).length).toBe(0);
  });

  it('refuse une adresse d’écran invalide et un type d’erreur inconnu (sans erreur visible)', async () => {
    const operator = await as('operatorA');
    expect((await operator.rpc('track_screen_view', { p_route: 'javascript:alert(1)' })).error).toBeNull();
    const admin = await as('admin');
    const { data } = await admin.from('usageDaily').select('route').eq('route', 'javascript:alert(1)');
    expect(data ?? []).toHaveLength(0);
  });
});

afterAll(async () => {
  if (!configured) return;
  // Remise en état de l'environnement de démonstration (alertes et anomalies créées par les tests)
  // Imports résolus par Vitest à l'exécution : le code de l'application n'est pas typé avec la configuration Node
  const dateModule = '../../src/utils/date';
  const seedModule = '../../src/data/demo/seed';
  const { setPlantTimeZone } = (await import(/* @vite-ignore */ dateModule)) as { setPlantTimeZone: (tz: string | null) => boolean };
  const { buildDemoData } = (await import(/* @vite-ignore */ seedModule)) as { buildDemoData: (now: Date) => unknown };
  // Jeu daté selon le fuseau de l'atelier (settings.timezone), pas celui du poste
  const { data: settings } = await (await as('admin')).from('settings').select('timezone').single();
  setPlantTimeZone(settings?.timezone ?? null);
  const res = await callFunction('demo-seed', { dataset: buildDemoData(new Date()) }, { token: await tokenOf(await as('admin')) });
  if (res.status !== 200) throw new Error(`Remise en état impossible : ${res.status}`);
});

function minimalDataset() {
  const names = [
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
  return Object.fromEntries(names.map((n) => [n, []]));
}
