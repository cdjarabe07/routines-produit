import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Plus } from 'lucide-react';
import { Can, useCurrentUser } from '@/app/providers/AuthProvider';
import { LineChart } from '@/components/data-display/Charts';
import { DataTable, type Column } from '@/components/data-display/DataTable';
import { QueryBoundary } from '@/components/feedback/States';
import { Columns, PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FormActions, FormGrid, SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { Kpi, KpiStrip } from '@/components/ui/Kpi';
import { Drawer, Modal } from '@/components/ui/Overlay';
import { Panel } from '@/components/ui/Panel';
import { AnomalyForm } from '@/features/anomalies/components/AnomalyForm';
import { useLookups, workstationOptions, type Lookups } from '@/features/shared/api';
import { useCollection } from '@/hooks/useData';
import { useForm } from '@/hooks/useForm';
import type { QualityCheck } from '@/types/domain';
import { addDays, dateKeyOf, enumerateDays, formatDateTime, formatShortDate, todayKey } from '@/utils/date';
import { formatNumber, formatPercent } from '@/utils/format';
import { numberRange, required } from '@/utils/validation';
import { useLinkCheckAnomaly, useRecordCheck } from './api';
import { checksOn, conformity, isConform, positionInTolerance } from './model';
import styles from './QualityPage.module.css';

interface Characteristic {
  key: string;
  characteristic: string;
  workstationId: string;
  min: number;
  max: number;
  unit: string;
}

export function QualityPage() {
  const checks = useCollection('qualityChecks');
  const { queries, lookups } = useLookups();
  const [recording, setRecording] = useState(false);
  const [outOfTolerance, setOutOfTolerance] = useState<QualityCheck | null>(null);
  const link = useLinkCheckAnomaly();
  const today = todayKey();

  const catalog = useMemo<Characteristic[]>(() => {
    const map = new Map<string, Characteristic>();
    for (const c of checks.data ?? []) {
      const key = `${c.characteristic}|${c.workstationId}`;
      if (!map.has(key))
        map.set(key, { key, characteristic: c.characteristic, workstationId: c.workstationId, min: c.min, max: c.max, unit: c.unit });
    }
    return [...map.values()].sort((a, b) => a.characteristic.localeCompare(b.characteristic, 'fr'));
  }, [checks.data]);

  return (
    <>
      <PageHeader
        title="Contrôles LQC"
        description="Mesures qualité en ligne. La conformité est calculée à partir des mesures saisies, comparées à leurs tolérances."
        actions={
          <Can permission="quality.record">
            <Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setRecording(true)}>
              Saisir une mesure
            </Button>
          </Can>
        }
      />
      <QueryBoundary queries={[checks, ...queries]}>
        {() => {
          const all = checks.data!;
          const todays = checksOn(all, today);
          const week = all.filter((c) => dateKeyOf(c.createdAt) >= addDays(today, -6));
          const outWeek = week.filter((c) => !isConform(c)).length;
          const days = enumerateDays(addDays(today, -13), today);
          const trend = days.map((d) => ({ label: formatShortDate(d), value: conformity(checksOn(all, d)) }));
          const columns: Column<QualityCheck>[] = [
            {
              id: 'date',
              header: 'Mesurée le',
              mobile: 'meta',
              cell: (c) => <span style={{ whiteSpace: 'nowrap' }}>{formatDateTime(c.createdAt)}</span>,
              sortValue: (c) => c.createdAt,
            },
            { id: 'char', header: 'Caractéristique', mobile: 'title', cell: (c) => c.characteristic, sortValue: (c) => c.characteristic },
            { id: 'ws', header: 'Poste', mobile: 'meta', cell: (c) => lookups!.workstationById.get(c.workstationId)?.code ?? '—' },
            {
              id: 'value',
              header: 'Valeur',
              align: 'right',
              mobile: 'meta',
              cell: (c) => (
                <strong>
                  {formatNumber(c.value, c.value % 1 ? 2 : 0)} {c.unit}
                </strong>
              ),
              sortValue: (c) => c.value,
            },
            { id: 'tol', header: 'Tolérance', mobile: 'meta', cell: (c) => <ToleranceGauge check={c} /> },
            {
              id: 'result',
              header: 'Résultat',
              mobile: 'aside',
              cell: (c) =>
                isConform(c) ? (
                  <Badge tone="success">Conforme</Badge>
                ) : c.anomalyId ? (
                  <Link to={`/anomalies/${c.anomalyId}`}>
                    <Badge tone="danger">Hors tolérance · anomalie</Badge>
                  </Link>
                ) : (
                  <Badge tone="danger">Hors tolérance</Badge>
                ),
              sortValue: (c) => (isConform(c) ? 1 : 0),
            },
            { id: 'by', header: 'Par', mobile: 'hidden', cell: (c) => lookups!.userName(c.measuredBy) },
          ];
          return (
            <Stack>
              <KpiStrip>
                <Kpi
                  label="Conformité du jour"
                  value={formatPercent(conformity(todays), 1)}
                  detail={todays.length ? `${todays.length} mesure(s)` : 'Aucune mesure aujourd’hui'}
                  tone={conformity(todays) !== null && conformity(todays)! < 95 ? 'warning' : 'neutral'}
                />
                <Kpi label="Conformité 7 jours" value={formatPercent(conformity(week), 1)} detail={`${week.length} mesures`} />
                <Kpi label="Hors tolérance (7 j)" value={outWeek} tone={outWeek ? 'danger' : 'success'} />
              </KpiStrip>
              <Columns ratio="equal">
                <Panel
                  title="Conformité par jour (14 jours)"
                  description="Mesures dans les bornes / mesures du jour. Jours sans mesure non tracés."
                >
                  <LineChart
                    title="Conformité LQC par jour"
                    data={trend}
                    format={(v) => `${Math.round(v)} %`}
                    max={100}
                    min={80}
                    reference={{ value: 95, label: 'Objectif 95 %' }}
                  />
                </Panel>
                <Panel title="Caractéristiques suivies" flush>
                  <ul className={styles.catalog}>
                    {catalog.map((c) => {
                      const last = all
                        .filter((x) => x.characteristic === c.characteristic && x.workstationId === c.workstationId)
                        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
                      return (
                        <li key={c.key}>
                          <span>
                            <strong>{c.characteristic}</strong>
                            <span className={styles.catMeta}>
                              {lookups!.workstationName(c.workstationId)} · {c.min}–{c.max} {c.unit}
                            </span>
                          </span>
                          {last && (
                            <Badge tone={isConform(last) ? 'success' : 'danger'}>
                              {formatNumber(last.value, last.value % 1 ? 2 : 0)} {c.unit}
                            </Badge>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </Panel>
              </Columns>
              <Panel title="Mesures" flush>
                <DataTable
                  caption="Mesures LQC"
                  rows={all}
                  columns={columns}
                  rowKey={(c) => c.id}
                  initialSort={{ id: 'date', direction: 'desc' }}
                  rowTone={(c) => (isConform(c) ? undefined : 'danger')}
                  search={{
                    placeholder: 'Rechercher une caractéristique',
                    text: (c) => `${c.characteristic} ${lookups!.workstationName(c.workstationId)}`,
                  }}
                  pageSize={20}
                  empty={{ title: 'Aucune mesure enregistrée.' }}
                />
              </Panel>
            </Stack>
          );
        }}
      </QueryBoundary>

      <Drawer open={recording} onClose={() => setRecording(false)} title="Saisir une mesure" size="md">
        {recording && lookups && (
          <RecordForm
            catalog={catalog}
            lookups={lookups}
            onDone={(saved) => {
              setRecording(false);
              if (saved && !isConform(saved)) setOutOfTolerance(saved);
            }}
          />
        )}
      </Drawer>

      <Modal
        open={outOfTolerance !== null}
        onClose={() => setOutOfTolerance(null)}
        title="Mesure hors tolérance"
        description="Déclarez une anomalie qualité pour assurer le suivi (isolement, cause, action)."
        size="md"
      >
        {outOfTolerance && lookups && (
          <AnomalyForm
            workstations={lookups.workstations}
            origin={{ type: 'quality', id: outOfTolerance.id }}
            initial={{
              category: 'quality',
              severity: 'major',
              workstationId: outOfTolerance.workstationId,
              description: `${outOfTolerance.characteristic} hors tolérance : ${outOfTolerance.value} ${outOfTolerance.unit} (tolérance ${outOfTolerance.min}–${outOfTolerance.max} ${outOfTolerance.unit})`,
            }}
            onCancel={() => setOutOfTolerance(null)}
            onCreated={async (anomaly) => {
              await link.mutateAsync({ checkId: outOfTolerance.id, anomalyId: anomaly.id });
              setOutOfTolerance(null);
            }}
          />
        )}
      </Modal>
    </>
  );
}

function ToleranceGauge({ check }: { check: QualityCheck }) {
  const pos = Math.max(-10, Math.min(110, positionInTolerance(check)));
  return (
    <span className={styles.gauge} title={`Tolérance ${check.min}–${check.max} ${check.unit}`}>
      <span className={styles.gaugeBand} aria-hidden>
        <span className={styles.gaugeMark} style={{ left: `${((pos + 10) / 120) * 100}%` }} data-out={!isConform(check) || undefined} />
      </span>
      <span className={styles.gaugeText}>
        {check.min}–{check.max}
      </span>
    </span>
  );
}

function RecordForm({ catalog, lookups, onDone }: { catalog: Characteristic[]; lookups: Lookups; onDone: (saved?: QualityCheck) => void }) {
  const user = useCurrentUser();
  const record = useRecordCheck();
  const form = useForm({
    initial: { key: catalog[0]?.key ?? 'new', characteristic: '', workstationId: '', min: '', max: '', unit: '', value: '', comment: '' },
    rules: { value: [required('Saisissez la valeur mesurée'), numberRange()] },
    onSubmit: async (v) => {
      const base = v.key === 'new' ? null : catalog.find((c) => c.key === v.key)!;
      const def = base ?? {
        characteristic: v.characteristic.trim(),
        workstationId: v.workstationId,
        min: Number(v.min),
        max: Number(v.max),
        unit: v.unit.trim(),
      };
      const saved = await record.mutateAsync({
        ...def,
        value: Number(v.value),
        measuredBy: user.id,
        comment: v.comment.trim() || undefined,
      });
      onDone(saved);
    },
  });
  const { values, set, errors } = form;
  const selected = catalog.find((c) => c.key === values.key);
  const isNew = values.key === 'new';
  const newInvalid =
    isNew &&
    (!values.characteristic.trim() ||
      !values.workstationId ||
      values.min === '' ||
      values.max === '' ||
      Number(values.min) > Number(values.max) ||
      !values.unit.trim());

  return (
    <form onSubmit={form.handleSubmit} noValidate>
      <FormGrid>
        <SelectField
          className="full"
          label="Caractéristique"
          options={[
            ...catalog.map((c) => ({
              value: c.key,
              label: `${c.characteristic} — ${lookups.workstationById.get(c.workstationId)?.code ?? ''}`,
            })),
            { value: 'new', label: 'Nouvelle caractéristique…' },
          ]}
          value={values.key}
          onChange={(e) => set('key', e.target.value)}
        />
        {isNew ? (
          <>
            <TextField
              className="full"
              label="Nom de la caractéristique"
              required
              value={values.characteristic}
              onChange={(e) => set('characteristic', e.target.value)}
            />
            <SelectField
              label="Poste"
              required
              placeholder="Choisir…"
              options={workstationOptions(lookups.workstations)}
              value={values.workstationId}
              onChange={(e) => set('workstationId', e.target.value)}
            />
            <TextField label="Unité" required value={values.unit} onChange={(e) => set('unit', e.target.value)} placeholder="mm, N, %" />
            <TextField label="Minimum" required type="number" step="any" value={values.min} onChange={(e) => set('min', e.target.value)} />
            <TextField
              label="Maximum"
              required
              type="number"
              step="any"
              value={values.max}
              onChange={(e) => set('max', e.target.value)}
              error={
                values.min !== '' && values.max !== '' && Number(values.min) > Number(values.max)
                  ? 'Le maximum doit être ≥ minimum'
                  : undefined
              }
            />
          </>
        ) : (
          selected && (
            <p className="full" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
              Tolérance : {selected.min} – {selected.max} {selected.unit} · {lookups.workstationName(selected.workstationId)}
            </p>
          )
        )}
        <TextField
          className="full"
          label={`Valeur mesurée${selected && !isNew ? ` (${selected.unit})` : ''}`}
          required
          type="number"
          step="any"
          inputMode="decimal"
          value={values.value}
          onChange={(e) => set('value', e.target.value)}
          error={errors.value}
          data-autofocus
        />
        <TextAreaField
          className="full"
          label="Commentaire"
          rows={2}
          value={values.comment}
          onChange={(e) => set('comment', e.target.value)}
        />
      </FormGrid>
      <FormActions>
        <Button onClick={() => onDone()}>Annuler</Button>
        <Button type="submit" variant="primary" loading={form.submitting} disabled={newInvalid}>
          Enregistrer la mesure
        </Button>
      </FormActions>
    </form>
  );
}
