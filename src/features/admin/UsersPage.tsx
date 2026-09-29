import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Plus } from 'lucide-react';
import { useCurrentUser } from '@/app/providers/AuthProvider';
import { useDataSource } from '@/app/providers/DataSourceProvider';
import { DataTable, type Column } from '@/components/data-display/DataTable';
import { QueryBoundary } from '@/components/feedback/States';
import { PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { Checkbox, FormActions, FormGrid, SelectField, TextField } from '@/components/ui/Field';
import { Drawer } from '@/components/ui/Overlay';
import { Panel } from '@/components/ui/Panel';
import { SHIFT_SHORT, options } from '@/features/shared/labels';
import { lineOptions, teamOptions, useLookups, workstationOptions, type Lookups } from '@/features/shared/api';
import { useForm } from '@/hooks/useForm';
import { PROFILE_LABELS, ROLE_LABELS, ROLE_ORDER, ROLE_PROFILE } from '@/services/auth/permissions';
import type { Role, Shift, User } from '@/types/domain';
import { formatDateTime } from '@/utils/date';
import { required } from '@/utils/validation';
import { useResetUserPassword, useSaveUser } from './api';
import styles from './UsersPage.module.css';

/** Utilisateurs : recherche, filtres, création, modification, désactivation, rôle, équipe, poste. */
export function UsersPage() {
  const { queries, lookups } = useLookups();
  const [params, setParams] = useSearchParams();
  const role = params.get('role') ?? '';
  const team = params.get('equipe') ?? '';
  const status = params.get('statut') ?? 'actifs';
  const editingId = params.get('utilisateur');
  const creating = params.get('nouveau') === '1';

  const setParam = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p, { replace: true });
  };

  const columns: Column<User>[] = [
    { id: 'name', header: 'Nom', mobile: 'title', cell: (u) => u.name, sortValue: (u) => u.name },
    { id: 'email', header: 'Email', mobile: 'meta', cell: (u) => u.email, sortValue: (u) => u.email },
    {
      id: 'role',
      header: 'Rôle',
      mobile: 'meta',
      cell: (u) => (
        <span>
          {ROLE_LABELS[u.role]} <span className={styles.profile}>· {PROFILE_LABELS[ROLE_PROFILE[u.role]]}</span>
        </span>
      ),
      sortValue: (u) => ROLE_ORDER.indexOf(u.role),
    },
    {
      id: 'team',
      header: 'Équipe',
      mobile: 'meta',
      cell: (u) => (u.teamId ? lookups?.teamName(u.teamId) : '—'),
      sortValue: (u) => (u.teamId ? (lookups?.teamName(u.teamId) ?? '') : ''),
    },
    {
      id: 'ws',
      header: 'Poste',
      mobile: 'meta',
      cell: (u) => (u.workstationId ? (lookups?.workstationById.get(u.workstationId)?.code ?? '—') : '—'),
    },
    {
      id: 'last',
      header: 'Dernière activité',
      mobile: 'meta',
      cell: (u) => (u.lastSignInAt ? formatDateTime(u.lastSignInAt) : 'Jamais connecté'),
      sortValue: (u) => u.lastSignInAt ?? '',
    },
    {
      id: 'active',
      header: 'Statut',
      mobile: 'aside',
      cell: (u) => (u.active ? <Badge tone="success">Actif</Badge> : <Badge>Désactivé</Badge>),
      sortValue: (u) => (u.active ? 0 : 1),
    },
    {
      id: 'edit',
      header: '',
      align: 'right',
      mobile: 'meta',
      cell: (u) => (
        <Button
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setParam({ utilisateur: u.id });
          }}
        >
          Modifier
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Utilisateurs"
        description="Comptes, rôles et rattachements. Le rôle détermine l’espace d’accueil et les droits (écran Rôles et droits)."
        actions={
          <Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setParam({ nouveau: '1' })}>
            Nouvel utilisateur
          </Button>
        }
      />
      <QueryBoundary queries={queries}>
        {() => {
          const rows = lookups!.users
            .filter((u) => (status === 'actifs' ? u.active : status === 'desactives' ? !u.active : true))
            .filter((u) => !role || u.role === role)
            .filter((u) => !team || (team === 'aucune' ? !u.teamId : u.teamId === team));
          return (
            <Stack>
              <div className={styles.filters}>
                <SelectField
                  label="Rôle"
                  placeholder="Tous les rôles"
                  options={ROLE_ORDER.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
                  value={role}
                  onChange={(e) => setParam({ role: e.target.value || null })}
                />
                <SelectField
                  label="Équipe"
                  placeholder="Toutes les équipes"
                  options={[...teamOptions(lookups!.teams), { value: 'aucune', label: 'Sans équipe' }]}
                  value={team}
                  onChange={(e) => setParam({ equipe: e.target.value || null })}
                />
                <SelectField
                  label="Statut"
                  options={[
                    { value: 'actifs', label: 'Actifs' },
                    { value: 'desactives', label: 'Désactivés' },
                    { value: 'tous', label: 'Tous' },
                  ]}
                  value={status}
                  onChange={(e) => setParam({ statut: e.target.value === 'actifs' ? null : e.target.value })}
                />
              </div>
              <Panel flush>
                <DataTable
                  caption="Utilisateurs"
                  rows={rows}
                  columns={columns}
                  rowKey={(u) => u.id}
                  initialSort={{ id: 'name', direction: 'asc' }}
                  search={{ placeholder: 'Rechercher un nom, un email…', text: (u) => `${u.name} ${u.email} ${ROLE_LABELS[u.role]}` }}
                  empty={{ title: 'Aucun utilisateur ne correspond à ces filtres.' }}
                />
              </Panel>
            </Stack>
          );
        }}
      </QueryBoundary>
      <Drawer
        open={creating || Boolean(editingId)}
        onClose={() => setParam({ utilisateur: null, nouveau: null })}
        title={editingId ? 'Modifier l’utilisateur' : 'Nouvel utilisateur'}
        size="md"
      >
        {(creating || editingId) && lookups && (
          <UserForm
            key={editingId ?? 'new'}
            user={editingId ? lookups.userById.get(editingId) : undefined}
            lookups={lookups}
            onDone={() => setParam({ utilisateur: null, nouveau: null })}
          />
        )}
      </Drawer>
    </>
  );
}

