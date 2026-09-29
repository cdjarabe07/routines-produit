import { Link, useParams } from 'react-router';
import { useAuth } from '@/app/providers/AuthProvider';
import { KeyValueList } from '@/components/data-display/ItemList';
import { EmptyState, QueryBoundary } from '@/components/feedback/States';
import { Columns, PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { ActionStatusBadge } from '@/features/actions/components/ActionBadges';
import { CommentThread } from '@/features/shared/components/CommentThread';
import { SEVERITY } from '@/features/shared/labels';
import { useLookups } from '@/features/shared/api';
import { useCollection } from '@/hooks/useData';
import { formatDateTime, formatLongDate, todayKey } from '@/utils/date';
import { useCloseGemba } from '../api';
import { GEMBA_STATUS, canClose } from '../model';
import styles from './GembaDetailPage.module.css';

const RESULT_LABEL = {
  ok: { label: 'Conforme', tone: 'success' },
  ko: { label: 'Non conforme', tone: 'danger' },
  na: { label: 'N.A.', tone: 'neutral' },
} as const;

export function GembaDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const walks = useCollection('gembaWalks');
  const actions = useCollection('actions');
  const { queries, lookups } = useLookups();
  const close = useCloseGemba();
  const today = todayKey();

  return (
    <QueryBoundary queries={[walks, actions, ...queries]}>
      {() => {
        const walk = walks.data!.find((w) => w.id === id);
        if (!walk) return <EmptyState title="Gemba Walk introuvable" action={<ButtonLink to="/gemba">Retour</ButtonLink>} />;
        const closable = canClose(walk, actions.data!);
        const actionById = new Map(actions.data!.map((a) => [a.id, a]));
        return (
          <>
            <PageHeader
              back={{ to: '/gemba', label: 'Gemba Walk' }}
              title={walk.zone || 'Gemba Walk'}
              meta={
                <>
                  <Badge tone={GEMBA_STATUS[walk.status].tone}>{GEMBA_STATUS[walk.status].label}</Badge>
                  <span className={styles.meta}>{formatLongDate(walk.date)}</span>
                </>
              }
              actions={
                can('gemba.conduct') &&
                walk.status === 'validated' && (
                  <Button
                    variant="success"
                    disabled={!closable.ok}
                    loading={close.isPending}
                    onClick={() => close.mutate(walk.id)}
                    title={closable.ok ? undefined : `${closable.openActions} action(s) encore ouverte(s)`}
                  >
                    Clôturer la marche
                  </Button>
                )
              }
            />
            {walk.status === 'validated' && !closable.ok && (
              <p className={styles.hint}>Clôture possible quand les {closable.openActions} action(s) liée(s) seront terminées.</p>
            )}
            <Columns sideFirstOnMobile>
              <Stack>
                <Panel title={`Observations (${walk.observations.length})`} flush>
                  {walk.observations.length === 0 ? (
                    <EmptyState compact title="Aucune observation." />
                  ) : (
                    <ul className={styles.observations}>
                      {walk.observations.map((o) => {
                        const action = o.actionId ? actionById.get(o.actionId) : undefined;
                        return (
                          <li key={o.id} className={styles.observation}>
                            <div className={styles.obsHead}>
                              <Badge tone={SEVERITY[o.severity].tone}>{SEVERITY[o.severity].label}</Badge>
                              {o.workstationId && <span className={styles.meta}>{lookups!.workstationName(o.workstationId)}</span>}
                            </div>
                            <p>
                              <strong>Constat : </strong>
                              {o.finding}
                            </p>
                            {o.improvement && (
                              <p className={styles.improvement}>
                                <strong>Amélioration proposée : </strong>
                                {o.improvement}
                              </p>
                            )}
                            {o.photo && <img src={o.photo} alt="Photo de l’observation" className={styles.photo} />}
                            {action ? (
                              <Link to={`/actions/${action.id}`} className={styles.action}>
                                <span>Action : {action.title}</span>
                                <ActionStatusBadge action={action} today={today} />
                              </Link>
                            ) : (
                              <p className={styles.meta}>Pas d’action corrective.</p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Panel>
                <Panel title="Checklist" flush>
                  <ul className={styles.checklist}>
                    {walk.checklist.map((c) => (
                      <li key={c.id}>
                        <span>
                          {c.label}
                          {c.comment && <span className={styles.comment}> — {c.comment}</span>}
                        </span>
                        {c.result ? (
                          <Badge tone={RESULT_LABEL[c.result].tone}>{RESULT_LABEL[c.result].label}</Badge>
                        ) : (
                          <Badge>Non renseigné</Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </Panel>
                <Panel title="Commentaires">
                  <CommentThread
                    targetType="gembaWalk"
                    targetId={walk.id}
                    notifyUserIds={[walk.leaderId, ...walk.participantIds]}
                    title={`Gemba ${walk.zone}`}
                    link={`/gemba/${walk.id}`}
                    userName={lookups!.userName}
                  />
                </Panel>
              </Stack>
              <Panel title="Informations">
                <KeyValueList
                  items={[
                    { label: 'Conduite par', value: lookups!.userName(walk.leaderId) },
                    {
                      label: 'Participants',
                      value: walk.participantIds.length ? walk.participantIds.map(lookups!.userName).join(', ') : 'Aucun',
                    },
                    { label: 'Validée le', value: walk.validatedAt ? formatDateTime(walk.validatedAt) : '—' },
                    ...(walk.closedAt ? [{ label: 'Clôturée le', value: formatDateTime(walk.closedAt) }] : []),
                  ]}
                />
              </Panel>
            </Columns>
          </>
        );
      }}
    </QueryBoundary>
  );
}
