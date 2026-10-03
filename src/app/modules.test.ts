import { describe, expect, it } from 'vitest';
import { roleCan, type Permission } from '@/services/auth/permissions';
import { moduleEnabled, moduleOfPath, MODULE_KEYS } from './modules';
import { SECTIONS, SPACES, sectionOf, visibleGroups } from './navigation';

const space = (id: string) => SPACES.find((s) => s.id === id)!;
const paths = (id: string, can: (p: Permission) => boolean, enabled?: (p: string) => boolean) =>
  visibleGroups(space(id), can, enabled).flatMap((g) => g.items.map((i) => i.path));

describe('Modules activables', () => {
  it('rattache chaque écran à son module', () => {
    expect(moduleOfPath('/manager/gemba/nouvelle')).toBe('gemba');
    expect(moduleOfPath('/gemba/gw-1')).toBe('gemba');
    expect(moduleOfPath('/sequences/execution/r1')).toBe('sequences');
    expect(moduleOfPath('/manager/atelier')).toBe('production');
    expect(moduleOfPath('/manager/production?vue=stocks')).toBe('production');
    expect(moduleOfPath('/manager/routines')).toBeNull();
    expect(moduleOfPath('/andon')).toBeNull();
  });

  it('un module est actif sauf s’il est décoché ; la BI exige un outil connecté', () => {
    expect(moduleEnabled('gemba', [], false)).toBe(true);
    expect(moduleEnabled('gemba', ['gemba'], false)).toBe(false);
    expect(moduleEnabled('bi', [], false)).toBe(false);
    expect(moduleEnabled('bi', [], true)).toBe(true);
    expect(moduleEnabled('bi', ['bi'], true)).toBe(false);
  });

  it('la liste des modules correspond à la contrainte du serveur', () => {
    expect(MODULE_KEYS).toEqual(['production', 'quality', 'gemba', 'sequences', 'knowledge', 'bi', 'erp']);
  });
});

describe('Menu regroupé', () => {
  const admin = (p: Permission) => roleCan('admin', p);

  it('une seule entrée par section, menant au premier onglet', () => {
    const items = paths('admin', admin);
    expect(items).toContain('/admin/agenda');
    expect(items).not.toContain('/admin/reunions');
    expect(items).not.toContain('/admin/checklists');
    expect(items).not.toContain('/admin/equipes');
    expect(paths('supervision', admin)).not.toContain('/manager/atelier');
  });

  it('chaque écran de section appartient à une seule section', () => {
    const all = SECTIONS.flat().map((t) => t.path);
    expect(new Set(all).size).toBe(all.length);
    expect(sectionOf('/admin/reunions')?.map((t) => t.path)).toEqual(['/admin/agenda', '/admin/reunions']);
  });

  it('un module désactivé disparaît du menu', () => {
    const noGemba = (p: string) => moduleOfPath(p) !== 'gemba' && moduleOfPath(p) !== 'production';
    const items = paths('supervision', admin, noGemba);
    expect(items).not.toContain('/manager/gemba');
    expect(items).not.toContain('/manager/production');
    expect(items).toContain('/manager/anomalies');
  });
});
