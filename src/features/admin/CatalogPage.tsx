import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { ANDON_TYPES, DEFAULT_CATALOG, ROLES, SHIFTS, keyFromLabel, resolveCatalog } from '@/app/catalog';
import { QueryBoundary } from '@/components/feedback/States';
import { PageHeader, Stack } from '@/components/layout/PageHeader';
import { Button, IconButton } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { Checkbox, FormActions, TextAreaField, TextField } from '@/components/ui/Field';
import { Panel } from '@/components/ui/Panel';
import { ANDON_TYPE } from '@/features/andon/model';
import { useSettings } from '@/features/shared/api';
import { useCollection } from '@/hooks/useData';
import type { Catalog, CatalogEntry } from '@/types/domain';
import { useSaveCatalog } from './api';
import styles from './CatalogPage.module.css';

/* Référentiels du site : la terminologie et les listes de choix de son secteur. */

type Row = { key?: string; label: string };

const ROLE_HINT: Record<string, string> = {
  operator: 'Exécute ses routines, déclenche les alertes',
  hancho: 'Anime une équipe au poste',
  line_leader: 'Responsable d’une ligne ou d’un secteur',
  quality: 'Contrôles et suivi qualité',
  manager: 'Pilotage de l’atelier',
  admin: 'Configuration du site',
};

export function CatalogPage() {
  const query = useSettings();
  const orders = useCollection('productionOrders');
  const anomalies = useCollection('anomalies');
  return (
    <>
      <PageHeader
        title="Référentiels"
        description="Adaptez la terminologie et les listes de choix à votre secteur. Les droits ne changent pas ; renommer un élément conserve les données qui l’utilisent."
      />
      <QueryBoundary queries={[query, orders, anomalies]}>
        {() => (
          <CatalogForm
            key={JSON.stringify(query.settings.catalog ?? {})}
            initial={resolveCatalog(query.settings.catalog)}
            stageUse={countBy(orders.data!.filter((o) => o.status !== 'done').map((o) => o.stage))}
            categoryUse={countBy(anomalies.data!.map((a) => a.category))}
          />
        )}
      </QueryBoundary>
    </>
  );
}

function countBy(values: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}

function CatalogForm({
  initial,
  stageUse,
  categoryUse,
}: {
  initial: Catalog;
  stageUse: Map<string, number>;
  categoryUse: Map<string, number>;
}) {
  const save = useSaveCatalog();
  const confirm = useConfirm();
  const [stages, setStages] = useState<Row[]>(initial.productionStages);
  const [categories, setCategories] = useState<Row[]>(initial.anomalyCategories);
  const [presets, setPresets] = useState(
    () =>
      Object.fromEntries(ANDON_TYPES.map((t) => [t, initial.andonPresets[t].join('\n')])) as Record<(typeof ANDON_TYPES)[number], string>,
  );
  const [roles, setRoles] = useState(initial.roleLabels);
  const [shifts, setShifts] = useState(initial.shifts);
  const [error, setError] = useState<string | null>(null);

  const draft = useMemo<Catalog>(
    () => ({
      productionStages: withKeys(stages),
      anomalyCategories: withKeys(categories),
      andonPresets: Object.fromEntries(
        ANDON_TYPES.map((t) => [
          t,
          presets[t]
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean),
        ]),
      ) as Catalog['andonPresets'],
      roleLabels: roles,
      shifts,
    }),
    [stages, categories, presets, roles, shifts],
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validate(draft);
    setError(problem);
    if (!problem) await save.mutateAsync(draft);
  };

  const restoreDefaults = async () => {
    if (
      await confirm({
        title: 'Rétablir les valeurs par défaut ?',
        message: 'Toutes les listes reprennent les valeurs génériques de Routine. Les étapes et catégories utilisées restent lisibles.',
        confirmLabel: 'Rétablir',
      })
    ) {
      setStages(DEFAULT_CATALOG.productionStages);
      setCategories(DEFAULT_CATALOG.anomalyCategories);
      setPresets(Object.fromEntries(ANDON_TYPES.map((t) => [t, DEFAULT_CATALOG.andonPresets[t].join('\n')])) as typeof presets);
      setRoles(DEFAULT_CATALOG.roleLabels);
      setShifts(structuredClone(DEFAULT_CATALOG.shifts));
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <Stack>
        <Panel
          title="Étapes de fabrication"
          description="Dans l’ordre du flux. Elles servent au suivi des ordres de fabrication et à la carte du processus."
        >
          <ListEditor rows={stages} onChange={setStages} usage={stageUse} usageLabel="OF en cours" itemLabel="étape" ordered />
        </Panel>
        <Panel title="Catégories d’anomalie" description="Proposées lors d’un signalement et utilisées dans le reporting.">
          <ListEditor rows={categories} onChange={setCategories} usage={categoryUse} usageLabel="anomalie(s)" itemLabel="catégorie" />
        </Panel>
        <Panel
          title="Motifs d’Andon"
          description="Boutons de saisie rapide proposés lors du déclenchement d’une alerte, un motif par ligne."
        >
          <div className={styles.columns}>
            {ANDON_TYPES.map((t) => (
              <TextAreaField
                key={t}
                id={`motifs-${t}`}
                label={ANDON_TYPE[t].label}
                rows={5}
                value={presets[t]}
                onChange={(e) => setPresets({ ...presets, [t]: e.target.value })}
              />
            ))}
          </div>
        </Panel>
        <Panel title="Nom des rôles" description="Le vocabulaire de votre site. Les droits de chaque rôle restent les mêmes.">
          <div className={styles.columns}>
            {ROLES.map((r) => (
              <TextField
                key={r}
                id={`role-${r}`}
                label={DEFAULT_CATALOG.roleLabels[r]}
                hint={ROLE_HINT[r]}
                value={roles[r]}
                maxLength={60}
                onChange={(e) => setRoles({ ...roles, [r]: e.target.value })}
              />
            ))}
          </div>
        </Panel>
        <Panel
          title="Postes horaires"
          description="Exemples : 2 × 8 (matin, après-midi), 3 × 8, ou postes de 12 h (jour, nuit). Un poste décoché n’est plus proposé."
        >
          <div className={styles.shifts}>
            {SHIFTS.map((s) => (
              <div key={s} className={styles.shift}>
                <Checkbox
                  id={`poste-${s}`}
                  label="Utilisé"
                  checked={shifts[s].active}
                  onChange={(e) => setShifts({ ...shifts, [s]: { ...shifts[s], active: e.target.checked } })}
                />
                <TextField
                  id={`poste-${s}-nom`}
                  label="Nom"
                  value={shifts[s].label}
                  maxLength={60}
                  onChange={(e) => setShifts({ ...shifts, [s]: { ...shifts[s], label: e.target.value } })}
                />
                <TextField
                  id={`poste-${s}-court`}
                  label="Nom court"
                  value={shifts[s].short}
                  maxLength={20}
                  onChange={(e) => setShifts({ ...shifts, [s]: { ...shifts[s], short: e.target.value } })}
                />
              </div>
            ))}
          </div>
        </Panel>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <FormActions>
          <Button type="button" variant="ghost" onClick={() => void restoreDefaults()}>
            Rétablir les valeurs par défaut
          </Button>
          <Button type="submit" variant="primary" loading={save.isPending}>
            Enregistrer les référentiels
          </Button>
        </FormActions>
      </Stack>
    </form>
  );
}

