import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError, PermissionError } from '@/services/errors';
import { createHttpDataSource } from './httpDataSource';

/* Contrat REST du mode « api » (docs/deployment.md §3), vérifié avec un fetch simulé. */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('httpDataSource', () => {
  it('construit les URL en kebab-case, transmet les filtres et le jeton', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json([{ id: '1' }]));
    vi.stubGlobal('fetch', fetchMock);
    const ds = createHttpDataSource('https://api.test/v1/', () => 'jeton');

    await ds.repo('routineRuns').list({ where: { date: '2026-09-29' } });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.test/v1/routine-runs?date=2026-09-29');
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer jeton');
  });

  it('crée, modifie et supprime', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ id: 'a1' }, 201))
      .mockResolvedValueOnce(json({ id: 'a1', title: 'B' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const repo = createHttpDataSource('https://api.test', () => null).repo('actions');

    await repo.create({ title: 'A' } as never);
    await repo.update('a1', { title: 'B' });
    await expect(repo.remove('a1')).resolves.toBeUndefined();

    expect(fetchMock.mock.calls.map(([u, i]) => `${i.method} ${u}`)).toEqual([
      'POST https://api.test/actions',
      'PATCH https://api.test/actions/a1',
      'DELETE https://api.test/actions/a1',
    ]);
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual({ title: 'B' });
    expect(fetchMock.mock.calls[0]![1].headers.Authorization).toBeUndefined();
  });

  it('distingue refus de droits, erreur serveur et panne réseau', async () => {
    const ds = createHttpDataSource('https://api.test', () => null);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('interdit', { status: 403 })));
    await expect(ds.repo('users').list()).rejects.toBeInstanceOf(PermissionError);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 500 })));
    const serverError = await ds
      .repo('users')
      .list()
      .catch((e: unknown) => e);
    expect(serverError).toBeInstanceOf(ApiError);
    expect((serverError as ApiError).status).toBe(500);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(ds.repo('users').list()).rejects.toBeInstanceOf(NetworkError);
  });
});
