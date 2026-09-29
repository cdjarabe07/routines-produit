import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Pencil } from 'lucide-react';
import { useAuth, useCurrentUser } from '@/app/providers/AuthProvider';
import { KeyValueList } from '@/components/data-display/ItemList';
import { EmptyState, QueryBoundary } from '@/components/feedback/States';
import { Columns, PageHeader, Stack } from '@/components/layout/PageHeader';
import { Button, ButtonLink } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { Drawer, Modal } from '@/components/ui/Overlay';
import { FormActions, TextAreaField } from '@/components/ui/Field';
import { Panel } from '@/components/ui/Panel';
import { CommentThread } from '@/features/shared/components/CommentThread';
import { ACTION_SOURCE } from '@/features/shared/labels';
import { useLookups, type Lookups } from '@/features/shared/api';
import { useCollection } from '@/hooks/useData';
import type { Action } from '@/types/domain';
import { formatDate, formatDateTime, todayKey } from '@/utils/date';
import { useUpdateAction } from '../api';
import { ActionForm } from '../components/ActionForm';
import { ActionStatusBadge, DueDate, PriorityBadge } from '../components/ActionBadges';
import { closureDays, isOpenAction, sourceLink } from '../model';

export function ActionDetailPage() {
  const { id } = useParams();
  const actions = useCollection('actions');
  const { queries, lookups } = useLookups();
  return (
    <QueryBoundary queries={[actions, ...queries]}>
      {() => {
        const action = actions.data!.find((a) => a.id === id);
        if (!action)
          return (
            <EmptyState
              title="Action introuvable"
              description="Elle a peut-être été supprimée."
              action={<ButtonLink to="/actions">Retour aux actions</ButtonLink>}
            />
          );
        return <ActionDetail action={action} lookups={lookups!} />;
      }}
    </QueryBoundary>
  );
}

