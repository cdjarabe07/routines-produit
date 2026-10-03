/* Aide contextuelle affichée par le bouton « Aide » de la barre supérieure.
   Une rubrique par écran (adresses actuelles : /app, /manager, /admin et écrans communs), et un lexique commun.
   Ordre : les adresses les plus précises d'abord. */

export interface HelpTopic {
  title: string;
  /** À quoi sert l'écran */
  purpose: string;
  /** Comment faire : les gestes principaux */
  steps: string[];
  /** Bon à savoir */
  tips?: string[];
  /** Écrans liés */
  related?: { label: string; to: string }[];
}

const TOPICS: { match: RegExp; topic: HelpTopic }[] = [
  /* ---------- Mon travail ---------- */
  {
    match: /^\/app\/?$/,
    topic: {
      title: 'Tableau de bord',
      purpose: 'Voir d’un coup d’œil ce que vous devez faire maintenant : routines du jour, actions, réunions, alertes.',
      steps: [
        '« Maintenant » montre la routine en cours ou la prochaine ; « Démarrer » ou « Reprendre » ouvre son exécution.',
        'Les blocs Actions, Réunions et Alertes listent ce qui vous concerne ; chaque ligne ouvre l’écran correspondant.',
        'L’annonce du jour, publiée par l’encadrement, s’affiche quand elle existe.',
      ],
      tips: ['Les dates et heures sont celles de l’atelier, quel que soit le réglage de votre appareil.'],
      related: [
        { label: 'Mes routines', to: '/app/routines' },
        { label: 'Mon planning', to: '/app/planning' },
      ],
    },
  },
  {
    match: /^\/app\/planning/,
    topic: {
      title: 'Mon planning',
      purpose: 'Votre emploi du temps : routines affectées, réunions et formations, actions arrivant à échéance.',
      steps: [
        'Choisissez la vue Jour, Semaine ou Période ; les flèches changent de jour ou de semaine.',
        'Cliquez sur un élément pour l’ouvrir : exécuter une routine, consulter une réunion, traiter une action.',
      ],
      tips: ['La vue Période est limitée à deux mois.'],
    },
  },
  {
    match: /^\/app\/routines\/[^/]+\/[^/]+/,
    topic: {
      title: 'Exécution d’une routine',
      purpose: 'Réaliser une routine planifiée, tâche par tâche, et garder la trace de chaque contrôle.',
      steps: [
        '« Démarrer » lance la routine, seulement le jour prévu (date de l’atelier).',
        'Pour chaque tâche ou contrôle, indiquez le résultat : conforme, non conforme, non applicable, ou la valeur mesurée.',
        'Un problème constaté peut être signalé en anomalie directement depuis la routine.',
        '« Terminer la routine » est possible quand toutes les tâches obligatoires sont faites.',
      ],
      tips: [
        'Chaque saisie est enregistrée immédiatement : vous pouvez quitter et reprendre plus tard.',
        'Une routine terminée, ou d’un jour passé, n’est plus modifiable.',
        'Les commentaires de la routine sont visibles par l’encadrement.',
      ],
    },
  },
  {
    match: /^\/app\/routines/,
    topic: {
      title: 'Mes routines',
      purpose: 'Les routines qui vous sont affectées, directement ou via votre équipe, sur 7 jours autour d’aujourd’hui.',
      steps: [
        'Les onglets séparent : aujourd’hui, en retard, à venir, terminées.',
        '« Démarrer » ouvre l’exécution de la routine du jour.',
      ],
      tips: ['Une routine passe « en retard » quand l’heure prévue plus la tolérance définie par l’administration est dépassée.'],
    },
  },
  {
    match: /^\/app\/reunions/,
    topic: {
      title: 'Mes réunions',
      purpose: 'Les réunions, briefings, formations et événements auxquels vous êtes invité, directement ou avec votre équipe.',
      steps: [
        'L’onglet Calendrier présente vos événements sur la semaine ; les onglets À venir et 30 derniers jours en donnent la liste.',
        'Cliquez sur un événement pour voir l’ordre du jour, les participants et le compte rendu.',
      ],
      tips: ['Vous êtes notifié quand vous êtes invité, quand une réunion change de date, d’heure ou de lieu, et quand elle est annulée.'],
    },
  },
  {
    match: /^\/app\/actions/,
    topic: {
      title: 'Mes actions',
      purpose: 'Les actions dont vous êtes responsable ou suppléant.',
      steps: [
        'Ouvrez une action pour la faire avancer : à faire, en cours, bloquée (avec la raison), terminée (avec la résolution).',
        'Ajoutez un commentaire pour informer les autres personnes concernées.',
      ],
      tips: ['Une action dont l’échéance est dépassée est signalée en rouge et dans les compteurs du menu.'],
    },
  },
  {
    match: /^\/app\/sequences/,
    topic: {
      title: 'Séquences guidées',
      purpose: 'Dérouler pas à pas une séquence de travail standard en suivant le temps passé à chaque étape.',
      steps: [
        'Choisissez une séquence et démarrez-la ; validez chaque étape pour passer à la suivante.',
        'Pause et reprise sont possibles.',
      ],
      tips: ['Le temps réel de chaque étape est comparé au temps prévu.'],
    },
  },
  {
    match: /^\/app\/passation/,
    topic: {
      title: 'Passation de poste',
      purpose: 'Transmettre les informations importantes à l’équipe suivante, et lire celles de l’équipe précédente.',
      steps: ['Rédigez la passation en fin de poste.', '« Marquer comme lue » confirme que vous en avez pris connaissance.'],
    },
  },
  {
    match: /^\/app\/connaissances/,
    topic: {
      title: 'Centre de connaissances',
      purpose: 'Les standards, modes opératoires et liens utiles publiés par l’administration.',
      steps: [
        'Recherchez ou filtrez par catégorie ; ouvrez un standard pour lire ses points clés.',
        'L’étoile ajoute un standard à vos favoris.',
      ],
    },
  },

  /* ---------- Supervision ---------- */
  {
    match: /^\/manager\/?$/,
    topic: {
      title: 'Vue d’ensemble (supervision)',
      purpose: 'L’état de votre périmètre en temps réel : routines par personne, Andon, anomalies, actions, qualité, présence.',
      steps: [
        '« À traiter maintenant » classe les priorités ; chaque ligne ouvre l’écran concerné.',
        'Le rapport du jour se génère à partir des données saisies et peut être copié.',
      ],
      tips: ['Vous voyez votre périmètre : votre équipe (Hancho), votre ligne (Line Leader) ou tout l’atelier (Manager, Qualité).'],
      related: [{ label: 'Carte du processus', to: '/processus' }],
    },
  },
  {
    match: /^\/manager\/equipe/,
    topic: {
      title: 'Mon équipe',
      purpose: 'Présence du jour et congés des personnes de votre périmètre.',
      steps: ['Indiquez présent ou absent pour chaque personne.', 'Les congés planifiés s’affichent automatiquement.'],
    },
  },
  {
    match: /^\/manager\/routines/,
    topic: {
      title: 'Suivi des routines',
      purpose: 'Qui a fait quoi : chaque routine prévue un jour donné, avec son avancement et son état.',
      steps: [
        'Choisissez le jour ; filtrez par équipe, ligne ou état (en retard, en cours, terminées).',
        'Ouvrez une ligne pour voir le détail des contrôles.',
      ],
    },
  },
  {
    match: /^\/manager\/production/,
    topic: {
      title: 'Production',
      purpose: 'Suivre les ordres de fabrication et les stocks matière au poste.',
      steps: [
        'Faites avancer un OF d’étape en étape ; signalez un blocage avec sa raison.',
        'Dans l’onglet stocks, enregistrez consommations et réapprovisionnements : chaque mouvement est tracé.',
      ],
      tips: ['Un stock sous son minimum apparaît en alerte, ici et sur le plan de l’atelier.'],
    },
  },
  {
    match: /^\/manager\/atelier/,
    topic: {
      title: 'Plan de l’atelier',
      purpose: 'Où est le problème, maintenant ? Chaque poste est coloré selon ses Andon, ses stocks et ses anomalies.',
      steps: ['Cliquez sur un poste pour voir ses signaux.'],
      related: [{ label: 'Carte du processus — flux de fabrication', to: '/processus?vue=fabrication' }],
    },
  },
  {
    match: /^\/manager\/anomalies/,
    topic: {
      title: 'Anomalies',
      purpose: 'Traiter les anomalies signalées sur le terrain.',
      steps: [
        'Filtrez par état, catégorie ou gravité ; ouvrez une anomalie pour la qualifier et la traiter.',
        'Créez une action corrective depuis l’anomalie, puis clôturez-la avec la résolution.',
      ],
    },
  },
  {
    match: /^\/manager\/actions/,
    topic: {
      title: 'Actions correctives',
      purpose: 'Suivre toutes les actions de votre périmètre jusqu’à leur clôture.',
      steps: ['Filtrez par état, responsable ou échéance.', 'Ouvrez une action pour la réassigner, la débloquer ou la clôturer.'],
      tips: ['Les actions naissent des anomalies, des Andon, des Gemba Walks, des contrôles qualité et des réunions.'],
    },
  },
  {
    match: /^\/manager\/gemba\/nouvelle/,
    topic: {
      title: 'Nouvelle Gemba Walk',
      purpose: 'Conduire une visite terrain structurée.',
      steps: [
        'Choisissez la zone et les participants, parcourez la checklist, notez les constats et les améliorations proposées.',
        'À la validation, les observations pour lesquelles une action est planifiée deviennent des actions.',
      ],
    },
  },
  {
    match: /^\/manager\/gemba/,
    topic: {
      title: 'Gemba Walks',
      purpose: 'Les visites terrain : brouillons, validées, clôturées, et leurs actions.',
      steps: ['« Nouvelle Gemba Walk » démarre une visite ; ouvrez une visite pour suivre ses actions.'],
    },
  },
  {
    match: /^\/manager\/qualite/,
    topic: {
      title: 'Contrôles qualité (LQC)',
      purpose: 'Saisir les mesures au poste et suivre la conformité.',
      steps: [
        'Saisissez la caractéristique, le poste et la valeur mesurée : la conformité est calculée avec les tolérances.',
        'Une mesure hors tolérance peut être liée à une anomalie.',
      ],
      tips: ['La tendance montre la conformité des 14 derniers jours.'],
    },
  },
  {
    match: /^\/manager\/reporting/,
    topic: {
      title: 'Reporting',
      purpose: 'Les indicateurs calculés à partir des données saisies, comparés à la période précédente.',
      steps: [
        'Choisissez la période et, si besoin, une ligne.',
        'Cliquez sur un jour, une catégorie, un poste ou une routine pour voir le détail.',
        'Exportez les indicateurs jour par jour en CSV.',
      ],
      tips: ['Aucun indicateur n’est saisi à la main : tout vient des routines, anomalies, Andon, actions et contrôles.'],
    },
  },
  {
    match: /^\/manager\/bi/,
    topic: {
      title: 'Tableaux BI',
      purpose: 'Les rapports de l’outil de BI de l’entreprise, intégrés à l’application.',
      steps: ['Le rapport s’affiche quand l’administration a configuré son adresse ; sinon l’écran l’indique.'],
    },
  },

  /* ---------- Administration ---------- */
  {
    match: /^\/admin\/dashboard/,
    topic: {
      title: 'Administration',
      purpose: 'Ce qui est configuré, planifié, réalisé, et ce qui demande une intervention.',
      steps: ['Suivez les demandes d’aide à la connexion, les routines sans planification et la réalisation de la semaine.'],
    },
  },
  {
    match: /^\/admin\/planification/,
    topic: {
      title: 'Planification',
      purpose: 'Affecter les routines à une personne ou à une équipe, avec une récurrence.',
      steps: [
        'Créez une planification : routine, personne ou équipe, heure, récurrence (une fois, jours ouvrés, jours choisis…).',
        'La vue Semaine montre chaque occurrence et son état ; vous pouvez sauter une date ou annuler une planification.',
      ],
      tips: ['Les personnes concernées sont notifiées de chaque nouvelle planification.'],
    },
  },
  {
    match: /^\/admin\/reunions/,
    topic: {
      title: 'Réunions',
      purpose: 'Créer et gérer les réunions récurrentes ou ponctuelles.',
      steps: [
        'Créez une réunion, éventuellement en série, et invitez des personnes ou des équipes.',
        'Annulez plutôt que de supprimer une réunion où des actions ont été décidées.',
      ],
    },
  },
  {
    match: /^\/admin\/agenda/,
    topic: {
      title: 'Agenda',
      purpose: 'Tous les événements de l’atelier : réunions, briefings, formations, audits, maintenances, événements opérationnels.',
      steps: [
        'Choisissez la vue Jour, Semaine, Mois ou Liste ; les flèches changent de période.',
        'Cliquez sur un créneau libre ou sur « + » pour créer un événement ; cliquez sur un événement pour l’ouvrir.',
        'Filtrez par type d’événement.',
      ],
      tips: ['Les événements simultanés sont affichés côte à côte ; la ligne rouge indique l’heure actuelle.'],
    },
  },
  {
    match: /^\/admin\/routines/,
    topic: {
      title: 'Routines',
      purpose: 'Définir les routines standard : tâches, durées, contrôles et checklists associées.',
      steps: [
        'Créez une routine et ses tâches ; marquez les tâches obligatoires.',
        '« Planifier » l’affecte ensuite à des personnes ou des équipes.',
      ],
      tips: ['Archiver une routine arrête ses planifications à venir sans effacer l’historique.'],
    },
  },
  {
    match: /^\/admin\/checklists/,
    topic: {
      title: 'Checklists',
      purpose: 'Les listes de contrôles réutilisables dans les routines : oui/non, conformité, valeur mesurée, choix.',
      steps: ['Créez une checklist et ses points de contrôle, avec leur type et, pour une mesure, ses tolérances.'],
    },
  },
  {
    match: /^\/admin\/sequences/,
    topic: {
      title: 'Séquences',
      purpose: 'Définir les séquences guidées : étapes et durée prévue de chacune.',
      steps: ['Créez une séquence, ordonnez ses étapes, activez-la pour la rendre disponible.'],
    },
  },
  {
    match: /^\/admin\/connaissances/,
    topic: {
      title: 'Centre de connaissances (gestion)',
      purpose: 'Publier et tenir à jour les standards et les liens utiles.',
      steps: ['Créez un standard en brouillon, puis publiez-le ; marquez « à relire » ce qui doit être revu.'],
    },
  },
  {
    match: /^\/admin\/utilisateurs/,
    topic: {
      title: 'Utilisateurs',
      purpose: 'Créer les comptes, attribuer les rôles et les rattachements (équipe, ligne, poste).',
      steps: [
        '« Nouvel utilisateur » crée le compte et affiche un mot de passe provisoire une seule fois : transmettez-le à la personne.',
        '« Réinitialiser le mot de passe » en génère un nouveau et ferme les sessions ouvertes.',
        'Désactiver un compte coupe immédiatement l’accès ; son historique est conservé.',
      ],
      tips: ['Personne ne peut modifier son propre rôle ni désactiver son propre compte.'],
    },
  },
  {
    match: /^\/admin\/equipes/,
    topic: {
      title: 'Équipes',
      purpose: 'Composer les équipes : quart, ligne, responsable et membres.',
      steps: ['Le quart et la ligne de l’équipe s’appliquent à ses membres.'],
    },
  },
  {
    match: /^\/admin\/postes/,
    topic: {
      title: 'Postes et QR codes',
      purpose: 'Les postes de travail, leur position sur le plan et leur QR code.',
      steps: ['Imprimez le QR code d’un poste : le scanner ouvre directement le signalement d’anomalie pour ce poste.'],
      tips: ['Le code d’un poste doit rester unique : il figure dans les QR codes imprimés.'],
    },
  },
  {
    match: /^\/admin\/roles/,
    topic: {
      title: 'Rôles et droits',
      purpose: 'Ce que chaque rôle peut faire dans l’application.',
      steps: ['Consultez la matrice des droits par rôle ; le rôle d’une personne se change dans l’écran Utilisateurs.'],
      tips: ['Les droits sont appliqués par le serveur : masquer un bouton ne suffit jamais à donner ou retirer un accès.'],
    },
  },
  {
    match: /^\/admin\/parametres/,
    topic: {
      title: 'Paramètres',
      purpose: 'Les réglages de l’atelier : nom, délai d’escalade des Andon, tolérance de retard des routines, modules utilisés.',
      steps: [
        'Modifiez une valeur puis enregistrez.',
        'Dans « Modules », décochez ce que le site n’utilise pas (Gemba Walk, contrôles LQC, production…) puis enregistrez.',
      ],
      tips: [
        'Un module décoché disparaît des menus, des tableaux de bord et de l’aide ; ses données sont conservées et il se réactive à tout moment.',
        'Les tableaux BI restent masqués tant qu’aucun outil BI n’est connecté.',
        'Le fuseau horaire de l’atelier, qui fixe la date du jour pour tous, se règle côté serveur.',
      ],
    },
  },
  {
    match: /^\/admin\/journal/,
    topic: {
      title: 'Journal d’audit',
      purpose: 'La trace des opérations sensibles enregistrées par le serveur : connexions, comptes, planifications, Andon, refus d’accès…',
      steps: ['Recherchez un événement ou une personne.'],
      tips: ['Le journal est en lecture seule : personne ne peut le modifier ni le supprimer.'],
    },
  },
  {
    match: /^\/admin\/integration/,
    topic: {
      title: 'Intégration ERP',
      purpose: 'Préparer et tester la liaison avec l’ERP de l’entreprise.',
      steps: [
        '« Synchroniser maintenant » lit l’ERP et enregistre les données reçues ; l’historique et les envois vers l’ERP sont suivis ici.',
      ],
      tips: ['Tant que le bandeau « Mock SAP — simulation » est affiché, aucune donnée ne vient du SAP de l’entreprise.'],
    },
  },

  /* ---------- Écrans communs ---------- */
  {
    match: /^\/processus/,
    topic: {
      title: 'Carte du processus',
      purpose: 'Comment le travail s’enchaîne dans l’atelier, et où en est chaque étape aujourd’hui.',
      steps: [
        'Onglet Organisation du travail : de la configuration à la clôture des actions ; chaque étape affiche ses chiffres du moment et ouvre l’écran correspondant.',
        'Onglet Flux de fabrication : les postes dans l’ordre de fabrication, ligne par ligne, avec leur état.',
      ],
      tips: ['Les étapes que votre rôle ne permet pas d’ouvrir restent visibles, sans lien.'],
    },
  },
  {
    match: /^\/andon\/[^/]+/,
    topic: {
      title: 'Détail d’un Andon',
      purpose: 'Suivre un Andon de son déclenchement à sa résolution.',
      steps: [
        'Prenez en charge, démarrez la résolution, puis résolvez en indiquant la cause et l’action réalisée.',
        'Créez une action corrective pour éviter la récidive.',
      ],
    },
  },
  {
    match: /^\/andon/,
    topic: {
      title: 'Andon',
      purpose: 'Signaler un arrêt ou un problème au poste et obtenir une intervention rapide.',
      steps: [
        '« Déclencher un Andon » : choisissez le poste, le type (qualité, équipement, matière, sécurité) et décrivez le problème.',
        'Les intervenants de la ligne sont prévenus ; « Je prends en charge » indique qui intervient.',
      ],
      tips: [
        'Un seul Andon actif par type et par poste.',
        'Un Andon non pris en charge dans le délai d’escalade défini par l’administration est mis en évidence.',
      ],
    },
  },
  {
    match: /^\/actions\/[^/]+/,
    topic: {
      title: 'Détail d’une action',
      purpose: 'Faire avancer une action jusqu’à sa clôture.',
      steps: [
        'Changez l’état ; indiquez la raison d’un blocage, et la résolution à la clôture.',
        'Les commentaires informent le responsable, le suppléant et le créateur.',
      ],
    },
  },
  {
    match: /^\/anomalies\/[^/]+/,
    topic: {
      title: 'Détail d’une anomalie',
      purpose: 'Qualifier et traiter une anomalie.',
      steps: [
        'Corrigez la catégorie, la gravité ou le poste si besoin ; passez-la en traitement ; créez une action ; clôturez avec la résolution.',
      ],
    },
  },
  {
    match: /^\/reunions\/[^/]+/,
    topic: {
      title: 'Réunion',
      purpose: 'Préparer, tenir et conclure une réunion.',
      steps: [
        'Cochez les présents et l’ordre du jour traité, rédigez le compte rendu.',
        'Les décisions deviennent des actions avec un responsable et une échéance.',
      ],
    },
  },
  {
    match: /^\/connaissances\/[^/]+/,
    topic: { title: 'Standard', purpose: 'Lire un standard et ses points clés.', steps: ['L’étoile l’ajoute à vos favoris.'] },
  },
  {
    match: /^\/gemba\/[^/]+/,
    topic: {
      title: 'Gemba Walk',
      purpose: 'Le détail d’une visite terrain et de ses actions.',
      steps: ['Suivez les actions issues des observations, puis clôturez la visite.'],
    },
  },
  {
    match: /^\/sequences\/execution/,
    topic: {
      title: 'Exécution d’une séquence',
      purpose: 'Dérouler une séquence étape par étape.',
      steps: ['Validez chaque étape ; mettez en pause si besoin ; la séquence se termine après la dernière étape.'],
    },
  },
  {
    match: /^\/signaler/,
    topic: {
      title: 'Signaler une anomalie',
      purpose: 'Remonter un problème constaté sur le terrain.',
      steps: [
        'Choisissez la catégorie et la gravité, décrivez le problème, ajoutez une photo si utile.',
        'Scanner le QR code d’un poste préremplit le poste.',
      ],
      tips: ['Une anomalie critique prévient immédiatement l’encadrement.'],
    },
  },
];

