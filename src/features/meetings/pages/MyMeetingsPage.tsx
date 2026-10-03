import { useState } from 'react';
import { useCurrentUser } from '@/app/providers/AuthProvider';
import { DataTable, type Column } from '@/components/data-display/DataTable';
import { QueryBoundary } from '@/components/feedback/States';
import { PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Panel } from '@/components/ui/Panel';
import { Tabs } from '@/components/ui/Tabs';
import { useLookups } from '@/features/shared/api';
import { EVENT_TYPE } from '@/features/shared/labels';
import { useCollection } from '@/hooks/useData';
import type { Meeting } from '@/types/domain';
import { addDays, formatLongDate, todayKey } from '@/utils/date';
import { AgendaCalendar, type AgendaView } from '../components/AgendaCalendar';
import { MEETING_STATUS, meetingsForUser } from '../model';

type View = 'upcoming' | 'past' | 'calendar';

/** Réunions, formations et événements auxquels la personne est invitée (consultation). */
export function MyMeetingsPage() {
  const user = useCurrentUser();
  const today = todayKey();
  const meetings = useCollection('meetings');
  const { queries, lookups } = useLookups();
  const [view, setView] = useState<View>('upcoming');
  const [calendar, setCalendar] = useState<{ view: AgendaView; anchor: string }>({ view: 'week', anchor: today });

  const columns: Column<Meeting>[] = [
    {
      id: 'date',
      header: 'Date',
      mobile: 'meta',
      cell: (m) => `${m.date === today ? 'Aujourd’hui' : formatLongDate(m.date)} · ${m.startTime}–${m.endTime}`,
      sortValue: (m) => `${m.date}${m.startTime}`,
    },
    { id: 'title', header: 'Événement', mobile: 'title', cell: (m) => m.title, sortValue: (m) => m.title },
    { id: 'type', header: 'Type', mobile: 'meta', cell: (m) => EVENT_TYPE[m.type] },
    { id: 'where', header: 'Lieu', mobile: 'meta', cell: (m) => m.location ?? '—' },
    {
      id: 'organizer',
      header: 'Responsable',
      mobile: 'meta',
      cell: (m) => (m.organizerId === user.id ? 'Vous' : lookups?.userName(m.organizerId)),
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
        title="Mes réunions"
        description="Réunions, briefings, formations et événements auxquels vous êtes invité, directement ou avec votre équipe."
      />
      <QueryBoundary queries={[meetings, ...queries]}>
        {() => {
          const mine = meetingsForUser(meetings.data!, user);
          const upcoming = mine.filter((m) => m.date >= today);
          const past = mine.filter((m) => m.date < today && m.date >= addDays(today, -30));
          return (
            <Stack>
              <Tabs
                label="Période"
                value={view}
                onChange={setView}
                items={[
                  { value: 'upcoming', label: 'À venir', count: upcoming.length },
                  { value: 'past', label: '30 derniers jours', count: past.length },
                  { value: 'calendar', label: 'Calendrier' },
                ]}
              />
              {view === 'calendar' ? (
                <AgendaCalendar
                  meetings={mine}
                  view={calendar.view}
                  views={['day', 'week', 'month']}
                  anchor={calendar.anchor}
                  onChange={(next) => setCalendar((c) => ({ view: next.view ?? c.view, anchor: next.anchor ?? c.anchor }))}
                  eventLink={(m) => `/reunions/${m.id}`}
                />
              ) : (
                <Panel flush>
                  <DataTable
                    caption="Mes réunions"
                    rows={view === 'upcoming' ? upcoming : past}
                    columns={columns}
                    rowKey={(m) => m.id}
                    rowLink={(m) => `/reunions/${m.id}`}
                    initialSort={{ id: 'date', direction: view === 'upcoming' ? 'asc' : 'desc' }}
                    empty={{ title: view === 'upcoming' ? 'Aucune réunion prévue.' : 'Aucune réunion sur les 30 derniers jours.' }}
                  />
                </Panel>
              )}
            </Stack>
          );
        }}
      </QueryBoundary>
    </>
  );
}