function UserForm({ user, lookups, onDone }: { user?: User; lookups: Lookups; onDone: () => void }) {
  const me = useCurrentUser();
  const ds = useDataSource();
  const confirm = useConfirm();
  const save = useSaveUser();
  const resetPassword = useResetUserPassword();
  // Mot de passe provisoire : affiché une seule fois, jamais stocké par l'application
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);
  const serverAccounts = Boolean(ds.accounts);
  const form = useForm({
    initial: {
      name: user?.name ?? '',
      email: user?.email ?? '',
      role: user?.role ?? ('operator' as Role),
      teamId: user?.teamId ?? '',
      lineId: user?.lineId ?? '',
      workstationId: user?.workstationId ?? '',
      zoneLabel: user?.zoneLabel ?? '',
      shift: user?.shift ?? ('morning' as Shift),
      active: user?.active ?? true,
    },
    rules: {
      name: [required('Nom obligatoire')],
      email: [
        required('Email obligatoire'),
        (v: string) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? null : 'Adresse email invalide'),
      ],
    },
    onSubmit: async (v) => {
      const result = await save.mutateAsync({
        id: user?.id,
        input: {
          name: v.name.trim(),
          email: v.email,
          role: v.role,
          teamId: v.teamId || undefined,
          lineId: v.lineId || undefined,
          workstationId: v.workstationId || undefined,
          zoneLabel: v.zoneLabel.trim() || undefined,
          shift: v.shift,
          active: v.active,
          lastSignInAt: user?.lastSignInAt,
        },
      });
      if (result.temporaryPassword) setIssued({ email: result.user.email, password: result.temporaryPassword });
      else onDone();
    },
  });
  const { values, set, errors } = form;
  const isMe = user?.id === me.id;
  const team = values.teamId ? lookups.teamById.get(values.teamId) : undefined;
  if (issued) return <TemporaryPassword {...issued} onDone={onDone} />;
  return (
    <form onSubmit={form.handleSubmit} noValidate>
      <FormGrid>
        <TextField
          className="full"
          label="Nom complet"
          required
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
          error={errors.name}
        />
        <TextField
          className="full"
          label="Email"
          type="email"
          required
          value={values.email}
          onChange={(e) => set('email', e.target.value)}
          error={errors.email}
          disabled={serverAccounts && Boolean(user)}
          hint={serverAccounts && user ? 'Identifiant de connexion : non modifiable ici.' : undefined}
        />
        <SelectField
          label="Rôle"
          options={ROLE_ORDER.map((r) => ({ value: r, label: `${ROLE_LABELS[r]} — ${PROFILE_LABELS[ROLE_PROFILE[r]]}` }))}
          value={values.role}
          onChange={(e) => set('role', e.target.value as Role)}
          disabled={isMe}
          hint={isMe ? 'Vous ne pouvez pas modifier votre propre rôle.' : undefined}
        />
        <SelectField
          label="Équipe"
          placeholder="Aucune équipe"
          options={teamOptions(lookups.teams)}
          value={values.teamId}
          onChange={(e) => set('teamId', e.target.value)}
          hint={team ? `Quart et zone repris de l’équipe${team.shift ? ` (${SHIFT_SHORT[team.shift]})` : ''}.` : undefined}
        />
        <SelectField
          label="Quart"
          options={options(SHIFT_SHORT)}
          value={values.shift}
          onChange={(e) => set('shift', e.target.value as Shift)}
          disabled={Boolean(team?.shift)}
        />
        <SelectField
          label="Zone (ligne)"
          placeholder="Toutes les zones"
          options={lineOptions(lookups.lines)}
          value={values.lineId}
          onChange={(e) => set('lineId', e.target.value)}
          disabled={Boolean(team?.lineId)}
        />
        <SelectField
          label="Poste habituel"
          placeholder="Aucun"
          options={workstationOptions(lookups.workstations)}
          value={values.workstationId}
          onChange={(e) => set('workstationId', e.target.value)}
        />
        <TextField label="Libellé de zone affiché" value={values.zoneLabel} onChange={(e) => set('zoneLabel', e.target.value)} />
        <div className="full">
          <Checkbox
            label="Compte actif"
            description={
              isMe
                ? 'Vous ne pouvez pas désactiver votre propre compte.'
                : 'Un compte désactivé ne peut plus se connecter ; son historique est conservé.'
            }
            checked={values.active}
            disabled={isMe}
            onChange={(e) => set('active', e.target.checked)}
          />
        </div>
      </FormGrid>
      {!user && (
        <p className={styles.note}>
          {serverAccounts
            ? 'Un mot de passe provisoire sera généré par le serveur et affiché une seule fois, à transmettre à la personne.'
            : 'Le compte peut se connecter avec son email et le mot de passe initial communiqué par l’administrateur.'}
        </p>
      )}
      {serverAccounts && user?.active && !isMe && (
        <p className={styles.note}>
          <Button
            size="sm"
            variant="danger"
            loading={resetPassword.isPending}
            onClick={async () => {
              if (
                await confirm({
                  title: 'Réinitialiser le mot de passe ?',
                  message: `Un nouveau mot de passe provisoire sera généré pour ${user.name} et ses sessions ouvertes seront fermées.`,
                  confirmLabel: 'Réinitialiser',
                  tone: 'danger',
                })
              ) {
                const result = await resetPassword.mutateAsync(user.id).catch(() => null); // erreur déjà affichée
                if (result) setIssued({ email: user.email, password: result.temporaryPassword });
              }
            }}
          >
            Réinitialiser le mot de passe
          </Button>
        </p>
      )}
      <FormActions>
        <Button onClick={onDone}>Annuler</Button>
        <Button type="submit" variant="primary" loading={form.submitting}>
          Enregistrer
        </Button>
      </FormActions>
    </form>
  );
}

function TemporaryPassword({ email, password, onDone }: { email: string; password: string; onDone: () => void }) {
  return (
    <Stack>
      <Panel title="Mot de passe provisoire" accent="warning">
        <p>
          Compte : <strong>{email}</strong>
        </p>
        <p className={styles.password} aria-label="Mot de passe provisoire">
          {password}
        </p>
        <p className={styles.note}>
          Il ne sera plus affiché. Transmettez-le directement à la personne (pas par un canal partagé) et demandez-lui de le changer à la
          première connexion (menu du compte → Changer le mot de passe).
        </p>
      </Panel>
      <FormActions>
        <Button variant="primary" onClick={onDone}>
          J’ai transmis le mot de passe
        </Button>
      </FormActions>
    </Stack>
  );
}
