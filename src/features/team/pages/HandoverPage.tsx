import { useAuth, useCurrentUser } from '@/app/providers/AuthProvider';
import { EmptyState, QueryBoundary } from '@/components/feedback/States';
import { Columns, PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FormActions, FormGrid, SelectField, TextAreaField } from '@/components/ui/Field';
import { Panel } from '@/components/ui/Panel';
import { SHIFT, options } from '@/features/shared/labels';
import { useLookups, workstationOptions, type Lookups } from '@/features/shared/api';
import { useCollection } from '@/hooks/useData';
import { useForm } from '@/hooks/useForm';
import type { Handover, Shift } from '@/types/domain';
import { formatDateTime } from '@/utils/date';
import { maxLength, minLength, required } from '@/utils/validation';
import { useAcknowledgeHandover, useCreateHandover } from '../api';
import { NEXT_SHIFT } from '../model';
import styles from './HandoverPage.module.css';

export function HandoverPage() {
  const { can } = useAuth();
  const handovers = useCollection('handovers');
  const { queries, lookups } = useLookups();
  return (
    <>
      <PageHeader
        title="Passation de poste"
        description="Ce que l’équipe suivante doit savoir : machines à surveiller, anomalies en cours, approvisionnements. À rédiger en fin de poste."
      />
      <QueryBoundary queries={[handovers, ...queries]}>
        {() => {
          const list = [...handovers.data!].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          return (
            <Columns ratio={can('handover.write') ? 'main-side' : 'equal'}>
              <Panel title="Passations récentes" flush>
                {list.length === 0 ? (
                  <EmptyState compact title="Aucune passation enregistrée." />
                ) : (
                  <HandoverList items={list.slice(0, 30)} lookups={lookups!} />
                )}
              </Panel>
              {can('handover.write') && (
                <Panel title="Nouvelle passation">
                  <HandoverForm lookups={lookups!} />
                </Panel>
              )}
            </Columns>
          );
        }}
      </QueryBoundary>
    </>
  );
}

function HandoverList({ items, lookups }: { items: Handover[]; lookups: Lookups }) {
  const user = useCurrentUser();
  const { can } = useAuth();
  const ack = useAcknowledgeHandover();
  return (
    <ul className={styles.list}>
      {items.map((h) => (
        <li key={h.id} className={styles.item}>
          <div className={styles.head}>
            <strong>
              {SHIFT[h.fromShift]} → {SHIFT[h.toShift]}
            </strong>
            {h.acknowledgedAt ? <Badge tone="success">Lue</Badge> : <Badge tone="warning">Non lue</Badge>}
          </div>
          <p className={styles.note}>{h.note}</p>
          <p className={styles.meta}>
            {lookups.userName(h.authorId)} · {formatDateTime(h.createdAt)}
            {h.workstationId && ` · ${lookups.workstationName(h.workstationId)}`}
            {h.acknowledgedAt && ` · lue par ${lookups.userName(h.acknowledgedBy)} à ${formatDateTime(h.acknowledgedAt)}`}
          </p>
          {!h.acknowledgedAt && h.authorId !== user.id && (user.shift === h.toShift || can('handover.write')) && (
            <Button
              size="sm"
              onClick={() => ack.mutate({ id: h.id, userId: user.id })}
              loading={ack.isPending && ack.variables?.id === h.id}
            >
              J’ai pris connaissance
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

function HandoverForm({ lookups }: { lookups: Lookups }) {
  const user = useCurrentUser();
  const create = useCreateHandover();
  const from: Shift = user.shift ?? 'morning';
  const form = useForm({
    initial: { fromShift: from, toShift: NEXT_SHIFT[from], workstationId: '', note: '' },
    rules: { note: [required('Rédigez la note de passation'), minLength(10), maxLength(1000)] },
    resetOnSuccess: true,
    onSubmit: (v) =>
      create.mutateAsync({
        fromShift: v.fromShift,
        toShift: v.toShift,
        workstationId: v.workstationId || undefined,
        note: v.note.trim(),
        authorId: user.id,
      }),
  });
  const { values, set, errors } = form;
  return (
    <form onSubmit={form.handleSubmit} noValidate>
      <FormGrid>
        <SelectField
          label="Équipe qui transmet"
          options={options(SHIFT)}
          value={values.fromShift}
          onChange={(e) => {
            const s = e.target.value as Shift;
            set('fromShift', s);
            set('toShift', NEXT_SHIFT[s]);
          }}
        />
        <SelectField
          label="Équipe qui reçoit"
          options={options(SHIFT)}
          value={values.toShift}
          onChange={(e) => set('toShift', e.target.value as Shift)}
        />
        <SelectField
          className="full"
          label="Poste concerné (facultatif)"
          placeholder="Toute la ligne"
          options={workstationOptions(lookups.workstations)}
          value={values.workstationId}
          onChange={(e) => set('workstationId', e.target.value)}
        />
        <TextAreaField
          className="full"
          label="Note"
          required
          rows={5}
          value={values.note}
          onChange={(e) => set('note', e.target.value)}
          error={errors.note}
          placeholder="Ex. : machine 3 bruyante au démarrage, surveiller la qualité. Bacs de composants à réapprovisionner avant 14 h."
        />
      </FormGrid>
      <FormActions>
        <Button type="submit" variant="primary" loading={form.submitting}>
          Publier la passation
        </Button>
      </FormActions>
    </form>
  );
}
