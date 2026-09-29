import { useState } from 'react';
import { useParams } from 'react-router';
import { ListPlus } from 'lucide-react';
import { useAuth, useCurrentUser } from '@/app/providers/AuthProvider';
import { ItemList, KeyValueList } from '@/components/data-display/ItemList';
import { EmptyState, QueryBoundary } from '@/components/feedback/States';
import { Columns, PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Overlay';
import { Panel } from '@/components/ui/Panel';
import { ActionForm } from '@/features/actions/components/ActionForm';
import { ActionStatusBadge } from '@/features/actions/components/ActionBadges';
import { PRIORITY_BY_SEVERITY } from '@/features/actions/model';
import { useLookups, useSettings } from '@/features/shared/api';
import { CommentThread } from '@/features/shared/components/CommentThread';
import { useCollection } from '@/hooks/useData';
import { useNow } from '@/hooks/useNow';
import { addDays, formatDate, formatDateTime, formatDuration, formatMinutes, minutesBetween, todayKey } from '@/utils/date';
import { useAcknowledgeAndon, useStartResolution } from '../api';
import { ResolveAndonDialog } from '../components/ResolveAndonDialog';
import { ANDON_STATUS, ANDON_TYPE, ANDON_URGENCY, isEscalated } from '../model';
import styles from './AndonDetailPage.module.css';

/** Fiche d'un Andon : problème, déclarant, poste, chronologie, prise en charge, action corrective, commentaires. */
export function AndonDetailPage() {
  const { id } = useParams();
  const user = useCurrentUser();
  const { can } = useAuth();
  const now = useNow(1000);
  const { settings } = useSettings();
  const alerts = useCollection('andonAlerts');
  const actions = useCollection('actions');
  const { queries, lookups } = useLookups();
  const acknowledge = useAcknowledgeAndon();
  const startResolution = useStartResolution();
  const [resolving, setResolving] = useState(false);
  const [creatingAction, setCreatingAction] = useState(false);

  return (
    <QueryBoundary queries={[alerts, actions, ...queries]}>
      {() => {
        const alert = alerts.data!.find((a) => a.id === id);
        if (!alert) return <EmptyState title="Andon introuvable" action={<ButtonLink to="/andon">Tableau Andon</ButtonLink>} />;
        const station = lookups!.workstationById.get(alert.workstationId);
        const linked = actions.data!.filter((a) => a.source.type === 'andon' && a.source.id === alert.id);
        const open = alert.status !== 'resolved';
        const escalated = isEscalated(alert, now, settings.andonEscalationMinutes);
        const canRespond = can('andon.respond') && open;
        const timeline = [
          { at: alert.raisedAt, label: `Déclenché par ${lookups!.userName(alert.raisedBy)}` },
          alert.acknowledgedAt && { at: alert.acknowledgedAt, label: `Pris en charge par ${lookups!.userName(alert.acknowledgedBy)}` },
          alert.resolutionStartedAt && { at: alert.resolutionStartedAt, label: 'Résolution démarrée' },
          alert.resolvedAt && { at: alert.resolvedAt, label: `Résolu par ${lookups!.userName(alert.resolvedBy)}` },
        ].filter((x): x is { at: string; label: string } => Boolean(x));

        return (
          <>
            <PageHeader
              back={{ to: '/andon', label: 'Andon' }}
              title={`Andon ${ANDON_TYPE[alert.type].label.toLowerCase()} — ${station?.name ?? 'Poste inconnu'}`}
              meta={
                <>
                  <Badge tone={ANDON_STATUS[alert.status].tone}>{ANDON_STATUS[alert.status].label}</Badge>
                  <Badge tone={ANDON_URGENCY[alert.urgency].tone}>Urgence {ANDON_URGENCY[alert.urgency].label.toLowerCase()}</Badge>
                  {escalated && <Badge tone="danger">Escaladé</Badge>}
                </>
              }
              actions={
                canRespond && (
                  <>
                    {alert.status === 'active' && (
                      <Button variant="primary" loading={acknowledge.isPending} onClick={() => acknowledge.mutate({ alert, user })}>
                        Je prends en charge
                      </Button>
                    )}
                    {alert.status === 'acknowledged' && (
                      <Button loading={startResolution.isPending} onClick={() => startResolution.mutate({ alert, user })}>
                        Démarrer la résolution
                      </Button>
                    )}
                    <Button variant="success" onClick={() => setResolving(true)}>
                      Résoudre
                    </Button>
                  </>
                )
              }
            />
            {open && (
              <p className={styles.live} role="status">
                En cours depuis <strong>{formatDuration(now.getTime() - new Date(alert.raisedAt).getTime())}</strong>
                {alert.status === 'active' &&
                  (escalated ? ' · personne n’a pris en charge : escaladé' : ' · en attente de prise en charge')}
              </p>
            )}
            <Columns>
              <Stack>
                <Panel title="Problème">
                  <p className={styles.detail}>{alert.detail}</p>
                  <KeyValueList
                    items={[
                      { label: 'Type', value: ANDON_TYPE[alert.type].label },
                      { label: 'Poste', value: station?.name ?? '—' },
                      { label: 'Zone', value: station ? lookups!.lineName(station.lineId) : '—' },
                      { label: 'Déclaré par', value: lookups!.userName(alert.raisedBy) },
                    ]}
                  />
                </Panel>
                {alert.status === 'resolved' && (
                  <Panel title="Résolution" accent="success">
                    <KeyValueList
                      items={[
                        { label: 'Cause identifiée', value: alert.rootCause ?? '—' },
                        { label: 'Action réalisée', value: alert.resolution ?? '—' },
                        {
                          label: 'Durée totale',
                          value: alert.resolvedAt ? formatMinutes(minutesBetween(alert.raisedAt, alert.resolvedAt)) : '—',
                        },
                      ]}
                    />
                  </Panel>
                )}
                <Panel
                  title="Actions correctives"
                  flush
                  actions={
                    can('action.create') && (
                      <Button size="sm" icon={<ListPlus size={15} aria-hidden />} onClick={() => setCreatingAction(true)}>
                        Créer une action corrective
                      </Button>
                    )
                  }
                >
                  <ItemList
                    items={linked.map((a) => ({
                      id: a.id,
                      title: a.title,
                      meta: `${lookups!.userName(a.assigneeId)} · échéance ${formatDate(a.dueDate)}`,
                      aside: <ActionStatusBadge action={a} today={todayKey()} />,
                      to: `/actions/${a.id}`,
                    }))}
                    empty="Aucune action corrective liée."
                  />
                </Panel>
                <Panel title="Commentaires">
                  <CommentThread
                    targetType="andonAlert"
                    targetId={alert.id}
                    notifyUserIds={[alert.raisedBy, alert.acknowledgedBy]}
                    title={`Andon ${station?.code ?? ''} — ${alert.detail}`}
                    link={`/andon/${alert.id}`}
                    userName={lookups!.userName}
                  />
                </Panel>
              </Stack>
              <Panel title="Chronologie">
                <ol className={styles.timeline}>
                  {timeline.map((t) => (
                    <li key={t.label}>
                      <time dateTime={t.at}>{formatDateTime(t.at)}</time>
                      <span>{t.label}</span>
                    </li>
                  ))}
                </ol>
              </Panel>
            </Columns>

            <ResolveAndonDialog alert={resolving ? alert : null} stationName={station?.name ?? ''} onClose={() => setResolving(false)} />
            <Drawer open={creatingAction} onClose={() => setCreatingAction(false)} title="Action corrective" size="md">
              {creatingAction && (
                <ActionForm
                  users={lookups!.users}
                  source={{ type: 'andon', id: alert.id }}
                  defaults={{
                    title: `Éviter la récidive : ${alert.detail}`,
                    priority:
                      PRIORITY_BY_SEVERITY[alert.urgency === 'critical' ? 'critical' : alert.urgency === 'medium' ? 'major' : 'minor'],
                    dueDate: addDays(todayKey(), alert.urgency === 'critical' ? 1 : 3),
                  }}
                  onDone={() => setCreatingAction(false)}
                />
              )}
            </Drawer>
          </>
        );
      }}
    </QueryBoundary>
  );
}
