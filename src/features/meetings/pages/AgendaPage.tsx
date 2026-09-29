import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { CalendarClock, Plus, Users } from 'lucide-react';
import { useAuth, useCurrentUser } from '@/app/providers/AuthProvider';
import { DataTable, type Column } from '@/components/data-display/DataTable';
import { ItemList } from '@/components/data-display/ItemList';
import { EmptyState, QueryBoundary } from '@/components/feedback/States';
import { Columns, PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DateNavigator } from '@/components/ui/DateNavigator';
import { FormActions, FormGrid, TextAreaField, TextField } from '@/components/ui/Field';
import { Drawer } from '@/components/ui/Overlay';
import { Panel } from '@/components/ui/Panel';
import { Tabs } from '@/components/ui/Tabs';
import { templatesForRole } from '@/features/routines/model';
import { useLookups } from '@/features/shared/api';
import { useCollection } from '@/hooks/useData';
import { useForm } from '@/hooks/useForm';
import type { DateKey, Meeting } from '@/types/domain';
import { formatDate, todayKey } from '@/utils/date';
import { createId } from '@/utils/id';
import { numberRange, required } from '@/utils/validation';
import { useCreateMeeting } from '../api';
import { DEFAULT_AGENDA, MEETING_STATUS, buildDayAgenda } from '../model';

export function AgendaPage() {
  const user = useCurrentUser();
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const today = todayKey();
  const date = params.get('date') ?? today;
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [planning, setPlanning] = useState(false);
  const templates = useCollection('routineTemplates');
  const runs = useCollection('routineRuns');
  const meetings = useCollection('meetings');
  const { queries, lookups } = useLookups();

  const agenda = useMemo(() => {
    if (!templates.data || !runs.data || !meetings.data) return [];
    const list = scope === 'mine' ? templatesForRole(templates.data, user.role) : templates.data;
    return buildDayAgenda(date, list, runs.data, meetings.data);
  }, [templates.data, runs.data, meetings.data, scope, user.role, date]);

  const columns: Column<Meeting>[] = [
    {
      id: 'date',
      header: 'Date',
      mobile: 'meta',
      cell: (m) => `${formatDate(m.date)} ${m.startTime}`,
      sortValue: (m) => `${m.date}${m.startTime}`,
    },
    { id: 'title', header: 'Réunion', mobile: 'title', cell: (m) => m.title },
    { id: 'participants', header: 'Présents', align: 'center', mobile: 'meta', cell: (m) => m.participantIds.length },
    {
      id: 'agenda',
      header: 'Ordre du jour',
      mobile: 'meta',
      cell: (m) => `${m.agenda.filter((a) => a.done).length}/${m.agenda.length} points`,
    },
    {
      id: 'status',
      header: 'Statut',
      mobile: 'aside',
      cell: (m) => <Badge tone={MEETING_STATUS[m.status].tone}>{MEETING_STATUS[m.status].label}</Badge>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Agenda & réunions"
        description="Routines planifiées et réunions de la journée, comptes-rendus et actions décidées."
        actions={
          can('meeting.manage') && (
            <Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setPlanning(true)}>
              Planifier une réunion
            </Button>
          )
        }
      />
      <QueryBoundary queries={[templates, runs, meetings, ...queries]}>
        {() => (
          <Stack>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <DateNavigator value={date} onChange={(d) => setParams(d === today ? {} : { date: d }, { replace: true })} allowFuture />
              <Tabs
                variant="segmented"
                label="Périmètre"
                value={scope}
                onChange={setScope}
                items={[
                  { value: 'mine', label: 'Mon rôle' },
                  { value: 'all', label: 'Toute l’équipe' },
                ]}
              />
            </div>
            <Columns>
              <Panel title="Déroulé de la journée" flush>
                {agenda.length === 0 ? (
                  <EmptyState compact title="Rien de planifié ce jour-là." />
                ) : (
                  <ItemList
                    items={agenda.map((e) => ({
                      id: e.id,
                      leading: e.kind === 'meeting' ? <Users size={16} /> : <CalendarClock size={16} />,
                      title: `${e.time} · ${e.title}`,
                      meta: e.detail,
                      aside: e.done ? <Badge tone="success">Fait</Badge> : undefined,
                      to: e.to,
                    }))}
                  />
                )}
              </Panel>
              <Panel title="Réunions précédentes" flush>
                <DataTable
                  caption="Réunions précédentes"
                  rows={meetings.data!.filter((m) => m.date < date)}
                  columns={columns.filter((c) => c.id !== 'agenda')}
                  rowKey={(m) => m.id}
                  rowLink={(m) => `/reunions/${m.id}`}
                  initialSort={{ id: 'date', direction: 'desc' }}
                  pageSize={8}
                  empty={{ title: 'Aucune réunion précédente.' }}
                />
              </Panel>
            </Columns>
          </Stack>
        )}
      </QueryBoundary>
      <Drawer open={planning} onClose={() => setPlanning(false)} title="Planifier une réunion" size="md">
        {planning && lookups && <MeetingForm date={date} onDone={() => setPlanning(false)} />}
      </Drawer>
    </>
  );
}

function MeetingForm({ date, onDone }: { date: DateKey; onDone: () => void }) {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const create = useCreateMeeting();
  const form = useForm({
    initial: { title: 'Brief de début de poste', date, startTime: '06:40', durationMin: '10', agenda: DEFAULT_AGENDA.join('\n') },
    rules: { title: [required()], date: [required()], startTime: [required()], durationMin: [required(), numberRange(5, 240)] },
    onSubmit: async (v) => {
      const meeting = await create.mutateAsync({
        title: v.title.trim(),
        date: v.date,
        startTime: v.startTime,
        durationMin: Number(v.durationMin),
        organizerId: user.id,
        participantIds: [],
        agenda: v.agenda
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .map((label) => ({ id: createId(), label, done: false })),
        minutes: '',
        status: 'planned',
      });
      onDone();
      navigate(`/reunions/${meeting.id}`);
    },
  });
  const { values, set, errors } = form;
  return (
    <form onSubmit={form.handleSubmit} noValidate>
      <FormGrid>
        <TextField
          className="full"
          label="Titre"
          required
          value={values.title}
          onChange={(e) => set('title', e.target.value)}
          error={errors.title}
        />
        <TextField label="Date" type="date" required value={values.date} onChange={(e) => set('date', e.target.value)} />
        <TextField label="Heure" type="time" required value={values.startTime} onChange={(e) => set('startTime', e.target.value)} />
        <TextField
          label="Durée (min)"
          type="number"
          min={5}
          value={values.durationMin}
          onChange={(e) => set('durationMin', e.target.value)}
          error={errors.durationMin}
        />
        <TextAreaField
          className="full"
          label="Ordre du jour (un point par ligne)"
          rows={6}
          value={values.agenda}
          onChange={(e) => set('agenda', e.target.value)}
        />
      </FormGrid>
      <FormActions>
        <Button onClick={onDone}>Annuler</Button>
        <Button type="submit" variant="primary" loading={form.submitting}>
          Planifier
        </Button>
      </FormActions>
    </form>
  );
}
