/* Aide contextuelle affichée par le bouton « Aide » de la barre supérieure. */

export interface HelpTopic {
  title: string;
  points: string[];
}

const TOPICS: { match: RegExp; topic: HelpTopic }[] = [
  { match: /^\/$/, topic: { title: 'Accueil', points: [
    '« À traiter maintenant » classe les priorités : Andon actifs, actions en retard, routines dont l’heure est passée, réunion à tenir, stocks bas.',
    'Chaque ligne ouvre directement l’écran concerné.',
    'Le bandeau atelier indique l’état de chaque ligne : une ligne avec un Andon actif est signalée en rouge.',
    'Le rapport du jour se génère à partir des données saisies ; il peut être copié pour un email ou une messagerie.',
  ] } },
  { match: /^\/routines/, topic: { title: 'Routines', points: [
    'Chaque routine du jour est créée automatiquement à partir de son modèle ; l’historique des jours précédents est conservé.',
    'Pour chaque point : Conforme, Non conforme ou Non applicable. L’heure et l’auteur sont enregistrés.',
    'Un point non conforme propose de déclarer une anomalie liée.',
    'L’icône livre ouvre le standard associé au point de contrôle.',
  ] } },
  { match: /^\/actions/, topic: { title: 'Actions', points: [
    'Toutes les actions de l’atelier au même endroit, quelle que soit leur origine (réunion, anomalie, Gemba, routine).',
    'Une action est « en retard » quand son échéance est dépassée et qu’elle n’est ni terminée ni annulée.',
    'Les commentaires gardent l’historique des échanges sur l’action.',
  ] } },
  { match: /^\/andon/, topic: { title: 'Andon', points: [
    'Déclencher : choisir le poste et le type de problème. Le chronomètre démarre immédiatement.',
    'Prendre en charge : indique à tous qu’une personne intervient.',
    'Résoudre : renseigner la cause et l’action réalisée. L’alerte passe dans l’historique.',
    'Au-delà du seuil d’escalade sans prise en charge, la tuile est marquée « escaladé ».',
  ] } },
  { match: /^\/(anomalies|signaler)/, topic: { title: 'Anomalies', points: [
    'Une anomalie décrit un écart constaté (sécurité, qualité, 5S, standard…).',
    'Depuis une anomalie, créez une ou plusieurs actions correctives.',
    'Les QR codes des postes ouvrent directement le formulaire avec le poste pré-rempli.',
  ] } },
  { match: /^\/sequences/, topic: { title: 'Séquences guidées', points: [
    'Le minuteur est calculé à partir de l’heure de début : il continue même si la page est fermée.',
    'Pause suspend le temps de l’étape ; Étape suivante valide l’étape en cours.',
    'Un dépassement de la durée cible s’affiche en orange sans bloquer.',
  ] } },
  { match: /^\/gemba/, topic: { title: 'Gemba Walk', points: [
    'Saisir la checklist de la marche (commentaire obligatoire pour un point non conforme) et les observations.',
    'Le résumé permet de relire avant validation.',
    'À la validation, une action peut être créée pour chaque observation ; son échéance dépend de la gravité.',
  ] } },
  { match: /^\/reporting/, topic: { title: 'Reporting', points: [
    'Tous les indicateurs sont calculés à partir des enregistrements de la période choisie.',
    'La comparaison porte sur la période précédente de même durée.',
    'Chaque graphique propose « Voir les données » pour vérifier les chiffres.',
  ] } },
];

const FALLBACK: HelpTopic = { title: 'Aide', points: [
  'Le menu de gauche regroupe les écrans par usage : Ma journée, Opérations, Qualité, Analyse, Ressources.',
  'Les pastilles du menu indiquent ce qui attend une action.',
  'Le bandeau violet rappelle que l’application fonctionne en mode démonstration avec des données fictives.',
] };

export function helpFor(pathname: string): HelpTopic {
  return TOPICS.find((t) => t.match.test(pathname))?.topic ?? FALLBACK;
}
