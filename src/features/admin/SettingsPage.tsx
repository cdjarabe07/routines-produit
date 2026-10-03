import { useState } from 'react';
import { env } from '@/app/config/env';
import { MODULE_KEYS, MODULES, type ModuleKey } from '@/app/modules';
import { useDataSource } from '@/app/providers/DataSourceProvider';
import { KeyValueList } from '@/components/data-display/ItemList';
import { QueryBoundary } from '@/components/feedback/States';
import { Columns, PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { Checkbox, FormActions, FormGrid, TextField } from '@/components/ui/Field';
import { Panel } from '@/components/ui/Panel';
import { resolveBIConfig } from '@/features/analytics/biProvider';
import { useSettings, DEFAULT_SETTINGS } from '@/features/shared/api';
import { useForm } from '@/hooks/useForm';
import type { AppSettings } from '@/types/domain';
import { numberRange, required } from '@/utils/validation';
import { useResetDemoData, useSaveModules, useSaveSettings } from './api';

export function SettingsPage() {
  const query = useSettings();
  const ds = useDataSource();
  const confirm = useConfirm();
  const reset = useResetDemoData();
  const bi = resolveBIConfig(env);

  return (
    <>
      <PageHeader title="Paramètres" description="Seuils métier et configuration de l’installation." />
      <QueryBoundary queries={[query]}>
        {() => (
          <Columns>
            <Stack>
              <Panel title="Seuils métier">
                <SettingsForm key={query.settings.updatedAt ?? 'default'} settings={query.settings} />
              </Panel>
              <Panel
                title="Modules"
                description="Décochez ce que le site n’utilise pas : le module disparaît des menus et de l’aide. Aucune donnée n’est supprimée."
              >
                <ModulesForm
                  key={(query.settings.disabledModules ?? []).join(',') || 'all'}
                  disabled={query.settings.disabledModules ?? []}
                  biConfigured={bi.status === 'configured'}
                />
              </Panel>
              {ds.resetDemoData && (ds.kind === 'demo' || query.settings.environment === 'demo') && (
                <Panel title="Environnement de démonstration" accent="warning">
                  <p style={{ marginBottom: 'var(--space-3)', color: 'var(--color-text-muted)' }}>
                    {ds.kind === 'demo'
                      ? 'Les données sont enregistrées dans ce navigateur. Le jeu initial (organisation, routines, planification et historique de 30 jours) est généré au premier lancement et daté par rapport à aujourd’hui. La réinitialisation le recharge et efface toutes les saisies faites sur ce poste.'
                      : 'Serveur de démonstration : la réinitialisation recharge le jeu initial pour tous les utilisateurs et efface leurs saisies. Les comptes et le journal d’audit sont conservés. Elle est refusée par le serveur sur un environnement de production.'}
                  </p>
                  <Button
                    variant="danger"
                    onClick={async () => {
                      if (
                        await confirm({
                          title: 'Réinitialiser l’environnement ?',
                          message:
                            ds.kind === 'demo'
                              ? 'Toutes les saisies de ce navigateur seront effacées et le jeu initial rechargé. Cette action est irréversible.'
                              : 'Toutes les saisies de tous les utilisateurs du serveur de démonstration seront effacées. Cette action est irréversible.',
                          confirmLabel: 'Réinitialiser',
                          tone: 'danger',
                        })
                      )
                        await reset();
                    }}
                  >
                    Réinitialiser l’environnement
                  </Button>
                </Panel>
              )}
            </Stack>
            <Panel title="Installation">
              <KeyValueList
                items={[
                  {
                    label: 'Source de données',
                    value:
                      ds.kind === 'demo' ? (
                        <Badge tone="warning">Stockage local du navigateur</Badge>
                      ) : ds.kind === 'supabase' ? (
                        <Badge tone={query.settings.environment === 'production' ? 'info' : 'warning'}>
                          Serveur Supabase — {query.settings.environment === 'production' ? 'production' : 'démonstration'}
                        </Badge>
                      ) : (
                        <Badge tone="info">API — {env.apiBaseUrl}</Badge>
                      ),
                  },
                  {
                    label: 'Authentification',
                    value:
                      env.authMode === 'demo' ? (
                        <Badge tone="warning">Comptes locaux — non sécurisé</Badge>
                      ) : env.authMode === 'supabase' ? (
                        <Badge tone="info">Comptes serveur (Supabase Auth)</Badge>
                      ) : (
                        <Badge tone="info">{env.authMode.toUpperCase()}</Badge>
                      ),
                  },
                  {
                    label: 'Tableaux BI',
                    value:
                      bi.status === 'configured' ? (
                        <Badge tone="success">Connecté</Badge>
                      ) : bi.status === 'invalid' ? (
                        <Badge tone="danger">Configuration invalide</Badge>
                      ) : (
                        <Badge>Non connecté</Badge>
                      ),
                  },
                  { label: 'Notifications email', value: <Badge>Non configurées</Badge> },
                  { label: 'Données machine', value: <Badge>Non connectées</Badge> },
                  { label: 'Version', value: import.meta.env.VITE_APP_VERSION },
                ]}
              />
            </Panel>
          </Columns>
        )}
      </QueryBoundary>
    </>
  );
}

function SettingsForm({ settings }: { settings: Omit<AppSettings, 'id' | 'createdAt' | 'updatedAt'> }) {
  const save = useSaveSettings();
  const form = useForm({
    initial: {
      plantName: settings.plantName,
      andonEscalationMinutes: String(settings.andonEscalationMinutes),
      routineLateToleranceMinutes: String(settings.routineLateToleranceMinutes),
    },
    rules: {
      plantName: [required('Nom obligatoire')],
      andonEscalationMinutes: [required(), numberRange(1, 120)],
      routineLateToleranceMinutes: [required(), numberRange(0, 720)],
    },
    onSubmit: (v) =>
      save.mutateAsync({
        plantName: v.plantName.trim(),
        andonEscalationMinutes: Number(v.andonEscalationMinutes),
        routineLateToleranceMinutes: Number(v.routineLateToleranceMinutes),
      }),
  });
  const { values, set, errors } = form;
  return (
    <form onSubmit={form.handleSubmit} noValidate>
      <FormGrid>
        <TextField
          className="full"
          label="Nom de l’atelier"
          required
          value={values.plantName}
          onChange={(e) => set('plantName', e.target.value)}
          error={errors.plantName}
        />
        <TextField
          label="Escalade Andon (minutes)"
          type="number"
          min={1}
          value={values.andonEscalationMinutes}
          onChange={(e) => set('andonEscalationMinutes', e.target.value)}
          error={errors.andonEscalationMinutes}
          hint={`Andon sans prise en charge au-delà de ce délai. Défaut : ${DEFAULT_SETTINGS.andonEscalationMinutes}.`}
        />
        <TextField
          label="Tolérance de retard des routines (minutes)"
          type="number"
          min={0}
          value={values.routineLateToleranceMinutes}
          onChange={(e) => set('routineLateToleranceMinutes', e.target.value)}
          error={errors.routineLateToleranceMinutes}
          hint={`Après l’heure prévue. Défaut : ${DEFAULT_SETTINGS.routineLateToleranceMinutes}.`}
        />
      </FormGrid>
      <FormActions>
        <Button type="submit" variant="primary" loading={form.submitting}>
          Enregistrer
        </Button>
      </FormActions>
    </form>
  );
}

function ModulesForm({ disabled, biConfigured }: { disabled: string[]; biConfigured: boolean }) {
  const save = useSaveModules();
  const [off, setOff] = useState<Set<string>>(() => new Set(disabled));
  const changed = off.size !== disabled.length || disabled.some((k) => !off.has(k));
  const toggle = (key: ModuleKey, enabled: boolean) =>
    setOff((prev) => {
      const next = new Set(prev);
      if (enabled) next.delete(key);
      else next.add(key);
      return next;
    });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save.mutateAsync(MODULE_KEYS.filter((k) => off.has(k)));
      }}
    >
      <Stack gap={3}>
        {MODULE_KEYS.map((key) => (
          <Checkbox
            key={key}
            label={MODULES[key].label}
            description={
              key === 'bi' && !biConfigured ? `${MODULES[key].description} Aucun outil connecté pour l’instant.` : MODULES[key].description
            }
            checked={!off.has(key)}
            onChange={(e) => toggle(key, e.target.checked)}
          />
        ))}
      </Stack>
      <FormActions>
        <Button type="submit" variant="primary" disabled={!changed} loading={save.isPending}>
          Enregistrer les modules
        </Button>
      </FormActions>
    </form>
  );
}
