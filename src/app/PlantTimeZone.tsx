import { Fragment, useMemo, type ReactNode } from 'react';
import { applyCatalog, resolveCatalog } from '@/app/catalog';
import { LoadingState } from '@/components/feedback/States';
import { useSettings } from '@/features/shared/api';
import { createLogger } from '@/services/logger';
import { setPlantTimeZone } from '@/utils/date';

const log = createLogger('plant-timezone');

/* Applique le catalogue du site (étapes, catégories, vocabulaire : src/app/catalog.ts) et le fuseau horaire de l'atelier (settings.timezone, source unique, la même que le serveur) avant
   d'afficher les écrans : « aujourd'hui », l'heure du jour et les horaires sont ainsi ceux de l'atelier,
   quel que soit le fuseau du poste. Sans réglage (mode démo local), le fuseau du navigateur sert de repli. */
export function PlantTimeZone({ children }: { children: ReactNode }) {
  const { settings, isPending } = useSettings();
  const catalog = useMemo(() => resolveCatalog(settings.catalog), [settings.catalog]);
  const version = useMemo(() => hash(JSON.stringify(catalog)), [catalog]);
  if (isPending) return <LoadingState label="Ouverture de la session…" />;
  applyCatalog(catalog);
  // Affectation idempotente, faite pendant le rendu pour précéder tout calcul de date des écrans enfants
  if (!setPlantTimeZone(settings.timezone)) {
    log.warn(`Fuseau horaire de l’atelier invalide : « ${settings.timezone} ». Fuseau du poste utilisé.`);
    setPlantTimeZone(null);
  }
  // Catalogue modifié : les écrans sont reconstruits pour afficher partout les nouveaux libellés
  return <Fragment key={version}>{children}</Fragment>;
}

function hash(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0;
  return String(h);
}
