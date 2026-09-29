import { useState } from 'react';
import { useParams } from 'react-router';
import { Plus } from 'lucide-react';
import { useAuth, useCurrentUser } from '@/app/providers/AuthProvider';
import { ItemList, KeyValueList } from '@/components/data-display/ItemList';
import { EmptyState, QueryBoundary } from '@/components/feedback/States';
import { Columns, PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { FormActions, TextAreaField } from '@/components/ui/Field';
import { Drawer, Modal } from '@/components/ui/Overlay';
import { Panel } from '@/components/ui/Panel';
import { ActionForm } from '@/features/actions/components/ActionForm';
import { ActionStatusBadge } from '@/features/actions/components/ActionBadges';
import { PRIORITY_BY_SEVERITY, defaultDueDate, isOpenAction } from '@/features/actions/model';
import { CommentThread } from '@/features/shared/components/CommentThread';
import { ANOMALY_CATEGORY, ANOMALY_STATUS, SEVERITY } from '@/features/shared/labels';
import { useLookups, type Lookups } from '@/features/shared/api';
import { useCollection } from '@/hooks/useData';
import type { Action, Anomaly } from '@/types/domain';
import { formatDate, formatDateTime, todayKey } from '@/utils/date';
import { truncate } from '@/utils/format';
import { useUpdateAnomalyStatus } from '../api';

const ORIGIN_LABEL: Record<Anomaly['origin']['type'], string> = {
  manual: 'Déclaration directe',
  qr: 'QR code du poste',
  routine: 'Routine (point non conforme)',
  quality: 'Contrôle LQC hors tolérance',
  andon: 'Andon',
  gemba: 'Gemba Walk',
};

export function AnomalyDetailPage() {
  const { id } = useParams();
  const anomalies = useCollection('anomalies');
  const actions = useCollection('actions');
  const { queries, lookups } = useLookups();
  return (
    <QueryBoundary queries={[anomalies, actions, ...queries]}>
      {() => {
        const anomaly = anomalies.data!.find((a) => a.id === id);
        if (!anomaly) return <EmptyState title="Anomalie introuvable" action={<ButtonLink to="/anomalies">Retour aux anomalies</ButtonLink>} />;
        const linked = actions.data!.filter((a) => a.source.type === 'anomaly' && a.source.id === anomaly.id);
        return <AnomalyDetail anomaly={anomaly} linked={linked} lookups={lookups!} />;
      }}
    </QueryBoundary>
  );
}

function AnomalyDetail({ anomaly, linked, lookups }: { anomaly: Anomaly; linked: Action[]; lookups: Lookups }) {
  const user = useCurrentUser();
  const { can } = useAuth();
  const updateStatus = useUpdateAnomalyStatus();
  const [creatingAction, setCreatingAction] = useState(false);
  const [closing, setClosing] = useState(false);
  const [note, setNote] = useState('');
  const today = todayKey();
  const openActions = linked.filter(isOpenAction).length;
  const manage = can('anomaly.manage');

  return (
    <>
      <PageHeader
        back={{ to: '/anomalies', label: 'Anomalies' }}
        title={truncate(anomaly.description, 120)}
        meta={
          <>
            <Badge tone={ANOMALY_STATUS[anomaly.status].tone}>{ANOMALY_STATUS[anomaly.status].label}</Badge>
            <Badge tone={SEVERITY[anomaly.severity].tone}>{SEVERITY[anomaly.severity].label}</Badge>
            <Badge>{ANOMALY_CATEGORY[anomaly.category]}</Badge>
          </>
        }
        actions={
          manage && (
            <>
              {anomaly.status === 'open' && (
                <Button onClick={() => updateStatus.mutate({ id: anomaly.id, status: 'in_progress', by: user.id })} loading={updateStatus.isPending}>Prendre en charge</Button>
              )}
              {anomaly.status !== 'closed' && <Button variant="success" onClick={() => setClosing(true)}>Clôturer</Button>}
              {anomaly.status === 'closed' && (
                <Button onClick={() => updateStatus.mutate({ id: anomaly.id, status: 'open', by: user.id })} loading={updateStatus.isPending}>Rouvrir</Button>
              )}
            </>
          )
        }
      />

      <Columns sideFirstOnMobile>
        <Stack>
          {(anomaly.description.length > 120 || anomaly.photo || anomaly.resolutionNote) && (
          <Panel title="Description">
            {anomaly.description.length > 120 && <p style={{ whiteSpace: 'pre-wrap' }}>{anomaly.description}</p>}
            {anomaly.photo && <img src={anomaly.photo} alt="Photo jointe à la déclaration" style={{ marginTop: 'var(--space-4)', maxWidth: '100%', maxHeight: 420, borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }} />}
            {anomaly.resolutionNote && (
              <p style={{ marginTop: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--color-success-soft)', borderRadius: 'var(--radius-md)' }}>
                <strong>Résolution :</strong> {anomaly.resolutionNote}
              </p>
            )}
          </Panel>
          )}

          <Panel
            title="Actions correctives"
            description={linked.length ? `${openActions} ouverte(s) sur ${linked.length}` : undefined}
            flush
            actions={
              can('action.create') && anomaly.status !== 'closed' && (
                <Button size="sm" icon={<Plus size={15} aria-hidden />} onClick={() => setCreatingAction(true)}>Créer une action</Button>
              )
            }
          >
            {linked.length === 0 ? (
              <EmptyState compact title="Aucune action corrective liée." />
            ) : (
              <ItemList
                items={linked.map((a) => ({
                  id: a.id,
                  title: a.title,
                  meta: `${lookups.userName(a.assigneeId)} · échéance ${formatDate(a.dueDate)}`,
                  aside: <ActionStatusBadge action={a} today={today} />,
                  to: `/actions/${a.id}`,
                }))}
              />
            )}
          </Panel>

          <Panel title="Commentaires">
            <CommentThread
              targetType="anomaly"
              targetId={anomaly.id}
              notifyUserIds={[anomaly.reportedBy, ...linked.map((a) => a.assigneeId)]}
              title={anomaly.description}
              link={`/anomalies/${anomaly.id}`}
              userName={lookups.userName}
            />
          </Panel>
        </Stack>

        <Panel title="Informations">
          <KeyValueList
            items={[
              { label: 'Poste', value: lookups.workstationName(anomaly.workstationId) },
              { label: 'Déclarée par', value: lookups.userName(anomaly.reportedBy) },
              { label: 'Déclarée le', value: formatDateTime(anomaly.createdAt) },
              { label: 'Origine', value: ORIGIN_LABEL[anomaly.origin.type] },
              ...(anomaly.closedAt
                ? [
                    { label: 'Clôturée le', value: formatDateTime(anomaly.closedAt) },
                    { label: 'Clôturée par', value: lookups.userName(anomaly.closedBy) },
                  ]
                : []),
            ]}
          />
        </Panel>
      </Columns>

      <Drawer open={creatingAction} onClose={() => setCreatingAction(false)} title="Action corrective" description="Échéance et priorité proposées selon la gravité de l’anomalie." size="md">
        {creatingAction && (
          <ActionForm
            users={lookups.users}
            source={{ type: 'anomaly', id: anomaly.id }}
            defaults={{ title: `Traiter : ${truncate(anomaly.description, 120)}`, priority: PRIORITY_BY_SEVERITY[anomaly.severity], dueDate: defaultDueDate(anomaly.severity, today) }}
            onDone={() => setCreatingAction(false)}
          />
        )}
      </Drawer>

      <Modal open={closing} onClose={() => setClosing(false)} title="Clôturer l’anomalie" size="sm">
        {openActions > 0 && (
          <p style={{ marginBottom: 'var(--space-3)', color: 'var(--color-warning)', fontWeight: 500 }} role="alert">
            {openActions} action(s) corrective(s) encore ouverte(s). Vous pouvez clôturer quand même si le problème est traité.
          </p>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await updateStatus.mutateAsync({ id: anomaly.id, status: 'closed', by: user.id, resolutionNote: note.trim() || undefined });
            setClosing(false);
          }}
        >
          <TextAreaField label="Résolution (facultative)" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Cause et traitement réalisés" />
          <FormActions>
            <Button onClick={() => setClosing(false)}>Annuler</Button>
            <Button type="submit" variant="success" loading={updateStatus.isPending}>Clôturer</Button>
          </FormActions>
        </form>
      </Modal>
    </>
  );
}
