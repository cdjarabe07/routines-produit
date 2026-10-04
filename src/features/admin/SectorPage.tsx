import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { MODULES } from '@/app/modules';
import { useDataSource } from '@/app/providers/DataSourceProvider';
import { QueryBoundary } from '@/components/feedback/States';
import { PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { Checkbox, TextField } from '@/components/ui/Field';
import { SECTOR_KEYS, SECTOR_TEMPLATES, isExampleValue, type SectorKey } from '@/data/sectors';
import { useSettings } from '@/features/shared/api';
import { cx } from '@/utils/cx';
import { adjustableChecks, overrideKey, useApplySectorTemplate, type ValueOverride } from './sectorTemplates';
import styles from './SectorPage.module.css';

/** Modèle de secteur : pré-remplit référentiels, checklists et routines types, personnalisés avant application. */
export function SectorPage() {
  const query = useSettings();
  const [selected, setSelected] = useState<SectorKey | null>(null);
  const current = query.settings.sectorTemplate;
  const choice = selected ?? current ?? 'generic';

  return (
    <>
      <PageHeader
        title="Modèle de secteur"
        description="Choisissez le modèle le plus proche de votre activité, retenez ce qui vous sert et adaptez les valeurs d’exemple avant de l’appliquer. Tout reste ensuite modifiable."
      />
      <QueryBoundary queries={[query]}>
        {() => (
          <Stack>
            {!current && (
              <p className={styles.intro} role="note">
                Mise en route : appliquez un modèle, puis planifiez les routines proposées et créez les comptes de vos équipes.
              </p>
            )}
            <div className={styles.grid} role="radiogroup" aria-label="Secteurs">
              {SECTOR_KEYS.map((key) => {
                const t = SECTOR_TEMPLATES[key];
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={choice === key}
                    className={cx(styles.card, choice === key && styles.selected)}
                    onClick={() => setSelected(key)}
                  >
                    <span className={styles.cardTitle}>
                      {t.label}
                      {current === key && <Badge tone="success">Appliqué</Badge>}
                    </span>
                    <span className={styles.cardText}>{t.description}</span>
                  </button>
                );
              })}
            </div>
            {/* Personnalisation propre à chaque modèle : réinitialisée quand on change de secteur */}
            <Customize key={choice} sector={choice} applied={current === choice} alreadyConfigured={Boolean(current)} />
          </Stack>
        )}
      </QueryBoundary>
    </>
  );
}