const FALLBACK: HelpTopic = {
  title: 'Aide',
  purpose: 'Retrouver l’usage de l’application.',
  steps: [
    'Le sélecteur en haut du menu permet de passer d’un espace à l’autre : Mon travail, Supervision, Administration, selon vos droits.',
    'Les pastilles du menu indiquent ce qui attend une action.',
  ],
  related: [{ label: 'Carte du processus', to: '/processus' }],
};

export function helpFor(pathname: string): HelpTopic {
  return TOPICS.find((t) => t.match.test(pathname))?.topic ?? FALLBACK;
}

/** Vrai si l'adresse a une rubrique propre (vérifié par les tests pour chaque écran) */
export const hasSpecificHelp = (pathname: string) => TOPICS.some((t) => t.match.test(pathname));

/** Lexique : les termes de l'atelier utilisés dans l'application */
export const GLOSSARY: { term: string; definition: string }[] = [
  { term: 'Andon', definition: 'Alerte déclenchée au poste pour signaler un problème et obtenir une intervention rapide.' },
  { term: 'Hancho', definition: 'Chef d’équipe de proximité, responsable de son équipe sur le terrain.' },
  { term: 'Line Leader', definition: 'Responsable d’une ligne de production et des équipes qui y travaillent.' },
  { term: 'LQC', definition: 'Contrôle qualité de ligne : mesures au poste et suivi de la conformité.' },
  { term: 'Gemba Walk', definition: 'Visite terrain structurée de l’encadrement, pour observer et améliorer.' },
  { term: '5S', definition: 'Méthode d’organisation du poste : trier, ranger, nettoyer, standardiser, maintenir.' },
  { term: 'Routine', definition: 'Ensemble de tâches standard à réaliser régulièrement, planifié pour une personne ou une équipe.' },
  {
    term: 'Occurrence',
    definition: 'Une routine prévue un jour donné ; son état : à venir, à faire, en cours, en retard, terminée, manquée.',
  },
  {
    term: 'Action corrective',
    definition: 'Tâche décidée pour corriger un problème ou éviter qu’il se reproduise, avec un responsable et une échéance.',
  },
  { term: 'OF', definition: 'Ordre de fabrication : quantité d’un faisceau à produire, suivie d’étape en étape.' },
  { term: 'Kanban', definition: 'Stock au poste avec un minimum qui déclenche le réapprovisionnement.' },
  { term: 'Passation', definition: 'Informations transmises d’une équipe à la suivante au changement de poste.' },
];
