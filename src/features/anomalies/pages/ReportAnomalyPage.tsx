import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { CircleCheck } from 'lucide-react';
import { QueryBoundary } from '@/components/feedback/States';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { useLookups } from '@/features/shared/api';
import type { Anomaly } from '@/types/domain';
import { AnomalyForm } from '../components/AnomalyForm';
import styles from './ReportAnomalyPage.module.css';

/** Point d'entrée terrain (bouton « Signaler », QR code de poste : /#/signaler?poste=P4). */
export function ReportAnomalyPage() {
  const [params] = useSearchParams();
  const code = params.get('poste');
  const { queries, lookups } = useLookups();
  const [created, setCreated] = useState<Anomaly | null>(null);
  const [formKey, setFormKey] = useState(0);

  return (
    <>
      <PageHeader title="Signaler une anomalie" description="Décrivez ce que vous avez constaté. La déclaration est horodatée et visible immédiatement par l’encadrement et la qualité." />
      <QueryBoundary queries={queries}>
        {() => {
          const station = code ? lookups!.workstations.find((w) => w.code.toLowerCase() === code.toLowerCase()) : undefined;
          if (created) {
            return (
              <Panel accent="success">
                <div className={styles.success} role="status">
                  <CircleCheck size={28} aria-hidden />
                  <div>
                    <p className={styles.successTitle}>Anomalie enregistrée</p>
                    <p className={styles.successText}>{created.description}</p>
                  </div>
                </div>
                <div className={styles.successActions}>
                  <ButtonLink to={`/anomalies/${created.id}`} variant="primary">Voir l’anomalie</ButtonLink>
                  <Button onClick={() => { setCreated(null); setFormKey((k) => k + 1); }}>Signaler une autre anomalie</Button>
                </div>
              </Panel>
            );
          }
          return (
            <Panel>
              {code && !station && <p className={styles.warning} role="alert">Le poste « {code} » du QR code n’existe pas ou plus. Choisissez le poste dans la liste.</p>}
              {station && <p className={styles.station}>Poste identifié par QR code : <strong>{station.name}</strong></p>}
              <AnomalyForm
                key={formKey}
                workstations={lookups!.workstations}
                initial={{ workstationId: station?.id ?? '' }}
                origin={{ type: station ? 'qr' : 'manual' }}
                onCreated={setCreated}
              />
            </Panel>
          );
        }}
      </QueryBoundary>
    </>
  );
}