function Customize({ sector, applied, alreadyConfigured }: { sector: SectorKey; applied: boolean; alreadyConfigured: boolean }) {
  const template = SECTOR_TEMPLATES[sector];
  const ds = useDataSource();
  const apply = useApplySectorTemplate();
  const confirm = useConfirm();
  const [routines, setRoutines] = useState(() => new Set(template.routines.map((r) => r.title)));
  const [checklists, setChecklists] = useState(() => new Set(template.checklists.map((c) => c.name)));
  // Bornes saisies (texte brut) ; seules les bornes modifiées sont transmises à l'application
  const [values, setValues] = useState<Record<string, { min?: string; max?: string; unit?: string }>>({});
  const [replaceCatalog, setReplaceCatalog] = useState(true);
  const [applyModules, setApplyModules] = useState(true);

  // Checklists utilisées par une routine retenue : toujours créées
  const required = useMemo(
    () =>
      new Set(
        template.routines.filter((r) => routines.has(r.title)).flatMap((r) => r.tasks.map((t) => t.checklist).filter(Boolean) as string[]),
      ),
    [template, routines],
  );
  const toggle = (set: Set<string>, value: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(value);
    else next.delete(value);
    return next;
  };
  const setBound = (key: string, field: 'min' | 'max' | 'unit', raw: string) =>
    setValues((v) => ({ ...v, [key]: { ...v[key], [field]: raw } }));
  const toNumber = (raw: string | undefined, fallback: number | undefined) =>
    raw === undefined ? fallback : raw.trim() === '' ? undefined : Number(raw.replace(',', '.'));
  const overrides = useMemo(() => {
    const out: Record<string, ValueOverride> = {};
    for (const r of template.routines)
      for (const c of adjustableChecks(r)) {
        const v = values[overrideKey(r.title, c.id)];
        if (v) out[overrideKey(r.title, c.id)] = { min: toNumber(v.min, c.min), max: toNumber(v.max, c.max), unit: v.unit ?? c.unit };
      }
    return out;
  }, [template, values]);
  const invalid = Object.values(overrides).some(
    (o) =>
      (o.min !== undefined && Number.isNaN(o.min)) ||
      (o.max !== undefined && Number.isNaN(o.max)) ||
      (o.min !== undefined && o.max !== undefined && o.min > o.max),
  );

  return (
    <section className={styles.preview} aria-labelledby="apercu">
      <h2 id="apercu" className={styles.previewTitle}>
        Personnaliser le modèle « {template.label} »
      </h2>

      <div className={styles.block}>
        <h3>Étapes de fabrication</h3>
        <p>{(template.catalog.productionStages ?? []).map((s) => s.label).join(' → ') || 'Étapes génériques'}</p>
      </div>

      <fieldset className={styles.block}>
        <legend>Routines à créer</legend>
        <ul className={styles.choices}>
          {template.routines.map((r) => {
            const checks = adjustableChecks(r);
            const on = routines.has(r.title);
            return (
              <li key={r.title}>
                <Checkbox
                  label={r.title}
                  description={`${r.suggestedFrequency}${r.reference ? ` · Référence : ${r.reference}` : ''}`}
                  checked={on}
                  onChange={(e) => setRoutines((s) => toggle(s, r.title, e.target.checked))}
                />
                {on && checks.length > 0 && (
                  <div className={styles.values}>
                    {checks.map((c) => {
                      const key = overrideKey(r.title, c.id);
                      const v = values[key];
                      return (
                        <div key={c.id} className={styles.valueRow}>
                          <p className={styles.valueLabel}>
                            {c.label}{' '}
                            {isExampleValue(c) &&
                              (v?.min === undefined && v?.max === undefined ? (
                                <Badge tone="warning">Exemple à adapter</Badge>
                              ) : (
                                <Badge tone="success">Adapté</Badge>
                              ))}
                          </p>
                          {c.help && <p className={styles.muted}>{c.help}</p>}
                          <div className={styles.valueInputs}>
                            <TextField
                              label={`Minimum — ${c.label}`}
                              inputMode="decimal"
                              value={v?.min ?? String(c.min ?? '')}
                              onChange={(e) => setBound(key, 'min', e.target.value)}
                            />
                            <TextField
                              label={`Maximum — ${c.label}`}
                              inputMode="decimal"
                              value={v?.max ?? String(c.max ?? '')}
                              onChange={(e) => setBound(key, 'max', e.target.value)}
                            />
                            <TextField
                              label={`Unité — ${c.label}`}
                              value={v?.unit ?? c.unit ?? ''}
                              onChange={(e) => setBound(key, 'unit', e.target.value)}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </fieldset>

      {template.checklists.length > 0 && (
        <fieldset className={styles.block}>
          <legend>Checklists à créer</legend>
          <ul className={styles.choices}>
            {template.checklists.map((c) => (
              <li key={c.name}>
                <Checkbox
                  label={c.name}
                  description={required.has(c.name) ? 'Utilisée par une routine retenue : toujours créée.' : c.description}
                  checked={checklists.has(c.name) || required.has(c.name)}
                  disabled={required.has(c.name)}
                  onChange={(e) => setChecklists((s) => toggle(s, c.name, e.target.checked))}
                />
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      <fieldset className={styles.block}>
        <legend>Options</legend>
        <ul className={styles.choices}>
          <li>
            <Checkbox
              label="Remplacer les référentiels"
              description="Étapes de fabrication, catégories d’anomalie, motifs d’alerte et noms des rôles du secteur."
              checked={replaceCatalog}
              onChange={(e) => setReplaceCatalog(e.target.checked)}
            />
          </li>
          {template.disabledModules.length > 0 && (
            <li>
              <Checkbox
                label="Masquer les modules peu utilisés dans ce secteur"
                description={template.disabledModules.map((m) => MODULES[m].label).join(', ')}
                checked={applyModules}
                onChange={(e) => setApplyModules(e.target.checked)}
              />
            </li>
          )}
        </ul>
      </fieldset>

      <p className={styles.muted}>
        Les routines et checklists portant déjà le même nom sont conservées telles quelles. Rien n’est planifié : les routines sont prêtes à
        être affectées.
      </p>
      {invalid && (
        <p className={styles.error} role="alert">
          Vérifiez les valeurs saisies : nombres attendus, minimum inférieur au maximum.
        </p>
      )}
      <div className={styles.actions}>
        <Button
          variant="primary"
          loading={apply.isPending}
          disabled={invalid || routines.size + checklists.size === 0}
          onClick={async () => {
            if (
              alreadyConfigured &&
              replaceCatalog &&
              !(await confirm({
                title: `Appliquer le modèle « ${template.label} » ?`,
                message: 'Vos référentiels actuels seront remplacés. Les routines, checklists et données existantes sont conservées.',
                confirmLabel: 'Appliquer',
              }))
            )
              return;
            await apply.mutateAsync({
              key: sector,
              options: { routines: [...routines], checklists: [...checklists], overrides, replaceCatalog, applyModules },
            });
          }}
        >
          {applied ? 'Réappliquer ce modèle' : 'Appliquer ce modèle'}
        </Button>
        {ds.kind === 'demo' && (
          <Button
            icon={<RefreshCw size={16} aria-hidden />}
            onClick={async () => {
              if (
                !(await confirm({
                  title: `Transformer la démo en atelier « ${template.label} » ?`,
                  message:
                    'La démonstration est rechargée dans ce secteur : postes, produits, routines, historique et exemples. Vos essais en cours sont effacés.',
                  confirmLabel: 'Transformer',
                }))
              )
                return;
              window.location.assign(`${window.location.pathname}?secteur=${sector}${window.location.hash}`);
            }}
          >
            Transformer la démo en atelier « {template.label} »
          </Button>
        )}
      </div>
    </section>
  );
}
