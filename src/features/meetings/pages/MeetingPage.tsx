import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { Pencil, Plus } from 'lucide-react';
import { useAuth, useCurrentUser } from '@/app/providers/AuthProvider';
import { ItemList } from '@/components/data-display/ItemList';
import { AccessDenied, EmptyState, QueryBoundary } from '@/components/feedback/States';
import { Columns, PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Checkbox, TextAreaField } from '@/components/ui/Field';
import { Drawer } from '@/components/ui/Overlay';
import { Panel } from '@/components/ui/Panel';
import { ActionForm } from '@/features/actions/components/ActionForm';
import { ActionStatusBadge } from '@/features/actions/components/ActionBadges';
import { useLookups, type Lookups } from '@/features/shared/api';
import { CommentThread } from '@/features/shared/components/CommentThread';
import { EVENT_TYPE } from '@/features/shared/labels';
import { useCollection } from '@/hooks/useData';
import type { Action, Meeting } from '@/types/domain';
import { formatDate, formatLongDate, formatTime, todayKey } from '@/utils/date';
import { useUpdateMeeting } from '../api';
import { MEETING_STATUS, hasMinutes, invitedUserIds } from '../model';
import styles from './MeetingPage.module.css';

export function MeetingPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const meetings = useCollection('meetings');
  const actions = useCollection('actions');
  const { queries, lookups } = useLookups();
  return (
    <QueryBoundary queries={[meetings, actions, ...queries]}>
      {() => {
        const meeting = meetings.data!.find((m) => m.id === id);
        if (!meeting)
          return (
            <EmptyState
              title="Réunion introuvable"
              description="Elle a peut-être été supprimée."
              action={<ButtonLink to="/app/reunions">Mes réunions</ButtonLink>}
            />
          );
        if (!can('meeting.view', { type: 'meeting', meeting })) return <AccessDenied what="cette réunion" />;
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
  const user = useCurrentUser();
  const update = useUpdateMeeting();
  const updateWithMessage = useUpdateMeeting('Réunion mise à jour.');
  const [creating, setCreating] = useState(false);
  const [minutes, setMinutes] = useState(meeting.minutes);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const canRun = can('meeting.run', { type: 'meeting', meeting });
  const editable = canRun && (meeting.status === 'planned' || meeting.status === 'in_progress');
  const withMinutes = hasMinutes(meeting.type) || meeting.agenda.length > 0;
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

  const invited = invitedUserIds(meeting, lookups.users)
    .map((id) => lookups.userById.get(id))
    .filter((u): u is NonNullable<typeof u> => Boolean(u))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const present = new Set(meeting.attendeeIds);
  const done = meeting.agenda.filter((a) => a.done).length;

  return (
    <>
      <PageHeader
        back={can('meeting.manage') ? { to: '/admin/reunions', label: 'Réunions' } : { to: '/app/reunions', label: 'Mes réunions' }}
        title={meeting.title}
        meta={
          <>
            <Badge>{EVENT_TYPE[meeting.type]}</Badge>
            <Badge tone={MEETING_STATUS[meeting.status].tone}>{MEETING_STATUS[meeting.status].label}</Badge>
            <span className={styles.meta}>
              {formatLongDate(meeting.date)} · {meeting.startTime} – {meeting.endTime}
              {meeting.location && ` · ${meeting.location}`} · responsable : {lookups.userName(meeting.organizerId)}
            </span>
          </>
        }
        actions={
          <>
            {can('meeting.manage') && (
              <ButtonLink to={`/admin/reunions?modifier=${meeting.id}`} icon={<Pencil size={15} aria-hidden />}>
                Modifier
              </ButtonLink>
            )}
            {canRun && meeting.status === 'planned' && (
              <Button variant="primary" onClick={() => updateWithMessage.mutate({ id: meeting.id, patch: { status: 'in_progress' } })}>
                Démarrer la réunion
              </Button>
            )}
            {canRun && meeting.status === 'in_progress' && (
              <Button variant="success" onClick={() => updateWithMessage.mutate({ id: meeting.id, patch: { status: 'done', minutes } })}>
                Clôturer la réunion
              </Button>
            )}
            {canRun && meeting.status === 'done' && (
              <Button onClick={() => updateWithMessage.mutate({ id: meeting.id, patch: { status: 'in_progress' } })}>Rouvrir</Button>
            )}
          </>
        }
      />
      {meeting.status === 'cancelled' && (
        <p className={styles.cancelled} role="note">
          Cet événement est annulé.
        </p>
      )}
      <Columns>
        <Stack>
          {meeting.description && (
            <Panel title="Description">
              <p style={{ whiteSpace: 'pre-wrap' }}>{meeting.description}</p>
            </Panel>
          )}
          {withMinutes && (
            <>
              <Panel
                title="Ordre du jour"
                description={meeting.agenda.length ? `${done}/${meeting.agenda.length} points traités` : undefined}
              >
                {meeting.agenda.length === 0 ? (
                  <p className={styles.muted}>Aucun ordre du jour.</p>
                ) : (
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
                )}
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
                  meeting.status !== 'done' &&
                  meeting.status !== 'cancelled' && (
                    <Button size="sm" icon={<Plus size={15} aria-hidden />} onClick={() => setCreating(true)}>
                      Ajouter une action
                    </Button>
                  )
                }
              >
                <ItemList
                  items={actions.map((a) => ({
                    id: a.id,
                    title: a.title,
                    meta: `${lookups.userName(a.assigneeId)} · échéance ${formatDate(a.dueDate)}`,
                    aside: <ActionStatusBadge action={a} today={todayKey()} />,
                    to: `/actions/${a.id}`,
                  }))}
                  empty="Aucune action décidée."
                />
              </Panel>
            </>
          )}
          <Panel title="Commentaires">
            <CommentThread
              targetType="meeting"
              targetId={meeting.id}
              notifyUserIds={[meeting.organizerId]}
              title={meeting.title}
              link={`/reunions/${meeting.id}`}
              userName={lookups.userName}
            />
          </Panel>
        </Stack>
        <Panel
          title={`Participants (${invited.length})`}
          description={meeting.status === 'planned' ? 'Invités' : `${present.size} présent(s)`}
        >
          {invited.length === 0 ? (
            <p className={styles.muted}>Aucun participant invité.</p>
          ) : (
            <ul className={styles.people}>
              {invited.map((u) => (
                <li key={u.id}>
                  {editable && meeting.status === 'in_progress' ? (
                    <Checkbox
                      label={u.name}
                      checked={present.has(u.id)}
                      onChange={(e) =>
                        update.mutate({
                          id: meeting.id,
                          patch: {
                            attendeeIds: e.target.checked ? [...meeting.attendeeIds, u.id] : meeting.attendeeIds.filter((x) => x !== u.id),
                          },
                        })
                      }
                    />
                  ) : (
                    <span className={styles.person}>
                      {u.name}
                      {u.id === meeting.organizerId && <Badge>Responsable</Badge>}
                      {u.id === user.id && <Badge tone="info">Vous</Badge>}
                      {present.has(u.id) && <Badge tone="success">Présent</Badge>}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {editable && meeting.status === 'planned' && (
            <p className={styles.muted}>Les présences se saisissent une fois la réunion démarrée.</p>
          )}
        </Panel>
      </Columns>
      <Drawer open={creating} onClose={() => setCreating(false)} title="Action décidée en réunion" size="md">
        {creating && <ActionForm users={lookups.users} source={{ type: 'meeting', id: meeting.id }} onDone={() => setCreating(false)} />}
      </Drawer>
    </>
  );
}
