import { afterAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import { ACCOUNTS, KEY, URL, as, callFunction, configured, tokenOf } from './helpers';

/* Séparation entre entreprises clientes, contre le serveur de test, par l'API publique uniquement.
   Prérequis : une seconde entreprise créée par la fonction create-company, dont l'administrateur figure dans
   le fichier des comptes (SECURITY_ACCOUNTS_FILE) ; son email est donné par SECURITY_OTHER_ADMIN_EMAIL. */

const otherEmail = process.env.SECURITY_OTHER_ADMIN_EMAIL ?? '';
const accountsFile = process.env.SECURITY_ACCOUNTS_FILE;
const otherPassword =
  accountsFile && fs.existsSync(accountsFile)
    ? ((JSON.parse(fs.readFileSync(accountsFile, 'utf8')) as Record<string, string>)[otherEmail] ?? '')
    : '';
const ready = configured && Boolean(otherEmail && otherPassword);

let other: SupabaseClient;
const created: { workstations: string[]; lines: string[] } = { workstations: [], lines: [] };
const DEMO_COLLECTIONS = [
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

async function otherAdmin(): Promise<SupabaseClient> {
  if (!other) {
    other = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await other.auth.signInWithPassword({ email: otherEmail, password: otherPassword });
    if (error) throw new Error(`Connexion impossible pour l’administrateur de l’autre entreprise : ${error.message}`);
  }
  return other;
}

describe.skipIf(!ready)('séparation des entreprises', () => {
  afterAll(async () => {
    // Nettoyage des données de test de l'autre entreprise
    if (other && created.workstations.length) await other.from('workstations').delete().in('id', created.workstations);
    if (other && created.lines.length) await other.from('lines').delete().in('id', created.lines);
  });

  it('chaque administrateur ne voit que son entreprise', async () => {
    const demo = await as('admin');
    const o = await otherAdmin();
    const demoUsers = (await demo.from('users').select('email')).data ?? [];
    const otherUsers = (await o.from('users').select('email')).data ?? [];
    expect(demoUsers.map((u) => u.email)).not.toContain(otherEmail);
    expect(otherUsers.map((u) => u.email)).not.toContain(ACCOUNTS.admin.email);
    expect((await o.from('companies').select('id')).data).toHaveLength(1);
    expect((await o.from('companies').select('id').eq('id', 'demo')).data).toHaveLength(0);
    for (const table of ['routineRuns', 'anomalies', 'actions', 'andonAlerts', 'auditLog', 'notifications', 'productionOrders']) {
      const { data } = await o.from(table).select('companyId');
      expect(
        (data ?? []).every((r) => r.companyId !== 'demo'),
        table,
      ).toBe(true);
    }
  });

  it('une écriture ne peut pas viser une autre entreprise', async () => {
    const o = await otherAdmin();
    const { data: line } = await o.from('lines').insert({ code: 'T1', name: 'Ligne test', companyId: 'demo' }).select().single();
    expect(line?.companyId).not.toBe('demo');
    created.lines.push(line!.id);
    const { data: moved, error } = await o.from('lines').update({ companyId: 'demo' }).eq('id', line!.id).select();
    expect(error ?? (moved ?? []).length === 0).toBeTruthy();
    // Modifier ou supprimer une donnée de la démo : aucune ligne touchée
    const { data: updated } = await o.from('lines').update({ name: 'piraté' }).eq('id', 'line-a').select();
    expect(updated ?? []).toHaveLength(0);
    const { data: ws } = await o
      .from('workstations')
      .insert({ code: 'P1', name: 'Poste test', process: 'Test', lineId: line!.id, mapX: 10, mapY: 10 })
      .select()
      .single();
    // Le code « P1 » existe déjà dans la démo : unique par entreprise seulement
    expect(ws?.code).toBe('P1');
    created.workstations.push(ws!.id);
  });

  it('les fonctions serveur restent dans l’entreprise de l’appelant', async () => {
    const token = await tokenOf(await otherAdmin());
    const reset = await callFunction('admin-users', { action: 'reset-password', userId: 'u-nadia' }, { token });
    expect(reset.status).toBe(404);
    // Jeu de données valide mais vide : seul le contrôle de l'appelant peut le refuser
    const seed = await callFunction('demo-seed', { dataset: Object.fromEntries(DEMO_COLLECTIONS.map((n) => [n, []])) }, { token });
    expect(seed.status).toBe(403);
    const company = await callFunction('create-company', { name: 'Pirate', sector: 'generic', admin: { name: 'X', email: 'x@y.fr' } });
    expect(company.status).toBe(403);
  });
});
