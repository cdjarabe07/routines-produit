import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useCurrentUser } from '@/app/providers/AuthProvider';
import { DataTable, type Column } from '@/components/data-display/DataTable';
import { QueryBoundary } from '@/components/feedback/States';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox, FormActions, FormGrid, SelectField, TextField } from '@/components/ui/Field';
import { Drawer } from '@/components/ui/Overlay';
import { Panel } from '@/components/ui/Panel';
import { SHIFT_SHORT, options } from '@/features/shared/labels';
import { useLookups, type Lookups } from '@/features/shared/api';
import { useForm } from '@/hooks/useForm';
import { ROLE_LABELS, ROLE_ORDER } from '@/services/auth/permissions';
import type { Role, Shift, User } from '@/types/domain';
import { required } from '@/utils/validation';
import { useSaveUser } from './api';

export function UsersPage() {
  const { queries, lookups } = useLookups();
  const [editing, setEditing] = useState<User | 'new' | null>(null);

  const columns: Column<User>[] = [
    { id: 'name', header: 'Nom', mobile: 'title', cell: (u) => u.name, sortValue: (u) => u.name },
    { id: 'email', header: 'Email', mobile: 'meta', cell: (u) => u.email, sortValue: (u) => u.email },
    { id: 'role', header: 'Rôle', mobile: 'meta', cell: (u) => ROLE_LABELS[u.role], sortValue: (u) => ROLE_ORDER.indexOf(u.role) },
    { id: 'line', header: 'Ligne', mobile: 'meta', cell: (u) => (u.lineId ? lookups?.lineById.get(u.lineId)?.name : 'Toutes') },
    { id: 'shift', header: 'Équipe', mobile: 'meta', cell: (u) => (u.shift ? SHIFT_SHORT[u.shift] : '—') },
    { id: 'active', header: 'Statut', mobile: 'aside', cell: (u) => (u.active ? <Badge tone="success">Actif</Badge> : <Badge>Désactivé</Badge>), sortValue: (u) => (u.active ? 0 : 1) },
    { id: 'edit', header: '', align: 'right', mobile: 'meta', cell: (u) => <Button size="sm" onClick={(e) => { e.stopPropagation(); setEditing(u); }}>Modifier</Button> },
  ];

  return (
    <>
      <PageHeader
        title="Utilisateurs"
        description="Comptes, rôles et rattachements. En production, les identités viennent du fournisseur d’authentification ; seuls le rôle et le rattachement sont gérés ici."
        actions={<Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setEditing('new')}>Nouvel utilisateur</Button>}
      />
      <QueryBoundary queries={queries}>
        {() => (
          <Panel flush>
            <DataTable caption="Utilisateurs" rows={lookups!.users} columns={columns} rowKey={(u) => u.id} initialSort={{ id: 'name', direction: 'asc' }} search={{ placeholder: 'Rechercher un nom, un email…', text: (u) => `${u.name} ${u.email} ${ROLE_LABELS[u.role]}` }} empty={{ title: 'Aucun utilisateur.' }} />
          </Panel>
        )}
      </QueryBoundary>
      <Drawer open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nouvel utilisateur' : 'Modifier l’utilisateur'} size="md">
        {editing !== null && lookups && <UserForm user={editing === 'new' ? undefined : editing} lookups={lookups} onDone={() => setEditing(null)} />}
      </Drawer>
    </>
  );
}

function UserForm({ user, lookups, onDone }: { user?: User; lookups: Lookups; onDone: () => void }) {
  const me = useCurrentUser();
  const save = useSaveUser();
  const form = useForm({
    initial: {
      name: user?.name ?? '', email: user?.email ?? '', role: user?.role ?? ('operator' as Role), lineId: user?.lineId ?? '',
      zoneLabel: user?.zoneLabel ?? '', shift: user?.shift ?? ('morning' as Shift), active: user?.active ?? true,
    },
    rules: {
      name: [required('Nom obligatoire')],
      email: [required('Email obligatoire'), (v: string) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? null : 'Adresse email invalide')],
    },
    onSubmit: async (v) => {
      await save.mutateAsync({
        id: user?.id,
        input: { name: v.name.trim(), email: v.email, role: v.role, lineId: v.lineId || undefined, zoneLabel: v.zoneLabel.trim() || undefined, shift: v.shift, active: v.active },
      });
      onDone();
    },
  });
  const { values, set, errors } = form;
  const isMe = user?.id === me.id;
  return (
    <form onSubmit={form.handleSubmit} noValidate>
      <FormGrid>
        <TextField className="full" label="Nom complet" required value={values.name} onChange={(e) => set('name', e.target.value)} error={errors.name} />
        <TextField className="full" label="Email" type="email" required value={values.email} onChange={(e) => set('email', e.target.value)} error={errors.email} />
        <SelectField label="Rôle" options={ROLE_ORDER.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} value={values.role} onChange={(e) => set('role', e.target.value as Role)} disabled={isMe} hint={isMe ? 'Vous ne pouvez pas modifier votre propre rôle.' : undefined} />
        <SelectField label="Équipe" options={options(SHIFT_SHORT)} value={values.shift} onChange={(e) => set('shift', e.target.value as Shift)} />
        <SelectField label="Ligne" placeholder="Toutes les lignes" options={lookups.lines.map((l) => ({ value: l.id, label: l.name }))} value={values.lineId} onChange={(e) => set('lineId', e.target.value)} />
        <TextField label="Zone / poste habituel" value={values.zoneLabel} onChange={(e) => set('zoneLabel', e.target.value)} />
        <div className="full">
          <Checkbox label="Compte actif" description={isMe ? 'Vous ne pouvez pas désactiver votre propre compte.' : 'Un compte désactivé ne peut plus se connecter ; son historique est conservé.'} checked={values.active} disabled={isMe} onChange={(e) => set('active', e.target.checked)} />
        </div>
      </FormGrid>
      <FormActions>
        <Button onClick={onDone}>Annuler</Button>
        <Button type="submit" variant="primary" loading={form.submitting}>Enregistrer</Button>
      </FormActions>
    </form>
  );
}
