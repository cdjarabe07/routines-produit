import { env } from '@/app/config/env';
import { useDataSource } from '@/app/providers/DataSourceProvider';
import { KeyValueList } from '@/components/data-display/ItemList';
import { QueryBoundary } from '@/components/feedback/States';
import { Columns, PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { FormActions, FormGrid, TextField } from '@/components/ui/Field';
import { Panel } from '@/components/ui/Panel';
import { resolveBIConfig } from '@/features/analytics/biProvider';
import { useSettings, DEFAULT_SETTINGS } from '@/features/shared/api';
import { useForm } from '@/hooks/useForm';
import type { AppSettings } from '@/types/domain';
import { numberRange, required } from '@/utils/validation';
import { useResetDemoData, useSaveSettings } from './api';

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
              {ds.kind === 'demo' && (
                <Panel title="Données de démonstration" accent="warning">
                  <p style={{ marginBottom: 'var(--space-3)', color: 'var(--color-text-muted)' }}>
                    Recharge le jeu de données fictif d’origine, daté par rapport à aujourd’hui. Toutes les saisies faites dans ce navigateur sont effacées.
                  </p>
                  <Button
                    variant="danger"
                    onClick={async () => {
                      if (await confirm({ title: 'Réinitialiser les données de démonstration ?', message: 'Toutes les saisies de ce navigateur seront effacées. Cette action est irréversible.', confirmLabel: 'Réinitialiser', tone: 'danger' })) await reset();
                    }}
                  >
                    Réinitialiser les données
                  </Button>
                </Panel>
              )}
            </Stack>
            <Panel title="Installation">
              <KeyValueList
                items={[
                  { label: 'Source de données', value: ds.kind === 'demo' ? <Badge tone="demo">DÉMO — navigateur</Badge> : <Badge tone="info">API — {env.apiBaseUrl}</Badge> },
                  { label: 'Authentification', value: env.authMode === 'demo' ? <Badge tone="demo">DÉMO — aucune sécurité</Badge> : <Badge tone="info">{env.authMode.toUpperCase()}</Badge> },
                  { label: 'Tableaux BI', value: bi.status === 'configured' ? <Badge tone="success">Connecté</Badge> : bi.status === 'invalid' ? <Badge tone="danger">Configuration invalide</Badge> : <Badge>Non connecté</Badge> },
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
    initial: { plantName: settings.plantName, andonEscalationMinutes: String(settings.andonEscalationMinutes), routineLateToleranceMinutes: String(settings.routineLateToleranceMinutes) },
    rules: {
      plantName: [required('Nom obligatoire')],
      andonEscalationMinutes: [required(), numberRange(1, 120)],
      routineLateToleranceMinutes: [required(), numberRange(0, 720)],
    },
    onSubmit: (v) => save.mutateAsync({ plantName: v.plantName.trim(), andonEscalationMinutes: Number(v.andonEscalationMinutes), routineLateToleranceMinutes: Number(v.routineLateToleranceMinutes) }),
  });
  const { values, set, errors } = form;
  return (
    <form onSubmit={form.handleSubmit} noValidate>
      <FormGrid>
        <TextField className="full" label="Nom de l’atelier" required value={values.plantName} onChange={(e) => set('plantName', e.target.value)} error={errors.plantName} />
        <TextField label="Escalade Andon (minutes)" type="number" min={1} value={values.andonEscalationMinutes} onChange={(e) => set('andonEscalationMinutes', e.target.value)} error={errors.andonEscalationMinutes} hint={`Andon sans prise en charge au-delà de ce délai. Défaut : ${DEFAULT_SETTINGS.andonEscalationMinutes}.`} />
        <TextField label="Tolérance de retard des routines (minutes)" type="number" min={0} value={values.routineLateToleranceMinutes} onChange={(e) => set('routineLateToleranceMinutes', e.target.value)} error={errors.routineLateToleranceMinutes} hint={`Après l’heure prévue. Défaut : ${DEFAULT_SETTINGS.routineLateToleranceMinutes}.`} />
      </FormGrid>
      <FormActions>
        <Button type="submit" variant="primary" loading={form.submitting}>Enregistrer</Button>
      </FormActions>
    </form>
  );
}
