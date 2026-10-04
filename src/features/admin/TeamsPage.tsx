import { shiftOptions } from '@/app/catalog';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { DataTable, type Column } from '@/components/data-display/DataTable';
import { QueryBoundary } from '@/components/feedback/States';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox, FormActions, FormGrid, SelectField, TextField } from '@/components/ui/Field';
import { Drawer } from '@/components/ui/Overlay';
import { Panel } from '@/components/ui/Panel';
import { lineOptions, userOptions, useLookups, type Lookups } from '@/features/shared/api';
import { SHIFT_SHORT } from '@/features/shared/labels';
import { useCollection } from '@/hooks/useData';
import { useForm } from '@/hooks/useForm';
import { ROLE_LABELS } from '@/services/auth/permissions';
import type { Shift, Team } from '@/types/domain';
import { required } from '@/utils/validation';
import { useSaveTeam, useSetTeamActive } from './api';

/** Équipes : quart, ligne, responsable, membres. Une routine affectée à une équipe est visible de tous ses membres. */
export function TeamsPage() {
  const { queries, lookups } = useLookups();
  const schedules = useCollection('schedules');
  const setActive = useSetTeamActive();
  const [editing, setEditing] = useState<Team | 'new' | null>(null);

  const columns: Column<Team>[] = [
    { id: 'name', header: 'Équipe', mobile: 'title', cell: (t) => t.name, sortValue: (t) => t.name },
    { id: 'shift', header: 'Quart', mobile: 'meta', cell: (t) => (t.shift ? SHIFT_SHORT[t.shift] : 'Plusieurs quarts') },
    { id: 'line', header: 'Zone', mobile: 'meta', cell: (t) => (t.lineId ? lookups?.lineName(t.lineId) : 'Toutes') },
    { id: 'leader', header: 'Responsable', mobile: 'meta', cell: (t) => lookups?.userName(t.leaderId) },
    {
      id: 'members',
      header: 'Membres',
      align: 'center',
      mobile: 'meta',
      cell: (t) => lookups?.teamMembers(t.id).length ?? 0,
      sortValue: (t) => lookups?.teamMembers(t.id).length ?? 0,
    },
    {
      id: 'routines',
      header: 'Routines affectées',
      align: 'center',
      mobile: 'meta',
      cell: (t) => (schedules.data ?? []).filter((s) => s.teamId === t.id && s.status === 'active').length,
    },
    {
      id: 'status',
      header: 'Statut',
      mobile: 'aside',
      cell: (t) => (t.active ? <Badge tone="success">Active</Badge> : <Badge>Désactivée</Badge>),
      sortValue: (t) => (t.active ? 0 : 1),
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      mobile: 'meta',
      cell: (t) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <Button size="sm" onClick={() => setEditing(t)}>
            Modifier
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setActive.mutate({ id: t.id, active: !t.active })}>
            {t.active ? 'Désactiver' : 'Réactiver'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Équipes"
        description="Une routine ou une réunion affectée à une équipe concerne tous ses membres actifs. Le quart et la zone des membres suivent leur équipe."
        actions={
          <Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setEditing('new')}>
            Nouvelle équipe
          </Button>
        }
      />
      <QueryBoundary queries={[...queries, schedules]}>
        {() => (
          <Panel flush>
            <DataTable
              caption="Équipes"
              rows={lookups!.teams}
              columns={columns}
              rowKey={(t) => t.id}
              initialSort={{ id: 'name', direction: 'asc' }}
              empty={{ title: 'Aucune équipe.', action: <Button onClick={() => setEditing('new')}>Créer une équipe</Button> }}
            />
          </Panel>
        )}
      </QueryBoundary>
      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Nouvelle équipe' : 'Modifier l’équipe'}
        size="md"
      >
        {editing !== null && lookups && (
          <TeamForm
            key={editing === 'new' ? 'new' : editing.id}
            team={editing === 'new' ? undefined : editing}
            lookups={lookups}
            onDone={() => setEditing(null)}
          />
        )}
      </Drawer>
    </>
  );
}

function TeamForm({ team, lookups, onDone }: { team?: Team; lookups: Lookups; onDone: () => void }) {
  const save = useSaveTeam();
  const [search, setSearch] = useState('');
  const form = useForm({
    initial: {
      name: team?.name ?? '',
      shift: (team?.shift ?? '') as Shift | '',
      lineId: team?.lineId ?? '',
      leaderId: team?.leaderId ?? '',
      memberIds: team ? lookups.teamMembers(team.id).map((u) => u.id) : ([] as string[]),
    },
    rules: { name: [required('Nommez l’équipe')] },
    onSubmit: async (v) => {
      await save.mutateAsync({
        id: team?.id,
        memberIds: v.memberIds,
        input: {
          name: v.name,
          shift: v.shift || undefined,
          lineId: v.lineId || undefined,
          leaderId: v.leaderId || undefined,
          active: team?.active ?? true,
        },
      });
      onDone();
    },
  });
  const { values, set, errors } = form;
  const candidates = lookups.activeUsers.filter((u) => u.role !== 'admin' && u.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <form onSubmit={form.handleSubmit} noValidate>
      <FormGrid>
        <TextField
          className="full"
          label="Nom"
          required
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
          error={errors.name}
        />
        <SelectField
          label="Quart"
          placeholder="Plusieurs quarts"
          options={shiftOptions('short', values.shift || null)}
          value={values.shift}
          onChange={(e) => set('shift', e.target.value as Shift | '')}
        />
        <SelectField
          label="Zone (ligne)"
          placeholder="Toutes les zones"
          options={lineOptions(lookups.lines)}
          value={values.lineId}
          onChange={(e) => set('lineId', e.target.value)}
        />
        <SelectField
          className="full"
          label="Responsable"
          placeholder="Aucun"
          options={userOptions(lookups.activeUsers)}
          value={values.leaderId}
          onChange={(e) => set('leaderId', e.target.value)}
        />
      </FormGrid>
      <h3 style={{ margin: 'var(--space-5) 0 var(--space-2)', fontSize: 'var(--text-md)' }}>Membres ({values.memberIds.length})</h3>
      <TextField label="Rechercher une personne" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          marginTop: 'var(--space-2)',
          maxHeight: 320,
          overflowY: 'auto',
        }}
      >
        {candidates.map((u) => {
          const other = u.teamId && u.teamId !== team?.id ? lookups.teamName(u.teamId) : null;
          return (
            <Checkbox
              key={u.id}
              label={u.name}
              description={`${ROLE_LABELS[u.role]}${other ? ` · actuellement dans ${other}` : ''}`}
              checked={values.memberIds.includes(u.id)}
              onChange={(e) =>
                set('memberIds', e.target.checked ? [...values.memberIds, u.id] : values.memberIds.filter((x) => x !== u.id))
              }
            />
          );
        })}
      </div>
      <FormActions>
        <Button onClick={onDone}>Annuler</Button>
        <Button type="submit" variant="primary" loading={form.submitting}>
          Enregistrer l’équipe
        </Button>
      </FormActions>
    </form>
  );
}
