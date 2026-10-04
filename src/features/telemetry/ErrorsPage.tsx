import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDataSource } from '@/app/providers/DataSourceProvider';
import { KeyValueList } from '@/components/data-display/ItemList';
import { DataTable, type Column } from '@/components/data-display/DataTable';
import { EmptyState, QueryBoundary } from '@/components/feedback/States';
import { PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Kpi, KpiStrip } from '@/components/ui/Kpi';
import { Drawer } from '@/components/ui/Overlay';
import { Panel } from '@/components/ui/Panel';
import { ROLE_LABELS } from '@/services/auth/permissions';
import type { ClientErrorSource, ErrorReportRow } from '@/services/data/types';
import type { Role } from '@/types/domain';
import { addDays, formatDateTime, todayKey } from '@/utils/date';
import { screenLabel } from './model';
import styles from './Telemetry.module.css';

const DAYS = 30;

const SOURCE: Record<ClientErrorSource, string> = {
  react: 'Écran planté',
  window: 'Erreur de script',
  promise: 'Opération échouée',
};

const roleLabel = (role?: string) => (role ? (ROLE_LABELS[role as Role] ?? role) : '—');

/** Erreurs survenues dans le navigateur des utilisateurs, regroupées par jour (sans identité de personne). */
export function ErrorsPage() {
  const ds = useDataSource();
  const since = addDays(todayKey(), -(DAYS - 1));
  const query = useQuery({
    queryKey: ['telemetry', 'errors', since],
    queryFn: () => ds.telemetry!.errors(since),
    enabled: Boolean(ds.telemetry),
  });
  const [selected, setSelected] = useState<ErrorReportRow | null>(null);

  const columns: Column<ErrorReportRow>[] = [
    { id: 'last', header: 'Dernière fois', mobile: 'aside', cell: (e) => formatDateTime(e.lastAt), sortValue: (e) => e.lastAt },
    { id: 'message', header: 'Erreur', mobile: 'title', cell: (e) => e.message, sortValue: (e) => e.message },
    {
      id: 'source',
      header: 'Type',
      mobile: 'meta',
      cell: (e) => <Badge tone={e.source === 'react' ? 'danger' : 'warning'}>{SOURCE[e.source]}</Badge>,
    },
    { id: 'screen', header: 'Écran', mobile: 'meta', cell: (e) => screenLabel(e.route), sortValue: (e) => screenLabel(e.route) },
    { id: 'role', header: 'Rôle', mobile: 'meta', cell: (e) => roleLabel(e.role) },
    { id: 'count', header: 'Occurrences', align: 'right', mobile: 'meta', cell: (e) => e.count, sortValue: (e) => e.count },
  ];

  return (
    <>
      <PageHeader
        title="Erreurs"
        description={`Erreurs survenues dans l’application chez les utilisateurs, sur ${DAYS} jours. Une même erreur est regroupée par jour et comptée ; aucune identité de personne n’est enregistrée.`}
      />
      {!ds.telemetry ? (
        <EmptyState title="Suivi indisponible" description="Cette installation ne transmet pas les erreurs au serveur." />
      ) : (
        <QueryBoundary queries={[query]}>
          {() => {
            const rows = query.data!;
            const occurrences = rows.reduce((n, e) => n + e.count, 0);
            const crashes = rows.filter((e) => e.source === 'react').reduce((n, e) => n + e.count, 0);
            return (
              <Stack>
                <KpiStrip>
                  <Kpi label="Erreurs distinctes" value={rows.length} />
                  <Kpi label="Occurrences" value={occurrences} />
                  <Kpi label="Écrans plantés" value={crashes} tone={crashes > 0 ? 'danger' : 'neutral'} />
                  <Kpi label="Écrans concernés" value={new Set(rows.map((e) => e.route)).size} />
                </KpiStrip>
                <Panel flush>
                  <DataTable
                    caption="Erreurs"
                    rows={rows}
                    columns={columns}
                    rowKey={(e) => e.id}
                    onRowSelect={setSelected}
                    selectedKey={selected?.id ?? null}
                    initialSort={{ id: 'last', direction: 'desc' }}
                    rowTone={(e) => (e.source === 'react' ? 'danger' : undefined)}
                    search={{ placeholder: 'Rechercher une erreur, un écran…', text: (e) => `${e.message} ${screenLabel(e.route)}` }}
                    empty={{
                      title: `Aucune erreur sur ${DAYS} jours.`,
                      description: 'Les erreurs apparaîtront ici dès qu’un utilisateur en rencontre une.',
                    }}
                  />
                </Panel>
              </Stack>
            );
          }}
        </QueryBoundary>
      )}

      <Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title="Détail de l’erreur" size="lg">
        {selected && (
          <Stack gap={4}>
            <p className={styles.message}>{selected.message}</p>
            <KeyValueList
              items={[
                { label: 'Type', value: SOURCE[selected.source] },
                { label: 'Écran', value: `${screenLabel(selected.route)} (${selected.route})` },
                { label: 'Rôle', value: roleLabel(selected.role) },
                { label: 'Occurrences le jour', value: selected.count },
                { label: 'Première fois', value: formatDateTime(selected.firstAt) },
                { label: 'Dernière fois', value: formatDateTime(selected.lastAt) },
                { label: 'Version', value: selected.appVersion ?? '—' },
                { label: 'Navigateur', value: selected.userAgent ?? '—' },
              ]}
            />
            {selected.stack && (
              <Panel title="Pile d’appels" description="À transmettre à la personne qui maintient l’application.">
                <pre className={styles.stack}>{selected.stack}</pre>
              </Panel>
            )}
          </Stack>
        )}
      </Drawer>
    </>
  );
}