function ActionDetail({ action, lookups }: { action: Action; lookups: Lookups }) {
  const user = useCurrentUser();
  const { can } = useAuth();
  const update = useUpdateAction();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState<'done' | 'blocked' | null>(null);
  const today = todayKey();
  const allowed = can('action.update', { type: 'action', action });
  const link = sourceLink(action);
  const days = closureDays(action);

  const setStatus = (status: Action['status']) => update.mutate({ action, patch: { status }, actor: user });

  return (
    <>
      <PageHeader
        back={
          can('action.manage') ? { to: '/manager/actions', label: 'Actions correctives' } : { to: '/app/actions', label: 'Mes actions' }
        }
        title={action.title}
        meta={
          <>
            <ActionStatusBadge action={action} today={today} />
            <PriorityBadge action={action} />
          </>
        }
        actions={
          allowed && (
            <>
              {action.status === 'todo' && (
                <Button onClick={() => setStatus('in_progress')} loading={update.isPending}>
                  Démarrer
                </Button>
              )}
              {action.status === 'blocked' && (
                <Button
                  onClick={() => update.mutate({ action, patch: { status: 'in_progress', blockedReason: undefined }, actor: user })}
                  loading={update.isPending}
                >
                  Débloquer
                </Button>
              )}
              {(action.status === 'todo' || action.status === 'in_progress') && (
                <Button variant="ghost" onClick={() => setClosing('blocked')}>
                  Signaler un blocage
                </Button>
              )}
              {isOpenAction(action) && (
                <Button variant="success" onClick={() => setClosing('done')} loading={update.isPending}>
                  Marquer terminée
                </Button>
              )}
              {!isOpenAction(action) && (
                <Button onClick={() => setStatus('in_progress')} loading={update.isPending}>
                  Rouvrir
                </Button>
              )}
              {can('action.manage') && (
                <Button icon={<Pencil size={15} aria-hidden />} onClick={() => setEditing(true)}>
                  Modifier
                </Button>
              )}
              {isOpenAction(action) && can('action.manage') && (
                <Button
                  variant="ghost"
                  onClick={async () => {
                    if (
                      await confirm({
                        title: 'Annuler cette action ?',
                        message: 'Elle restera visible dans les actions terminées / annulées.',
                        confirmLabel: 'Annuler l’action',
                        tone: 'danger',
                      })
                    )
                      setStatus('cancelled');
                  }}
                >
                  Annuler l’action
                </Button>
              )}
            </>
          )
        }
      />
      <Columns sideFirstOnMobile>
        <Stack>
          {action.status === 'blocked' && (
            <Panel title="Action bloquée" accent="danger">
              <p style={{ whiteSpace: 'pre-wrap' }}>{action.blockedReason ?? 'Aucune précision.'}</p>
            </Panel>
          )}
          {action.description && (
            <Panel title="Problème et détails">
              <p style={{ whiteSpace: 'pre-wrap' }}>{action.description}</p>
            </Panel>
          )}
          {action.resolutionNote && (
            <Panel title="Résolution" accent="success">
              <p style={{ whiteSpace: 'pre-wrap' }}>{action.resolutionNote}</p>
            </Panel>
          )}
          <Panel title="Commentaires">
            <CommentThread
              targetType="action"
              targetId={action.id}
              notifyUserIds={[action.assigneeId, action.backupId, action.createdBy]}
              title={action.title}
              link={`/actions/${action.id}`}
              userName={lookups.userName}
            />
          </Panel>
        </Stack>
        <Panel title="Informations">
          <KeyValueList
            items={[
              { label: 'Responsable', value: lookups.userName(action.assigneeId) },
              { label: 'Suppléant', value: action.backupId ? lookups.userName(action.backupId) : 'Aucun' },
              { label: 'Échéance', value: <DueDate action={action} today={today} /> },
              {
                label: 'Origine',
                value: link ? <Link to={link}>{ACTION_SOURCE[action.source.type]}</Link> : ACTION_SOURCE[action.source.type],
              },
              { label: 'Créée par', value: `${lookups.userName(action.createdBy)} · ${formatDateTime(action.createdAt)}` },
              ...(action.closedAt
                ? [
                    {
                      label: 'Terminée le',
                      value: `${formatDate(action.closedAt)}${days !== null ? ` (en ${Math.round(days * 10) / 10} j)` : ''}`,
                    },
                  ]
                : []),
            ]}
          />
          {!allowed && (
            <p style={{ marginTop: 'var(--space-4)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              Seuls le responsable, le suppléant, le créateur ou l’encadrement peuvent changer le statut.
            </p>
          )}
        </Panel>
      </Columns>

      <Modal
        open={closing !== null}
        onClose={() => setClosing(null)}
        title={closing === 'done' ? 'Terminer l’action' : 'Signaler un blocage'}
        description={
          closing === 'done'
            ? 'Décrivez ce qui a été fait : la note reste attachée à l’action.'
            : 'Indiquez ce qui empêche d’avancer : le responsable et l’encadrement le verront.'
        }
        size="sm"
      >
        {closing && (
          <CloseForm
            kind={closing}
            onCancel={() => setClosing(null)}
            onSubmit={async (text) => {
              await update.mutateAsync({
                action,
                patch:
                  closing === 'done'
                    ? { status: 'done', resolutionNote: text, blockedReason: undefined }
                    : { status: 'blocked', blockedReason: text },
                actor: user,
              });
              setClosing(null);
            }}
          />
        )}
      </Modal>

      <Drawer open={editing} onClose={() => setEditing(false)} title="Modifier l’action" size="md">
        {editing && <ActionForm users={lookups.users} action={action} onDone={() => setEditing(false)} />}
      </Drawer>
    </>
  );
}

function CloseForm({
  kind,
  onCancel,
  onSubmit,
}: {
  kind: 'done' | 'blocked';
  onCancel: () => void;
  onSubmit: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) {
          setError(kind === 'done' ? 'Décrivez la résolution' : 'Indiquez la cause du blocage');
          return;
        }
        setBusy(true);
        try {
          await onSubmit(text.trim());
        } finally {
          setBusy(false);
        }
      }}
    >
      <TextAreaField
        label={kind === 'done' ? 'Résolution' : 'Cause du blocage'}
        required
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        error={error ?? undefined}
      />
      <FormActions>
        <Button onClick={onCancel}>Annuler</Button>
        <Button type="submit" variant={kind === 'done' ? 'success' : 'primary'} loading={busy}>
          {kind === 'done' ? 'Terminer' : 'Signaler le blocage'}
        </Button>
      </FormActions>
    </form>
  );
}
