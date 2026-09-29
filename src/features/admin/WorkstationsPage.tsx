import { useState } from 'react';
import { Plus, Printer } from 'lucide-react';
import { DataTable, type Column } from '@/components/data-display/DataTable';
import { QueryBoundary } from '@/components/feedback/States';
import { PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox, FormActions, FormGrid, SelectField, TextField } from '@/components/ui/Field';
import { Drawer } from '@/components/ui/Overlay';
import { Panel } from '@/components/ui/Panel';
import { useLookups, type Lookups } from '@/features/shared/api';
import { useForm } from '@/hooks/useForm';
import type { Workstation } from '@/types/domain';
import { numberRange, required } from '@/utils/validation';
import { useSaveWorkstation } from './api';
import { QrCode } from './QrCode';
import styles from './WorkstationsPage.module.css';

/** Lien encodé dans le QR : ouvre la déclaration d'anomalie avec le poste pré-rempli. */
export const reportLink = (code: string) =>
  `${window.location.origin}${window.location.pathname}#/signaler?poste=${encodeURIComponent(code)}`;

export function WorkstationsPage() {
  const { queries, lookups } = useLookups();
  const [editing, setEditing] = useState<Workstation | 'new' | null>(null);

  const columns: Column<Workstation>[] = [
    { id: 'code', header: 'Code', width: '80px', mobile: 'meta', cell: (w) => <strong>{w.code}</strong>, sortValue: (w) => w.code },
    { id: 'name', header: 'Poste', mobile: 'title', cell: (w) => w.name, sortValue: (w) => w.name },
    { id: 'process', header: 'Procédé', mobile: 'meta', cell: (w) => w.process },
    { id: 'line', header: 'Ligne', mobile: 'meta', cell: (w) => lookups?.lineById.get(w.lineId)?.name ?? '—', sortValue: (w) => w.lineId },
    { id: 'pos', header: 'Position plan', mobile: 'hidden', cell: (w) => `${w.mapX} % / ${w.mapY} %` },
    {
      id: 'active',
      header: 'Statut',
      mobile: 'aside',
      cell: (w) => (w.active ? <Badge tone="success">Actif</Badge> : <Badge>Inactif</Badge>),
    },
    {
      id: 'edit',
      header: '',
      align: 'right',
      mobile: 'meta',
      cell: (w) => (
        <Button size="sm" onClick={() => setEditing(w)}>
          Modifier
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Postes & QR codes"
        description="Référentiel des postes. Chaque QR code ouvre la déclaration d’anomalie avec le poste pré-rempli ; il suffit de l’imprimer et de l’apposer au poste."
        actions={
          <>
            <Button icon={<Printer size={16} aria-hidden />} onClick={() => window.print()}>
              Imprimer les étiquettes
            </Button>
            <Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setEditing('new')}>
              Nouveau poste
            </Button>
          </>
        }
      />
      <QueryBoundary queries={queries}>
        {() => (
          <Stack>
            <div className={styles.noPrint}>
              <Panel flush>
                <DataTable
                  caption="Postes"
                  rows={lookups!.workstations}
                  columns={columns}
                  rowKey={(w) => w.id}
                  initialSort={{ id: 'code', direction: 'asc' }}
                  empty={{ title: 'Aucun poste configuré.' }}
                />
              </Panel>
            </div>
            <section aria-labelledby="labels-title">
              <h2 id="labels-title" className={styles.labelsTitle}>
                Étiquettes QR
              </h2>
              <ul className={styles.labels}>
                {lookups!.workstations
                  .filter((w) => w.active)
                  .map((w) => (
                    <li key={w.id} className={styles.label}>
                      <QrCode value={reportLink(w.code)} label={`Signaler une anomalie — ${w.name}`} />
                      <div>
                        <p className={styles.labelCode}>{w.code}</p>
                        <p className={styles.labelName}>{w.name}</p>
                        <p className={styles.labelLine}>{lookups!.lineById.get(w.lineId)?.name}</p>
                        <p className={styles.labelHint}>Scanner pour signaler une anomalie</p>
                      </div>
                    </li>
                  ))}
              </ul>
            </section>
          </Stack>
        )}
      </QueryBoundary>
      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Nouveau poste' : 'Modifier le poste'}
        size="md"
      >
        {editing !== null && lookups && (
          <WorkstationForm workstation={editing === 'new' ? undefined : editing} lookups={lookups} onDone={() => setEditing(null)} />
        )}
      </Drawer>
    </>
  );
}

function WorkstationForm({ workstation, lookups, onDone }: { workstation?: Workstation; lookups: Lookups; onDone: () => void }) {
  const save = useSaveWorkstation();
  const form = useForm({
    initial: {
      code: workstation?.code ?? '',
      name: workstation?.name ?? '',
      process: workstation?.process ?? '',
      lineId: workstation?.lineId ?? lookups.lines[0]?.id ?? '',
      mapX: String(workstation?.mapX ?? 50),
      mapY: String(workstation?.mapY ?? 50),
      active: workstation?.active ?? true,
    },
    rules: {
      code: [
        required('Code obligatoire'),
        (v: string) => (/^[A-Za-z0-9_-]{1,12}$/.test(v.trim()) ? null : 'Lettres, chiffres, - ou _ (12 max.)'),
      ],
      name: [required('Nom obligatoire')],
      process: [required('Procédé obligatoire')],
      mapX: [required(), numberRange(0, 100)],
      mapY: [required(), numberRange(0, 100)],
    },
    onSubmit: async (v) => {
      await save.mutateAsync({
        id: workstation?.id,
        input: {
          code: v.code.trim(),
          name: v.name.trim(),
          process: v.process.trim(),
          lineId: v.lineId,
          mapX: Number(v.mapX),
          mapY: Number(v.mapY),
          active: v.active,
        },
      });
      onDone();
    },
  });
  const { values, set, errors } = form;
  return (
    <form onSubmit={form.handleSubmit} noValidate>
      <FormGrid>
        <TextField
          label="Code (QR)"
          required
          value={values.code}
          onChange={(e) => set('code', e.target.value)}
          error={errors.code}
          hint={workstation ? 'Modifier le code invalide les étiquettes déjà imprimées.' : undefined}
        />
        <SelectField
          label="Ligne"
          options={lookups.lines.map((l) => ({ value: l.id, label: l.name }))}
          value={values.lineId}
          onChange={(e) => set('lineId', e.target.value)}
        />
        <TextField
          className="full"
          label="Nom"
          required
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
          error={errors.name}
        />
        <TextField
          className="full"
          label="Procédé"
          required
          value={values.process}
          onChange={(e) => set('process', e.target.value)}
          error={errors.process}
        />
        <TextField
          label="Position horizontale (%)"
          type="number"
          min={0}
          max={100}
          value={values.mapX}
          onChange={(e) => set('mapX', e.target.value)}
          error={errors.mapX}
        />
        <TextField
          label="Position verticale (%)"
          type="number"
          min={0}
          max={100}
          value={values.mapY}
          onChange={(e) => set('mapY', e.target.value)}
          error={errors.mapY}
        />
        <div className="full">
          <Checkbox label="Poste actif" checked={values.active} onChange={(e) => set('active', e.target.checked)} />
        </div>
      </FormGrid>
      <FormActions>
        <Button onClick={onDone}>Annuler</Button>
        <Button type="submit" variant="primary" loading={form.submitting}>
          Enregistrer
        </Button>
      </FormActions>
    </form>
  );
}
