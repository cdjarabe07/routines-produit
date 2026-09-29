import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Copy, Plus } from 'lucide-react';
import { useCurrentUser } from '@/app/providers/AuthProvider';
import { DataTable, type Column } from '@/components/data-display/DataTable';
import { QueryBoundary } from '@/components/feedback/States';
import { PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { FormActions, TextField } from '@/components/ui/Field';
import { Drawer, Modal } from '@/components/ui/Overlay';
import { Panel } from '@/components/ui/Panel';
import { Tabs } from '@/components/ui/Tabs';
import { useLookups } from '@/features/shared/api';
import { EVENT_TYPE } from '@/features/shared/labels';
import { useCollection } from '@/hooks/useData';
import type { EventType, Meeting } from '@/types/domain';
import { formatDate, todayKey } from '@/utils/date';
import { nextWorkingDay, useCancelMeeting, useDeleteMeeting, useDuplicateMeeting } from '../api';
import { EventForm } from '../components/EventForm';
import { MEETING_STATUS, invitedUserIds } from '../model';

const MEETING_TYPES: EventType[] = ['meeting', 'briefing', 'daily'];
type View = 'upcoming' | 'past' | 'cancelled';

/** Gestion des réunions : créer, modifier, dupliquer, planifier en série, annuler, supprimer. */
export function MeetingsAdminPage() {
  const me = useCurrentUser();
  const today = todayKey();
  const [params, setParams] = useSearchParams();
  const meetings = useCollection('meetings');
  const { queries, lookups } = useLookups();
  const confirm = useConfirm();
  const cancel = useCancelMeeting();
  const remove = useDeleteMeeting();
  const [view, setView] = useState<View>('upcoming');
  const [duplicating, setDuplicating] = useState<Meeting | null>(null);

  const editingId = params.get('modifier');
  const creating = params.get('nouvelle') === '1';
  const closeEditor = () => setParams({}, { replace: true });

  const rowsFor = (list: Meeting[]) => {
    const own = list.filter((m) => MEETING_TYPES.includes(m.type));
    if (view === 'cancelled') return own.filter((m) => m.status === 'cancelled');
    if (view === 'past') return own.filter((m) => m.status !== 'cancelled' && m.date < today);
    return own.filter((m) => m.status !== 'cancelled' && m.date >= today);
  };

  const columns: Column<Meeting>[] = [
    {
      id: 'date',
      header: 'Date',
      mobile: 'meta',
      cell: (m) => `${formatDate(m.date)} ${m.startTime}–${m.endTime}`,
      sortValue: (m) => `${m.date}${m.startTime}`,
    },
    {
      id: 'title',
      header: 'Réunion',
      mobile: 'title',
      cell: (m) => <Link to={`/reunions/${m.id}`}>{m.title}</Link>,
      sortValue: (m) => m.title,
    },
    { id: 'type', header: 'Type', mobile: 'meta', cell: (m) => EVENT_TYPE[m.type] },
    { id: 'organizer', header: 'Responsable', mobile: 'meta', cell: (m) => lookups?.userName(m.organizerId) },
    {
      id: 'invited',
      header: 'Invités',
      align: 'center',
      mobile: 'meta',
      cell: (m) => (lookups ? invitedUserIds(m, lookups.users).length : ''),
    },
    {
      id: 'status',
      header: 'Statut',
      mobile: 'aside',
      cell: (m) => <Badge tone={MEETING_STATUS[m.status].tone}>{MEETING_STATUS[m.status].label}</Badge>,
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      mobile: 'meta',
      cell: (m) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {m.status !== 'done' && m.status !== 'cancelled' && (
            <Button size="sm" onClick={() => setParams({ modifier: m.id }, { replace: true })}>
              Modifier
            </Button>
          )}
          <IconButton
            label={`Dupliquer ${m.title} du ${formatDate(m.date)}`}
            size="sm"
            icon={<Copy size={15} />}
            onClick={() => setDuplicating(m)}
          />
          {m.status === 'planned' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                if (
                  await confirm({
                    title: 'Annuler cette réunion ?',
                    message: 'Les participants seront prévenus. Elle reste visible comme annulée.',
                    confirmLabel: 'Annuler la réunion',
                  })
                )
                  cancel.mutate({ meeting: m, actor: me });
              }}
            >
              Annuler
            </Button>
          )}
          {m.status !== 'done' && m.status !== 'in_progress' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                if (
                  await confirm({
                    title: 'Supprimer cette réunion ?',
                    message: 'Elle disparaît de l’agenda de tous les participants. Cette action est irréversible.',
                    confirmLabel: 'Supprimer',
                    tone: 'danger',
                  })
                )
                  remove.mutate({ meeting: m });
              }}
            >
              Supprimer
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Réunions"
        description="Réunions, briefings et daily meetings : planification, participants, ordre du jour. Les autres événements se gèrent dans l’agenda."
        actions={
          <Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setParams({ nouvelle: '1' }, { replace: true })}>
            Nouvelle réunion
          </Button>
        }
      />
      <QueryBoundary queries={[meetings, ...queries]}>
        {() => (
          <Stack>
            <Tabs
              label="Réunions"
              value={view}
              onChange={setView}
              items={[
                {
                  value: 'upcoming',
                  label: 'À venir',
                  count: meetings.data!.filter((m) => MEETING_TYPES.includes(m.type) && m.status !== 'cancelled' && m.date >= today).length,
                },
                { value: 'past', label: 'Passées' },
                { value: 'cancelled', label: 'Annulées' },
              ]}
            />
            <Panel flush>
              <DataTable
                caption="Réunions"
                rows={rowsFor(meetings.data!)}
                columns={columns}
                rowKey={(m) => m.id}
                initialSort={{ id: 'date', direction: view === 'past' ? 'desc' : 'asc' }}
                search={{
                  placeholder: 'Rechercher une réunion',
                  text: (m) => `${m.title} ${lookups?.userName(m.organizerId)} ${m.location ?? ''}`,
                }}
                pageSize={25}
                empty={{
                  title:
                    view === 'upcoming' ? 'Aucune réunion prévue.' : view === 'past' ? 'Aucune réunion passée.' : 'Aucune réunion annulée.',
                }}
              />
            </Panel>
          </Stack>
        )}
      </QueryBoundary>

      <Drawer
        open={creating || Boolean(editingId)}
        onClose={closeEditor}
        title={editingId ? 'Modifier la réunion' : 'Nouvelle réunion'}
        size="lg"
      >
        {(creating || editingId) && lookups && meetings.data && (
          <EventForm
            key={editingId ?? 'new'}
            meeting={editingId ? meetings.data.find((m) => m.id === editingId) : undefined}
            lookups={lookups}
            types={MEETING_TYPES}
            defaultType="meeting"
            onDone={closeEditor}
          />
        )}
      </Drawer>

      <DuplicateDialog meeting={duplicating} onClose={() => setDuplicating(null)} />
    </>
  );
}

function DuplicateDialog({ meeting, onClose }: { meeting: Meeting | null; onClose: () => void }) {
  const me = useCurrentUser();
  const duplicate = useDuplicateMeeting();
  const [date, setDate] = useState('');
  const target = date || (meeting ? nextWorkingDay(meeting.date > todayKey() ? meeting.date : todayKey()) : '');
  return (
    <Modal open={meeting !== null} onClose={onClose} title="Dupliquer la réunion" description={meeting?.title} size="sm">
      {meeting && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await duplicate.mutateAsync({ meeting, date: target, actor: me });
            setDate('');
            onClose();
          }}
        >
          <TextField
            label="Nouvelle date"
            type="date"
            required
            value={target}
            onChange={(e) => setDate(e.target.value)}
            hint="Mêmes horaires, participants et ordre du jour."
          />
          <FormActions>
            <Button onClick={onClose}>Annuler</Button>
            <Button type="submit" variant="primary" loading={duplicate.isPending} disabled={!target}>
              Dupliquer
            </Button>
          </FormActions>
        </form>
      )}
    </Modal>
  );
}
