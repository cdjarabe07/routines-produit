import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useDataSource } from '@/app/providers/DataSourceProvider';
import { DataTable, type Column } from '@/components/data-display/DataTable';
import { EmptyState, QueryBoundary } from '@/components/feedback/States';
import { Columns, PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Kpi, KpiStrip } from '@/components/ui/Kpi';
import { Panel } from '@/components/ui/Panel';
import { Tabs } from '@/components/ui/Tabs';
import { MODULES } from '@/app/modules';
import { ROLE_LABELS } from '@/services/auth/permissions';
import type { Role } from '@/types/domain';
import { addDays, todayKey } from '@/utils/date';
import { type ScreenUsage, unusedScreens, usageByModule, usageByScreen } from './model';
import styles from './Telemetry.module.css';

type Period = '7' | '30' | '90';

const roleLabel = (role: string) => ROLE_LABELS[role as Role] ?? role;

/** Fréquentation des écrans et des modules, pour décider de ce qui sert vraiment (sans identité de personne). */
export function UsagePage() {
  const ds = useDataSource();
  const [period, setPeriod] = useState<Period>('30');
  const since = addDays(todayKey(), -(Number(period) - 1));
  const query = useQuery({
    queryKey: ['telemetry', 'usage', since],
    queryFn: () => ds.telemetry!.usage(since),
    enabled: Boolean(ds.telemetry),
  });

  const columns: Column<ScreenUsage>[] = [
    { id: 'label', header: 'Écran', mobile: 'title', cell: (s) => s.label, sortValue: (s) => s.label },
    { id: 'module', header: 'Module', mobile: 'meta', cell: (s) => (s.module ? MODULES[s.module].label : '—') },
    {
      id: 'roles',
      header: 'Par rôle',
      mobile: 'meta',
      cell: (s) =>
        Object.entries(s.byRole)
          .sort((a, b) => b[1] - a[1])
          .map(([role, n]) => `${roleLabel(role)} ${n}`)
          .join(' · '),
    },
    { id: 'views', header: 'Vues', align: 'right', mobile: 'aside', cell: (s) => s.views, sortValue: (s) => s.views },
  ];

  return (
    <>
      <PageHeader
        title="Utilisation"
        description="Écrans ouverts par les utilisateurs, comptés par jour et par rôle. Aucune identité de personne n’est enregistrée. Sert à décider des modules à garder, masquer ou supprimer."
        actions={
          <Tabs
            variant="segmented"
            label="Période"
            value={period}
            onChange={setPeriod}
            items={[
              { value: '7', label: '7 jours' },
              { value: '30', label: '30 jours' },
              { value: '90', label: '90 jours' },
            ]}
          />
        }
      />
      {!ds.telemetry ? (
        <EmptyState title="Suivi indisponible" description="Cette installation ne mesure pas la fréquentation des écrans." />
      ) : (
        <QueryBoundary queries={[query]}>
          {() => {
            const rows = query.data!;
            const screens = usageByScreen(rows);
            const modules = usageByModule(rows);
            const unused = unusedScreens(rows);
            const total = rows.reduce((n, r) => n + r.views, 0);
            return (
              <Stack>
                <KpiStrip>
                  <Kpi label="Écrans ouverts" value={total} />
                  <Kpi label="Écrans différents" value={screens.length} />
                  <Kpi label="Rôles actifs" value={new Set(rows.map((r) => r.role)).size} />
                  <Kpi label="Jours avec activité" value={new Set(rows.map((r) => r.day)).size} />
                </KpiStrip>
                <Columns>
                  <Panel title="Écrans les plus consultés" flush>
                    <DataTable
                      caption="Fréquentation par écran"
                      rows={screens}
                      columns={columns}
                      rowKey={(s) => s.route}
                      initialSort={{ id: 'views', direction: 'desc' }}
                      empty={{
                        title: 'Aucune activité sur la période.',
                        description: 'Le décompte commence à la mise en service du suivi : revenez après quelques jours d’utilisation.',
                      }}
                    />
                  </Panel>
                  <Stack>
                    <Panel
                      title="Par module"
                      description="Modules activables : un module jamais ouvert peut être masqué dans les paramètres."
                    >
                      <ul className={styles.modules}>
                        {modules.map((m) => (
                          <li key={m.module}>
                            <span>{m.label}</span>
                            {m.views > 0 ? <strong>{m.views}</strong> : <Badge tone="warning">Jamais ouvert</Badge>}
                          </li>
                        ))}
                      </ul>
                      <p className={styles.note}>
                        <Link to="/admin/parametres">Paramètres › Modules</Link>
                      </p>
                    </Panel>
                    <Panel title="Écrans du menu jamais ouverts" description={`Sur les ${period} derniers jours.`}>
                      {unused.length === 0 ? (
                        <p className={styles.note}>Tous les écrans du menu ont été ouverts au moins une fois.</p>
                      ) : (
                        <ul className={styles.unused}>
                          {unused.map((s) => (
                            <li key={s.path}>
                              {s.label}
                              {s.space && <span className={styles.space}> · {s.space}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </Panel>
                  </Stack>
                </Columns>
              </Stack>
            );
          }}
        </QueryBoundary>
      )}
    </>
  );
}
