import { useState } from 'react';
import { Check } from 'lucide-react';
import { QueryBoundary } from '@/components/feedback/States';
import { PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { SECTOR_KEYS, SECTOR_TEMPLATES, type SectorKey } from '@/data/sectors';
import { useSettings } from '@/features/shared/api';
import { cx } from '@/utils/cx';
import { useApplySectorTemplate } from './sectorTemplates';
import styles from './SectorPage.module.css';

/** Modèle de secteur : pré-remplit référentiels, checklists et routines types, puis tout reste modifiable. */
export function SectorPage() {
  const query = useSettings();
  const apply = useApplySectorTemplate();
  const confirm = useConfirm();
  const [selected, setSelected] = useState<SectorKey | null>(null);
  const current = query.settings.sectorTemplate;
  const choice = selected ?? current ?? 'generic';
  const template = SECTOR_TEMPLATES[choice];

  return (
    <>
      <PageHeader
        title="Modèle de secteur"
        description="Choisissez le modèle le plus proche de votre activité : il pré-remplit les référentiels, des checklists et des routines types. Tout reste ensuite modifiable."
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

            <section className={styles.preview} aria-labelledby="apercu">
              <h2 id="apercu" className={styles.previewTitle}>
                Contenu du modèle « {template.label} »
              </h2>
              <div className={styles.columns}>
                <div>
                  <h3>Étapes de fabrication</h3>
                  <p>{(template.catalog.productionStages ?? []).map((s) => s.label).join(' → ') || 'Étapes génériques'}</p>
                </div>
                <div>
                  <h3>Routines types</h3>
                  <ul>
                    {template.routines.map((r) => (
                      <li key={r.title}>
                        <Check size={14} aria-hidden /> {r.title}{' '}
                        <span className={styles.muted}>— {r.suggestedFrequency.toLowerCase()}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3>Checklists</h3>
                  <ul>
                    {template.checklists.map((c) => (
                      <li key={c.name}>
                        <Check size={14} aria-hidden /> {c.name}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <p className={styles.muted}>
                Les routines et checklists portant déjà le même nom sont conservées telles quelles. Les référentiels (étapes, catégories,
                motifs d’alerte, noms des rôles) sont remplacés par ceux du modèle.
              </p>
              <div>
                <Button
                  variant="primary"
                  loading={apply.isPending}
                  onClick={async () => {
                    if (
                      current &&
                      !(await confirm({
                        title: `Appliquer le modèle « ${template.label} » ?`,
                        message:
                          'Vos référentiels actuels seront remplacés. Les routines, checklists et données existantes sont conservées.',
                        confirmLabel: 'Appliquer',
                      }))
                    )
                      return;
                    await apply.mutateAsync(choice);
                    setSelected(null);
                  }}
                >
                  Appliquer ce modèle
                </Button>
              </div>
            </section>
          </Stack>
        )}
      </QueryBoundary>
    </>
  );
}
