import { afterEach, describe, expect, it } from 'vitest';
import { ANDON_PRESETS } from '@/features/andon/model';
import { ANOMALY_CATEGORY, PRODUCTION_STAGE, PRODUCTION_STAGES, SHIFT_SHORT } from '@/features/shared/labels';
import { ROLE_LABELS } from '@/services/auth/permissions';
import { validate } from '@/features/admin/CatalogPage';
import { DEFAULT_CATALOG, activeShifts, applyCatalog, keyFromLabel, resolveCatalog, shiftOptions, stageLabel } from './catalog';

afterEach(() => applyCatalog(resolveCatalog()));

describe('Catalogue du site', () => {
  it('sans réglage, les valeurs génériques s’appliquent', () => {
    const c = resolveCatalog(undefined);
    expect(c).toEqual(DEFAULT_CATALOG);
    expect(c.roleLabels.hancho).toBe('Chef d’équipe');
  });

  it('complète un réglage partiel et écarte les valeurs invalides', () => {
    const c = resolveCatalog({
      productionStages: [
        { key: 'pesee', label: 'Pesée' },
        { key: 'pesee', label: 'Doublon' },
        { key: '', label: 'Sans clé' },
      ],
      roleLabels: { hancho: '  Animateur  ' } as never,
      shifts: { afternoon: { label: 'Nuit longue', short: 'N', active: false }, morning: { active: true } } as never,
    });
    expect(c.productionStages).toEqual([{ key: 'pesee', label: 'Pesée' }]);
    expect(c.roleLabels.hancho).toBe('Animateur');
    expect(c.roleLabels.operator).toBe('Opérateur');
    expect(c.shifts.afternoon).toEqual({ label: 'Nuit longue', short: 'N', active: false });
    expect(c.anomalyCategories).toEqual(DEFAULT_CATALOG.anomalyCategories);
  });

  it('garde toujours au moins un poste horaire utilisable', () => {
    const c = resolveCatalog({
      shifts: { morning: { active: false }, afternoon: { active: false }, night: { active: false } } as never,
    });
    expect(c.shifts.morning.active).toBe(true);
  });

  it('s’applique aux listes partagées de toute l’application', () => {
    applyCatalog(
      resolveCatalog({
        productionStages: [
          { key: 'pesee', label: 'Pesée' },
          { key: 'cuisson', label: 'Cuisson' },
        ],
        anomalyCategories: [{ key: 'allergene', label: 'Allergène' }],
        andonPresets: { quality: ['Corps étranger'] } as never,
        roleLabels: { line_leader: 'Pilote de ligne' } as never,
        shifts: { night: { label: 'Équipe de nuit', short: 'Nuit', active: false } } as never,
      }),
    );
    expect(PRODUCTION_STAGES).toEqual(['pesee', 'cuisson']);
    expect(PRODUCTION_STAGE).toEqual({ pesee: 'Pesée', cuisson: 'Cuisson' });
    expect(ANOMALY_CATEGORY).toEqual({ allergene: 'Allergène' });
    expect(ANDON_PRESETS.quality).toEqual(['Corps étranger']);
    expect(ROLE_LABELS.line_leader).toBe('Pilote de ligne');
    expect(activeShifts).toEqual(['morning', 'afternoon']);
    expect(SHIFT_SHORT.night).toBe('Nuit');
  });

  it('une étape retirée reste lisible, un poste retiré reste proposé pour la valeur actuelle', () => {
    applyCatalog(resolveCatalog({ shifts: { night: { label: 'Nuit', short: 'Nuit', active: false } } as never }));
    expect(stageLabel('etape-supprimee')).toBe('etape-supprimee');
    expect(shiftOptions('short').map((o) => o.value)).toEqual(['morning', 'afternoon']);
    expect(shiftOptions('short', 'night').map((o) => o.value)).toEqual(['morning', 'afternoon', 'night']);
  });

  it('dérive une clé stable et unique d’un libellé', () => {
    expect(keyFromLabel('Contrôle final')).toBe('controle-final');
    expect(keyFromLabel('Contrôle final', ['controle-final'])).toBe('controle-final-2');
    expect(keyFromLabel('!!!')).toBe('element');
  });

  it('refuse un catalogue incohérent', () => {
    expect(validate(DEFAULT_CATALOG)).toBeNull();
    expect(validate({ ...DEFAULT_CATALOG, productionStages: [] })).toMatch(/au moins une étape/);
    expect(
      validate({
        ...DEFAULT_CATALOG,
        anomalyCategories: [
          { key: 'a', label: 'Qualité' },
          { key: 'b', label: 'qualité' },
        ],
      }),
    ).toMatch(/même nom/);
    expect(validate({ ...DEFAULT_CATALOG, roleLabels: { ...DEFAULT_CATALOG.roleLabels, admin: ' ' } })).toMatch(/rôle/);
  });
});
