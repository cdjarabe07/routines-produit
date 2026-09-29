import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Maximize2, Siren, X } from 'lucide-react';
import { Can, useAuth, useCurrentUser } from '@/app/providers/AuthProvider';
import { QueryBoundary } from '@/components/feedback/States';
import { PageHeader, Stack } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { useLookups, useSettings } from '@/features/shared/api';
import { useCollection } from '@/hooks/useData';
import { useNow } from '@/hooks/useNow';
import type { AndonAlert } from '@/types/domain';
import { formatTime } from '@/utils/date';
import { useAcknowledgeAndon, useStartResolution } from '../api';
import { AndonBoard } from '../components/AndonBoard';
import { AndonHistory } from '../components/AndonHistory';
import { RaiseAndonDialog } from '../components/RaiseAndonDialog';
import { ResolveAndonDialog } from '../components/ResolveAndonDialog';
import { isOpenAlert } from '../model';
import styles from './AndonPage.module.css';

export function AndonPage() {
  const user = useCurrentUser();
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('vue') === 'historique' ? 'history' : 'board';
  const raiseOpen = params.get('declencher') === '1';
  const now = useNow(1000);
  const { settings } = useSettings();
  const alerts = useCollection('andonAlerts');
  const { queries, lookups } = useLookups();
  const acknowledge = useAcknowledgeAndon();
  const startResolution = useStartResolution();
  const [resolving, setResolving] = useState<AndonAlert | null>(null);
  const [preselect, setPreselect] = useState<string | undefined>(params.get('poste') ?? undefined);
  const [display, setDisplay] = useState(false);

  const openRaise = (workstationId?: string) => {
    setPreselect(workstationId);
    setParams({ declencher: '1' });
  };

  return (
    <>
      <PageHeader
        title="Andon"
        description="Signaler un problème au poste et suivre sa prise en charge : chaque alerte est chronométrée jusqu’à sa résolution."
        actions={
          <>
            <Button icon={<Maximize2 size={16} aria-hidden />} onClick={() => setDisplay(true)}>
              Affichage atelier
            </Button>
            <Can permission="andon.raise">
              <Button variant="danger" icon={<Siren size={16} aria-hidden />} onClick={() => openRaise()}>
                Déclencher un Andon
              </Button>
            </Can>
          </>
        }
      />
      <QueryBoundary queries={[alerts, ...queries]}>
        {() => {
          const open = alerts.data!.filter(isOpenAlert);
          const board = (
            <AndonBoard
              lines={lookups!.lines}
              workstations={lookups!.workstations}
              alerts={open}
              now={now}
              escalationMinutes={settings.andonEscalationMinutes}
              userName={lookups!.userName}
              canRespond={can('andon.respond')}
              onAcknowledge={(a) => acknowledge.mutate({ alert: a, user })}
              onStartResolution={(a) => startResolution.mutate({ alert: a, user })}
              onResolve={setResolving}
              onRaise={can('andon.raise') ? openRaise : undefined}
              display={display}
            />
          );
          return (
            <Stack>
              <Tabs
                label="Vue"
                value={tab}
                onChange={(v) => setParams(v === 'history' ? { vue: 'historique' } : {}, { replace: true })}
                items={[
                  { value: 'board', label: 'Tableau en direct', count: open.length },
                  { value: 'history', label: 'Historique et analyse' },
                ]}
              />
              {tab === 'board' ? board : <AndonHistory alerts={alerts.data!} lookups={lookups!} />}

              {display && (
                <div className={styles.display} role="dialog" aria-modal="true" aria-label="Affichage atelier Andon">
                  <header className={styles.displayHead}>
                    <span>Andon — {settings.plantName}</span>
                    <span className={styles.clock}>{formatTime(now)}</span>
                    <Button icon={<X size={18} aria-hidden />} onClick={() => setDisplay(false)} autoFocus>
                      Quitter l’affichage
                    </Button>
                  </header>
                  {board}
                </div>
              )}

              <RaiseAndonDialog
                key={`${raiseOpen}-${preselect}`}
                open={raiseOpen}
                onClose={() => setParams(tab === 'history' ? { vue: 'historique' } : {}, { replace: true })}
                workstations={lookups!.workstations}
                lines={lookups!.lines}
                initialWorkstationId={preselect && lookups!.workstations.find((w) => w.id === preselect || w.code === preselect)?.id}
              />
              <ResolveAndonDialog
                alert={resolving}
                stationName={resolving ? lookups!.workstationName(resolving.workstationId) : ''}
                onClose={() => setResolving(null)}
              />
            </Stack>
          );
        }}
      </QueryBoundary>
    </>
  );
}
