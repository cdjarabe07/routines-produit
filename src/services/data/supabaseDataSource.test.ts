import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseDataSource } from './supabaseDataSource';

/* Faux serveur PostgREST : applique les filtres, l'ordre et la plage demandés, puis coupe à `maxRows`
   sans le signaler — comme le réglage « Max rows » de Supabase. Compte les requêtes reçues. */
function fakeServer(rows: Record<string, unknown>[], maxRows: number) {
  const stats = { requests: 0 };
  const client = {
    from: () => {
      const eqs: [string, unknown][] = [];
      let withCount = false;
      let orderBy: string | null = null;
      const builder = {
        select: (_cols: string, opts?: { count?: string }) => {
          withCount = opts?.count === 'exact';
          return builder;
        },
        eq: (k: string, v: unknown) => {
          eqs.push([k, v]);
          return builder;
        },
        order: (k: string) => {
          orderBy = k;
          return builder;
        },
        range: async (from: number, to: number) => {
          stats.requests++;
          let data = rows.filter((r) => eqs.every(([k, v]) => r[k] === v));
          const count = data.length;
          if (orderBy) data = [...data].sort((a, b) => String(a[orderBy!]).localeCompare(String(b[orderBy!])));
          data = data.slice(from, Math.min(to + 1, from + maxRows));
          return { data, error: null, count: withCount ? count : null };
        },
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, stats };
}

const make = (n: number, extra: (i: number) => Record<string, unknown> = () => ({})) =>
  Array.from({ length: n }, (_, i) => ({ id: `qc-${String(i).padStart(5, '0')}`, value: i, ...extra(i) }));

describe('Lecture complète malgré la limite de lignes du serveur', () => {
  it('lit toutes les lignes au-delà de 1 000 (serveur plafonné à 1 000)', async () => {
    const { client, stats } = fakeServer(make(2_500), 1_000);
    const rows = await createSupabaseDataSource(client).repo('qualityChecks').list();
    expect(rows).toHaveLength(2_500);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2_500);
    expect(stats.requests).toBe(3);
  });

  it('reste complète si le serveur est plafonné en dessous de la taille de page (300)', async () => {
    const { client } = fakeServer(make(1_450), 300);
    const rows = await createSupabaseDataSource(client).repo('qualityChecks').list();
    expect(rows).toHaveLength(1_450);
    expect(new Set(rows.map((r) => r.id)).size).toBe(1_450);
  });

  it('applique le filtre sur toutes les pages', async () => {
    const { client } = fakeServer(
      make(3_000, (i) => ({ workstationId: i % 3 === 0 ? 'ws-p1' : 'ws-p2' })),
      1_000,
    );
    const rows = await createSupabaseDataSource(client)
      .repo('qualityChecks')
      .list({ where: { workstationId: 'ws-p1' } });
    expect(rows).toHaveLength(1_000);
    expect(rows.every((r) => r.workstationId === 'ws-p1')).toBe(true);
  });

  it('une seule requête pour une petite collection ou une collection vide', async () => {
    const small = fakeServer(make(12), 1_000);
    expect(await createSupabaseDataSource(small.client).repo('qualityChecks').list()).toHaveLength(12);
    expect(small.stats.requests).toBe(1);
    const empty = fakeServer([], 1_000);
    expect(await createSupabaseDataSource(empty.client).repo('qualityChecks').list()).toEqual([]);
    expect(empty.stats.requests).toBe(1);
  });
});
