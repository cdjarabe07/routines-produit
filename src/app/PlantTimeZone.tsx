import type { ReactNode } from 'react';
import { LoadingState } from '@/components/feedback/States';
import { useSettings } from '@/features/shared/api';
import { createLogger } from '@/services/logger';
import { setPlantTimeZone } from '@/utils/date';

const log = createLogger('plant-timezone');

/* Applique le fuseau horaire de l'atelier (settings.timezone, source unique, la même que le serveur) avant
   d'afficher les écrans : « aujourd'hui », l'heure du jour et les horaires sont ainsi ceux de l'atelier,
   quel que soit le fuseau du poste. Sans réglage (mode démo local), le fuseau du navigateur sert de repli. */
export function PlantTimeZone({ children }: { children: ReactNode }) {
  const { settings, isPending } = useSettings();
  if (isPending) return <LoadingState label="Ouverture de la session…" />;
  // Affectation idempotente, faite pendant le rendu pour précéder tout calcul de date des écrans enfants
  if (!setPlantTimeZone(settings.timezone)) {
    log.warn(`Fuseau horaire de l’atelier invalide : « ${settings.timezone} ». Fuseau du poste utilisé.`);
    setPlantTimeZone(null);
  }
  return <>{children}</>;
}
