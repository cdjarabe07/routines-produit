import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { Plus } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { ItemList } from '@/components/data-display/ItemList';
import { EmptyState, QueryBoundary } from '@/components/feedback/States';
import { Columns, PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Checkbox, TextAreaField } from '@/components/ui/Field';
import { Drawer } from '@/components/ui/Overlay';
import { Panel } from '@/components/ui/Panel';
import { ActionForm } from '@/features/actions/components/ActionForm';
import { ActionStatusBadge } from '@/features/actions/components/ActionBadges';
import { useLookups, type Lookups } from '@/features/shared/api';
import { useCollection } from '@/hooks/useData';
import type { Action, Meeting } from '@/types/domain';
import { formatDate, formatLongDate, formatTime, todayKey } from '@/utils/date';
import { useUpdateMeeting } from '../api';
import { MEETING_STATUS } from '../model';
import styles from './MeetingPage.module.css';

export function MeetingPage() {
  const { id } = useParams();
  const meetings = useCollection('meetings');
  const actions = useCollection('actions');
  const { queries, lookups } = useLookups();
  return (
    <QueryBoundary queries={[meetings, actions, ...queries]}>
      {() => {
        const meeting = meetings.data!.find((m) => m.id === id);
        if (!meeting) return <EmptyState title="Réunion introuvable" action={<ButtonLink to="/agenda">Retour à l’agenda</ButtonLink>} />;
        return (
          <MeetingView
            meeting={meeting}
            actions={actions.data!.filter((a) => a.source.type === 'meeting' && a.source.id === meeting.id)}
            lookups={lookups!}
          />
        );
      }}
    </QueryBoundary>
  );
}

function MeetingView({ meeting, actions, lookups }: { meeting: Meeting; actions: Action[]; lookups: Lookups }) {
  const { can } = useAuth();
  const presence = useCollection('presence');
  const update = useUpdateMeeting();
  const updateWithMessage = useUpdateMeeting('Réunion mise à jour.');
  const [creating, setCreating] = useState(false);
  const [minutes, setMinutes] = useState(meeting.minutes);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const editable = can('meeting.manage') && meeting.status !== 'done';
  const timer = useRef<number | undefined>(undefined);
  const saveMinutes = update.mutateAsync;

  // Enregistrement automatique du compte-rendu 1 s après la dernière frappe
  useEffect(() => {
    if (minutes === meeting.minutes || !editable) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      await saveMinutes({ id: meeting.id, patch: { minutes } });
      setSavedAt(new Date());
    }, 1000);
    return () => window.clearTimeout(timer.current);
  }, [minutes, meeting.minutes, meeting.id, editable, saveMinutes]);

  const present = new Set(meeting.participantIds);
  const team = lookups.activeUsers.filter((u) => u.role !== 'admin');
  const done = meeting.agenda.filter((a) => a.done).length;

  return (
    <>
      <PageHeader
        back={{ to: `/agenda?date=${meeting.date}`, label: 'Agenda' }}
        title={meeting.title}
        meta={
          <>
            <Badge tone={MEETING_STATUS[meeting.status].tone}>{MEETING_STATUS[meeting.status].label}</Badge>
            <span className={styles.meta}>
              {formatLongDate(meeting.date)} · {meeting.startTime} · {meeting.durationMin} min · animée par{' '}
              {lookups.userName(meeting.organizerId)}
            </span>
          </>
        }
        actions={
          can('meeting.manage') && (
            <>
              {meeting.status === 'planned' && (
                <Button variant="primary" onClick={() => updateWithMessage.mutate({ id: meeting.id, patch: { status: 'in_progress' } })}>
                  Démarrer la réunion
                </Button>
              )}
              {meeting.status === 'in_progress' && (
                <Button variant="success" onClick={() => updateWithMessage.mutate({ id: meeting.id, patch: { status: 'done', minutes } })}>
                  Clôturer la réunion
                </Button>
              )}
              {meeting.status === 'done' && (
                <Button onClick={() => updateWithMessage.mutate({ id: meeting.id, patch: { status: 'in_progress' } })}>Rouvrir</Button>
              )}
            </>
          )
        }
      />
      <Columns>
        <Stack>
          <Panel title="Ordre du jour" description={`${done}/${meeting.agenda.length} points traités`}>
            <ul className={styles.agenda}>
              {meeting.agenda.map((point) => (
                <li key={point.id}>
                  <Checkbox
                    label={point.label}
                    checked={point.done}
                    disabled={!editable}
                    onChange={(e) =>
                      update.mutate({
                        id: meeting.id,
                        patch: { agenda: meeting.agenda.map((p) => (p.id === point.id ? { ...p, done: e.target.checked } : p)) },
                      })
                    }
                  />
                </li>
              ))}
            </ul>
          </Panel>
          <Panel
            title="Compte-rendu"
            description={editable ? (savedAt ? `Enregistré à ${formatTime(savedAt)}` : 'Enregistrement automatique') : undefined}
          >
            {editable ? (
              <TextAreaField
                label="Compte-rendu"
                hideLabel
                rows={6}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                placeholder="Points clés, décisions, remarques…"
              />
            ) : (
              <p style={{ whiteSpace: 'pre-wrap', color: meeting.minutes ? undefined : 'var(--color-text-muted)' }}>
                {meeting.minutes || 'Aucun compte-rendu.'}
              </p>
            )}
          </Panel>
          <Panel
            title="Actions décidées"
            flush
            actions={
              can('action.create') &&
              meeting.status !== 'done' && (
                <Button size="sm" icon={<Plus size={15} aria-hidden />} onClick={() => setCreating(true)}>
                  Ajouter une action
                </Button>
              )
            }
          >
            {actions.length === 0 ? (
              <EmptyState compact title="Aucune action décidée." />
            ) : (
              <ItemList
                items={actions.map((a) => ({
                  id: a.id,
                  title: a.title,
                  meta: `${lookups.userName(a.assigneeId)} · échéance ${formatDate(a.dueDate)}`,
                  aside: <ActionStatusBadge action={a} today={todayKey()} />,
                  to: `/actions/${a.id}`,
                }))}
              />
            )}
          </Panel>
        </Stack>
        <Panel
          title={`Présents (${present.size}/${team.length})`}
          actions={
            editable && (
              <Button
                size="sm"
                variant="ghost"
                disabled={!presence.data}
                onClick={() =>
                  update.mutate({
                    id: meeting.id,
                    patch: {
                      participantIds: (presence.data ?? [])
                        .filter((p) => p.date === meeting.date && p.status === 'present')
                        .map((p) => p.userId),
                    },
                  })
                }
              >
                Reprendre les présences du jour
              </Button>
            )
          }
        >
          <ul className={styles.people}>
            {team.map((u) => (
              <li key={u.id}>
                <Checkbox
                  label={u.name}
                  checked={present.has(u.id)}
                  disabled={!editable}
                  onChange={(e) =>
                    update.mutate({
                      id: meeting.id,
                      patch: {
                        participantIds: e.target.checked
                          ? [...meeting.participantIds, u.id]
                          : meeting.participantIds.filter((x) => x !== u.id),
                      },
                    })
                  }
                />
              </li>
            ))}
          </ul>
        </Panel>
      </Columns>
      <Drawer open={creating} onClose={() => setCreating(false)} title="Action décidée en réunion" size="md">
        {creating && <ActionForm users={lookups.users} source={{ type: 'meeting', id: meeting.id }} onDone={() => setCreating(false)} />}
      </Drawer>
    </>
  );
}
