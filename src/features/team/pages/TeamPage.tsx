import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useAuth, useCurrentUser } from '@/app/providers/AuthProvider';
import { DataTable, type Column } from '@/components/data-display/DataTable';
import { ItemList } from '@/components/data-display/ItemList';
import { EmptyState, QueryBoundary } from '@/components/feedback/States';
import { PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { FormActions, FormGrid, SelectField, TextField } from '@/components/ui/Field';
import { Kpi, KpiStrip } from '@/components/ui/Kpi';
import { Drawer } from '@/components/ui/Overlay';
import { Panel } from '@/components/ui/Panel';
import { SHIFT_SHORT } from '@/features/shared/labels';
import { useLookups, userOptions, type Lookups } from '@/features/shared/api';
import { useCollection } from '@/hooks/useData';
import { useForm } from '@/hooks/useForm';
import { ROLE_LABELS } from '@/services/auth/permissions';
import type { User } from '@/types/domain';
import { formatDate, formatLongDate, todayKey } from '@/utils/date';
import { required } from '@/utils/validation';
import { useCreateLeave, useDeleteLeave, useSetPresence } from '../api';
import { MEMBER_STATUS, activeLeave, memberStatus, teamMembers } from '../model';

export function TeamPage() {
  const user = useCurrentUser();
  const { can } = useAuth();
  const today = todayKey();
  const presence = useCollection('presence');
  const leaves = useCollection('leaves');
  const { queries, lookups } = useLookups();
  const setPresence = useSetPresence();
  const deleteLeave = useDeleteLeave();
  const confirm = useConfirm();
  const [addingLeave, setAddingLeave] = useState(false);

  return (
    <>
      <PageHeader
        title="Équipe"
        description={`Présences du ${formatLongDate(today)} et congés. Le statut « en congé » est calculé à partir des congés enregistrés.`}
      />
      <QueryBoundary queries={[presence, leaves, ...queries]}>
        {() => {
          const members = teamMembers(lookups!.users);
          const statusOf = (u: User) => memberStatus(u.id, today, presence.data!, leaves.data!);
          const count = (s: ReturnType<typeof statusOf>) => members.filter((m) => statusOf(m) === s).length;
          const columns: Column<User>[] = [
            { id: 'name', header: 'Nom', mobile: 'title', cell: (u) => u.name, sortValue: (u) => u.name },
            { id: 'role', header: 'Rôle', mobile: 'meta', cell: (u) => ROLE_LABELS[u.role], sortValue: (u) => u.role },
            { id: 'zone', header: 'Zone', mobile: 'meta', cell: (u) => u.zoneLabel ?? '—' },
            { id: 'shift', header: 'Équipe', mobile: 'meta', cell: (u) => (u.shift ? SHIFT_SHORT[u.shift] : '—') },
            {
              id: 'status',
              header: 'Statut du jour',
              mobile: 'aside',
              cell: (u) => {
                const st = statusOf(u);
                const leave = activeLeave(leaves.data!, u.id, today);
                return (
                  <span title={leave ? `Congé jusqu’au ${formatDate(leave.to)}` : undefined}>
                    <Badge tone={MEMBER_STATUS[st].tone}>{MEMBER_STATUS[st].label}</Badge>
                  </span>
                );
              },
              sortValue: (u) => statusOf(u),
            },
            ...(can('team.updateStatus')
              ? [
                  {
                    id: 'set',
                    header: 'Saisie',
                    align: 'right' as const,
                    mobile: 'meta' as const,
                    cell: (u: User) =>
                      statusOf(u) === 'on_leave' ? (
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                          jusqu’au {formatDate(activeLeave(leaves.data!, u.id, today)!.to)}
                        </span>
                      ) : (
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <Button
                            size="sm"
                            variant={statusOf(u) === 'present' ? 'success' : 'secondary'}
                            aria-pressed={statusOf(u) === 'present'}
                            onClick={() => setPresence.mutate({ userId: u.id, date: today, status: 'present', recordedBy: user.id })}
                          >
                            Présent
                          </Button>
                          <Button
                            size="sm"
                            variant={statusOf(u) === 'absent' ? 'danger' : 'secondary'}
                            aria-pressed={statusOf(u) === 'absent'}
                            onClick={() => setPresence.mutate({ userId: u.id, date: today, status: 'absent', recordedBy: user.id })}
                          >
                            Absent
                          </Button>
                        </div>
                      ),
                  },
                ]
              : []),
          ];
          const sortedLeaves = [...leaves.data!].filter((l) => l.to >= today).sort((a, b) => a.from.localeCompare(b.from));
          return (
            <Stack>
              <KpiStrip>
                <Kpi label="Présents" value={count('present')} tone="success" detail={`sur ${members.length}`} />
                <Kpi label="Absents" value={count('absent')} tone={count('absent') ? 'danger' : 'neutral'} />
                <Kpi label="En congé" value={count('on_leave')} />
                <Kpi label="Non renseignés" value={count('unknown')} tone={count('unknown') ? 'warning' : 'neutral'} />
              </KpiStrip>
              <Panel title="Membres" flush>
                <DataTable
                  caption="Membres de l’équipe"
                  rows={members}
                  columns={columns}
                  rowKey={(u) => u.id}
                  initialSort={{ id: 'name', direction: 'asc' }}
                  search={{ placeholder: 'Rechercher une personne', text: (u) => `${u.name} ${u.zoneLabel ?? ''}` }}
                  empty={{ title: 'Aucun membre actif.' }}
                />
              </Panel>
              <Panel
                title="Congés en cours et à venir"
                flush
                actions={
                  can('leave.manage') && (
                    <Button size="sm" icon={<Plus size={15} aria-hidden />} onClick={() => setAddingLeave(true)}>
                      Ajouter
                    </Button>
                  )
                }
              >
                {sortedLeaves.length === 0 ? (
                  <EmptyState compact title="Aucun congé en cours ou planifié." />
                ) : (
                  <ItemList
                    items={sortedLeaves.map((l) => ({
                      id: l.id,
                      title: lookups!.userName(l.userId),
                      meta: `${formatDate(l.from)} → ${formatDate(l.to)}${l.reason ? ` · ${l.reason}` : ''}`,
                      aside: (
                        <>
                          <Badge tone={l.from <= today ? 'warning' : 'neutral'}>{l.from <= today ? 'En cours' : 'Planifié'}</Badge>
                          {can('leave.manage') && (
                            <IconButton
                              size="sm"
                              label={`Supprimer le congé de ${lookups!.userName(l.userId)}`}
                              icon={<Trash2 size={15} />}
                              onClick={async () => {
                                if (
                                  await confirm({
                                    title: 'Supprimer ce congé ?',
                                    message: 'Le statut du jour sera recalculé.',
                                    confirmLabel: 'Supprimer',
                                    tone: 'danger',
                                  })
                                )
                                  deleteLeave.mutate(l.id);
                              }}
                            />
                          )}
                        </>
                      ),
                    }))}
                  />
                )}
              </Panel>
            </Stack>
          );
        }}
      </QueryBoundary>
      <Drawer open={addingLeave} onClose={() => setAddingLeave(false)} title="Enregistrer un congé" size="sm">
        {addingLeave && lookups && <LeaveForm lookups={lookups} onDone={() => setAddingLeave(false)} />}
      </Drawer>
    </>
  );
}

function LeaveForm({ lookups, onDone }: { lookups: Lookups; onDone: () => void }) {
  const create = useCreateLeave();
  const form = useForm({
    initial: { userId: '', from: todayKey(), to: todayKey(), reason: '' },
    rules: { userId: [required('Choisissez une personne')], from: [required()], to: [required()] },
    onSubmit: async (v) => {
      await create.mutateAsync({ userId: v.userId, from: v.from, to: v.to, reason: v.reason.trim() || undefined });
      onDone();
    },
  });
  const { values, set, errors } = form;
  const reversed = values.to < values.from;
  return (
    <form onSubmit={form.handleSubmit} noValidate>
      <FormGrid columns={1}>
        <SelectField
          label="Personne"
          required
          placeholder="Choisir…"
          options={userOptions(teamMembers(lookups.users))}
          value={values.userId}
          onChange={(e) => set('userId', e.target.value)}
          error={errors.userId}
        />
        <TextField label="Du" type="date" required value={values.from} onChange={(e) => set('from', e.target.value)} />
        <TextField
          label="Au"
          type="date"
          required
          min={values.from}
          value={values.to}
          onChange={(e) => set('to', e.target.value)}
          error={errors.to ?? (reversed ? 'Doit être après la date de début' : undefined)}
        />
        <TextField label="Motif (facultatif)" value={values.reason} onChange={(e) => set('reason', e.target.value)} />
      </FormGrid>
      <FormActions>
        <Button onClick={onDone}>Annuler</Button>
        <Button type="submit" variant="primary" loading={form.submitting} disabled={reversed}>
          Enregistrer
        </Button>
      </FormActions>
    </form>
  );
}