/** Clés : conservées pour les éléments existants (les données restent liées), créées pour les nouveaux */
function withKeys(rows: Row[]): CatalogEntry[] {
  const taken = new Set(rows.flatMap((r) => (r.key ? [r.key] : [])));
  return rows
    .filter((r) => r.label.trim())
    .map((r) => {
      if (r.key) return { key: r.key, label: r.label.trim() };
      const key = keyFromLabel(r.label, taken);
      taken.add(key);
      return { key, label: r.label.trim() };
    });
}

export function validate(c: Catalog): string | null {
  if (c.productionStages.length === 0) return 'Gardez au moins une étape de fabrication.';
  if (c.anomalyCategories.length === 0) return 'Gardez au moins une catégorie d’anomalie.';
  for (const [name, list] of [
    ['étapes', c.productionStages],
    ['catégories', c.anomalyCategories],
  ] as const) {
    const labels = list.map((e) => e.label.toLowerCase());
    if (new Set(labels).size !== labels.length) return `Deux ${name} portent le même nom.`;
  }
  if (Object.values(c.roleLabels).some((l) => !l.trim())) return 'Chaque rôle doit avoir un nom.';
  if (!Object.values(c.shifts).some((s) => s.active)) return 'Gardez au moins un poste horaire utilisé.';
  if (Object.values(c.shifts).some((s) => !s.label.trim() || !s.short.trim()))
    return 'Chaque poste horaire doit avoir un nom et un nom court.';
  return null;
}

function ListEditor({
  rows,
  onChange,
  usage,
  usageLabel,
  itemLabel,
  ordered,
}: {
  rows: Row[];
  onChange: (rows: Row[]) => void;
  usage: Map<string, number>;
  usageLabel: string;
  itemLabel: string;
  ordered?: boolean;
}) {
  const move = (i: number, delta: -1 | 1) => {
    const next = [...rows];
    const [item] = next.splice(i, 1);
    next.splice(i + delta, 0, item!);
    onChange(next);
  };
  return (
    <div className={styles.list}>
      <ol className={styles.rows}>
        {rows.map((r, i) => {
          const used = r.key ? (usage.get(r.key) ?? 0) : 0;
          return (
            <li key={r.key ?? `nouveau-${i}`} className={ordered ? styles.row : styles.rowPlain}>
              {ordered && <span className={styles.rank}>{i + 1}</span>}
              <TextField
                id={`${itemLabel}-${r.key ?? i}`}
                label={`Nom (${itemLabel} ${i + 1})`}
                hideLabel
                value={r.label}
                maxLength={60}
                onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              />
              <span className={styles.usage}>{used > 0 ? `${used} ${usageLabel}` : ''}</span>
              {ordered && (
                <>
                  <IconButton
                    label={`Monter « ${r.label} »`}
                    size="sm"
                    icon={<ArrowUp size={15} />}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  />
                  <IconButton
                    label={`Descendre « ${r.label} »`}
                    size="sm"
                    icon={<ArrowDown size={15} />}
                    disabled={i === rows.length - 1}
                    onClick={() => move(i, 1)}
                  />
                </>
              )}
              <IconButton
                label={used > 0 ? `« ${r.label} » est utilisée : renommez-la plutôt` : `Retirer « ${r.label} »`}
                size="sm"
                icon={<Trash2 size={15} />}
                disabled={used > 0 || rows.length === 1}
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
              />
            </li>
          );
        })}
      </ol>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        icon={<Plus size={15} aria-hidden />}
        onClick={() => onChange([...rows, { label: '' }])}
      >
        Ajouter une {itemLabel}
      </Button>
    </div>
  );
}
