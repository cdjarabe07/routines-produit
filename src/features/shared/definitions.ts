/* Définitions des indicateurs, affichées en info-bulle. Même texte que docs/functional-spec.md §7. */

export const DEFINITIONS = {
  routinePct: 'Points traités (conforme, non conforme ou N.A.) / points prévus par les routines actives de la période.',
  routineOnTime: 'Routines terminées au plus tard à l’heure prévue + la tolérance de retard / routines prévues.',
  overdueActions: 'Actions ni terminées ni annulées dont l’échéance est dépassée.',
  overdueAtEnd: 'Actions ouvertes à la fin de la période avec une échéance antérieure à cette date.',
  closureDelay: 'Moyenne, pour les actions terminées dans la période, du délai entre création et clôture.',
  openAnomalies: 'Anomalies au statut « ouverte » ou « en traitement ».',
  andonAck: 'Temps moyen entre le déclenchement d’un Andon et sa prise en charge.',
  andonResolution: 'Temps moyen entre le déclenchement d’un Andon et sa résolution.',
  quality: 'Mesures LQC dans les bornes de tolérance / mesures de la période.',
} as const;
