import type { SectorKey } from '@/data/sectors';

/* Contenu de la démo propre à chaque secteur (remplace le contenu de l'atelier de câblage).
   Vocabulaire, défauts, équipements et pratiques repris de la recherche documentée « Modèles de secteur sourcés ». */

export interface KnowledgeText {
  title: string;
  summary: string;
  points: string[];
}

export interface SectorDemoContent {
  /** Standards du centre de connaissances, par identifiant du jeu d'origine */
  knowledge: Partial<Record<string, KnowledgeText>>;
  /** Titres d'actions, par identifiant */
  actions: Partial<Record<string, string>>;
  /** Anomalies du jour : qualité, 5S, équipement */
  todayAnomalies: [string, string, string];
  /** Séquence de changement (série, moule, produit…) */
  changeover: { name: string; description: string; steps: { title: string; instruction?: string; validation?: string; minutes: number }[] };
  /** 7 matières, dans l'ordre des stocks du jeu d'origine : [nom, unité] */
  materials: [string, string][];
  /** 4 mesures qualité : [nom, unité, minimum, maximum, nominal] */
  characteristics: [string, string, number, number, number][];
  gemba: { zone: string; comment: string; finding: string; improvement: string }[];
  handovers: [string, string];
  training: string;
}

/** Standards communs à tous les secteurs autres que le câblage (formulations neutres) */
export const COMMON_KNOWLEDGE: Partial<Record<string, KnowledgeText>> = {
  'kb-qual-03': {
    title: 'Bilan de conformité de fin de poste',
    summary: 'Synthèse des contrôles qualité à transmettre au responsable de ligne.',
    points: [
      'Relever la conformité par poste',
      'Lister les anomalies transmises',
      'Clôturer les écarts traités',
      'Signaler l’usure du matériel à la maintenance',
    ],
  },
  'kb-prod-01': {
    title: 'Plan de production du jour',
    summary: 'Référence pour le point d’ouverture de ligne.',
    points: ['Ordres de fabrication planifiés', 'Priorités clients', 'Affectation ligne / référence produit', 'Capacité cible par poste'],
  },
};

export const SECTOR_DEMO_CONTENT: Partial<Record<SectorKey, SectorDemoContent>> = {
  generic: {
    knowledge: {
      'kb-sec-01': {
        title: 'Équipements de protection en zone de production',
        summary: 'Équipements de protection individuelle exigés avant d’entrer en zone.',
        points: [
          'Chaussures de sécurité',
          'Lunettes de protection aux postes signalés',
          'Gants adaptés à la tâche',
          'Bijoux retirés, cheveux attachés',
        ],
      },
      'kb-std-01': {
        title: 'Mode opératoire — assemblage',
        summary: 'Séquence et points clés de l’assemblage au poste 3.',
        points: [
          'Composants conformes à la nomenclature',
          'Ordre de montage respecté',
          'Couples de serrage appliqués',
          'Autocontrôle avant de passer la pièce',
        ],
      },
      'kb-std-02': {
        title: 'Réglage de la machine du poste 2',
        summary: 'Paramètres de réglage et vérifications après réglage.',
        points: ['Paramètres conformes à la fiche de réglage', 'Première pièce contrôlée', 'Réglage enregistré', 'Tout écart signalé'],
      },
      'kb-std-03': {
        title: 'Préparation des composants',
        summary: 'Contrôle et préparation des composants avant la ligne.',
        points: ['Référence et lot vérifiés', 'Quantité conforme à l’ordre', 'Composants non conformes isolés'],
      },
      'kb-std-04': {
        title: 'Essais fonctionnels',
        summary: 'Réalisation et enregistrement des essais en fin de ligne.',
        points: ['Programme d’essai conforme à la référence', 'Résultat enregistré', 'Pièce non conforme isolée et anomalie déclarée'],
      },
      'kb-qual-01': {
        title: 'Contrôle d’aspect',
        summary: 'Critères visuels de conformité des pièces.',
        points: ['Aucune rayure ni choc', 'Aucune pièce manquante', 'Marquage lisible', 'Comparer à la pièce type en cas de doute'],
      },
      'kb-qual-02': {
        title: 'Contrôle premier article',
        summary: 'Validation de la première pièce en début de série ou de poste.',
        points: [
          'Prélever la première pièce de la série',
          'Mesurer les caractéristiques critiques',
          'Comparer au plan',
          'Valider ou ouvrir une alerte qualité',
        ],
      },
      'kb-mat-01': {
        title: 'Approvisionnement du bord de ligne',
        summary: 'Gestion des composants et consommables aux postes.',
        points: [
          'Stock au-dessus du minimum',
          'Étiquettes référence et lot visibles',
          'Réapprovisionnement déclenché sous le seuil',
          'Alerter en cas de risque de rupture',
        ],
      },
    },
    actions: {
      'ac-today-1': 'Reprendre le réglage de la machine du poste 2',
      'ac-task-2': 'Faire contrôler la machine bruyante du poste 2',
      'ac-meet-1': 'Relancer la maintenance sur la machine du poste 8',
      'ac-gemba-1': 'Créer un emplacement identifié pour les composants au poste 3',
    },
    todayAnomalies: [
      'Pièce non conforme détectée au contrôle premier article',
      'Outillage non rangé au poste 8',
      'Bruit anormal sur la machine du poste 2',
    ],
    changeover: {
      name: 'Changement de série — poste 2',
      description: 'Séquence du changement de série sur la machine du poste 2.',
      steps: [
        {
          title: 'Arrêter la machine et consigner',
          instruction: 'Couper l’énergie et poser le cadenas de consignation.',
          validation: 'Machine consignée',
          minutes: 2,
        },
        { title: 'Retirer les composants de la série précédente', minutes: 4 },
        { title: 'Monter l’outillage de la nouvelle série', instruction: 'Vérifier la référence de l’outillage.', minutes: 8 },
        { title: 'Régler selon la fiche de réglage', minutes: 5 },
        { title: 'Valider le premier article', validation: 'Première pièce conforme', minutes: 5 },
      ],
    },
    materials: [
      ['Composants A', 'pcs'],
      ['Composants B', 'pcs'],
      ['Visserie', 'pcs'],
      ['Emballages', 'pcs'],
      ['Étiquettes produit', 'pcs'],
      ['Étiquettes de contrôle', 'pcs'],
      ['Consommables poste 8', 'pcs'],
    ],
    characteristics: [
      ['Cote caractéristique', 'mm', 24.95, 25.05, 25],
      ['Couple de serrage', 'N·m', 8, 10, 9],
      ['Masse de la pièce', 'g', 145, 155, 150],
      ['Épaisseur', 'mm', 1.9, 2.1, 2],
    ],
    gemba: [
      {
        zone: 'Ligne A — Poste 3 (Assemblage)',
        comment: 'Composants cherchés sur le plan de travail',
        finding: 'Les composants sont cherchés plusieurs fois sur le plan de travail : perte de temps et risque d’erreur.',
        improvement: 'Créer un emplacement identifié par référence.',
      },
      {
        zone: 'Ligne B — Poste 8',
        comment: 'Déchets au sol',
        finding: 'Des chutes s’accumulent au sol et gênent le passage.',
        improvement: 'Installer un bac identifié et l’inclure dans l’audit 5S.',
      },
    ],
    handovers: [
      'Incident qualité au poste 2 toujours ouvert — voir avec la qualité en priorité.',
      'Machine du poste 2 bruyante au démarrage — surveiller. Composants A à réapprovisionner.',
    ],
    training: 'Formation — nouveau mode opératoire d’assemblage',
  },

  plastics: {
    knowledge: {
      'kb-sec-01': {
        title: 'Équipements de protection en zone presses',
        summary: 'Équipements exigés autour des presses à injecter et des sécheurs.',
        points: [
          'Chaussures de sécurité',
          'Gants de protection thermique pour la purge et le démoulage',
          'Lunettes de protection pendant la purge',
          'Ne jamais neutraliser une sécurité de presse',
        ],
      },
      'kb-std-01': {
        title: 'Assemblage des clips',
        summary: 'Assemblage des clips sur les boîtiers au poste 3.',
        points: [
          'Clip à la bonne référence et couleur',
          'Clip enclenché jusqu’au déclic',
          'Aucune trace de blanchiment',
          'Autocontrôle d’une pièce sur dix',
        ],
      },
      'kb-std-02': {
        title: 'Démarrage presse',
        summary: 'Vérifications avant de produire sur une presse.',
        points: [
          'Matière séchée selon sa fiche',
          'Point de rosée du sécheur conforme',
          'Paramètres conformes à la fiche de réglage',
          'Premières pièces contrôlées',
        ],
      },
      'kb-std-03': {
        title: 'Séchage des matières',
        summary: 'Temps, température et point de rosée de séchage selon la matière.',
        points: [
          'PA6 : 80 à 100 °C pendant 4 à 6 h',
          'PC : 120 °C pendant 3 à 4 h',
          'Point de rosée ≤ −30 °C (PA) ou ≤ −40 °C (PC)',
          'Valeurs de la fiche matière du fournisseur',
        ],
      },
      'kb-std-04': {
        title: 'Changement de moule',
        summary: 'Montage, raccordement et validation d’un moule.',
        points: [
          'Référence du moule conforme à l’OF',
          'Circuits d’eau repérés entrée/sortie, sans fuite',
          'Force de fermeture conforme',
          'Contrôle des 5 premières injections',
        ],
      },
      'kb-qual-01': {
        title: 'Défauts d’aspect des pièces injectées',
        summary: 'Reconnaître les défauts et réagir.',
        points: [
          'Manque matière : pièce incomplète',
          'Bavure au plan de joint',
          'Retassure en face des nervures',
          'Brûlure et ligne de soudure visible',
        ],
      },
      'kb-qual-02': {
        title: 'Validation des premières pièces',
        summary: 'Validation après démarrage ou changement de moule.',
        points: [
          'Contrôler les 5 premières injections',
          'Mesurer les cotes clés et le poids',
          'Comparer à la pièce type',
          'Valider ou ouvrir une alerte qualité',
        ],
      },
      'kb-mat-01': {
        title: 'Approvisionnement en matière',
        summary: 'Alimentation des trémies et des sécheurs.',
        points: [
          'Lot de matière identifié sur la trémie',
          'Matière humide jamais chargée',
          'Mélange maître dosé selon la fiche',
          'Alerter avant la rupture de matière',
        ],
      },
    },
    actions: {
      'ac-today-1': 'Reprendre le réglage de la presse 1 (retassures sur le capot)',
      'ac-task-2': 'Faire vérifier le circuit d’eau du moule de la presse 2',
      'ac-meet-1': 'Relancer la maintenance sur le sécheur de l’étuve 5',
      'ac-gemba-1': 'Ranger les clips dans un casier par référence et par couleur au poste 3',
    },
    todayAnomalies: [
      'Retassures sur le capot ABS, empreinte 2',
      'Carottes et purges non évacuées au pied de la presse 8',
      'Fuite d’eau sur le moule de la presse 2',
    ],
    changeover: {
      name: 'Changement de moule — presse 1',
      description: 'Séquence du changement de moule sur la presse 1.',
      steps: [
        {
          title: 'Arrêter la presse et consigner',
          instruction: 'Couper l’énergie et poser le cadenas de consignation.',
          validation: 'Presse consignée',
          minutes: 3,
        },
        { title: 'Déconnecter les circuits d’eau et démonter le moule', minutes: 10 },
        { title: 'Monter et brider le nouveau moule', instruction: 'Vérifier la référence du moule par rapport à l’OF.', minutes: 15 },
        { title: 'Raccorder les circuits d’eau repérés entrée/sortie', validation: 'Aucune fuite', minutes: 5 },
        { title: 'Contrôler les 5 premières injections', validation: 'Pièces conformes', minutes: 8 },
      ],
    },
    materials: [
      ['Granulés PP', 'kg'],
      ['Granulés ABS', 'kg'],
      ['Granulés PA6', 'kg'],
      ['Clips', 'pcs'],
      ['Mélange maître colorant', 'kg'],
      ['Étiquettes de contrôle', 'pcs'],
      ['Cartons d’emballage', 'pcs'],
    ],
    characteristics: [
      ['Poids du boîtier', 'g', 48, 52, 50],
      ['Cote de clipsage', 'mm', 12.3, 12.7, 12.5],
      ['Temps de cycle', 's', 20, 40, 30],
      ['Épaisseur de paroi', 'mm', 1.8, 2.2, 2],
    ],
    gemba: [
      {
        zone: 'Ligne A — Poste 3 (Assemblage clips)',
        comment: 'Clips cherchés dans des bacs mélangés',
        finding: 'Les clips de deux couleurs sont mélangés dans le même bac : risque d’erreur de référence.',
        improvement: 'Un casier par référence et par couleur, identifié.',
      },
      {
        zone: 'Ligne B — Presse 8',
        comment: 'Carottes au sol',
        finding: 'Les carottes et purges s’accumulent au pied de la presse.',
        improvement: 'Bac identifié « carottes » et passage au broyeur à chaque fin de poste.',
      },
    ],
    handovers: [
      'Retassures sur le capot de la presse 1 toujours en cours d’analyse — voir avec la qualité.',
      'Sécheur de l’étuve 5 lent à atteindre le point de rosée — surveiller. Granulés PA6 à réapprovisionner.',
    ],
    training: 'Formation — reconnaître les défauts d’injection',
  },

  machining: {
    knowledge: {
      'kb-sec-01': {
        title: 'Équipements de protection en atelier d’usinage',
        summary: 'Équipements exigés aux machines-outils.',
        points: [
          'Lunettes de protection',
          'Chaussures de sécurité',
          'Aucun gant près d’une broche en rotation',
          'Portes et protecteurs fermés en cycle',
        ],
      },
      'kb-std-01': {
        title: 'Ébavurage',
        summary: 'Critères d’ébavurage avant contrôle.',
        points: ['Aucune bavure sur les arêtes fonctionnelles', 'Chanfreins conformes au plan', 'Aucune rayure sur les portées'],
      },
      'kb-std-02': {
        title: 'Prise de poste sur machine à commande numérique',
        summary: 'Vérifications avant de produire.',
        points: [
          'Arrêt d’urgence testé',
          'Concentration du liquide de coupe au réfractomètre',
          'Graissage, pression d’air, convoyeur à copeaux',
          'Chauffe de la broche',
        ],
      },
      'kb-std-03': {
        title: 'Débit des barres',
        summary: 'Longueurs de débit et identification matière.',
        points: ['Matière et nuance conformes au plan', 'Numéro de coulée reporté', 'Longueur de débit conforme'],
      },
      'kb-std-04': {
        title: 'Rectification',
        summary: 'Réglage et contrôle en rectification.',
        points: ['Meule dressée', 'Cote et état de surface (Ra) contrôlés', 'Aucune brûlure de rectification'],
      },
      'kb-qual-01': {
        title: 'Défauts d’usinage',
        summary: 'Reconnaître les défauts et réagir.',
        points: [
          'Cote hors tolérance : vérifier l’usure de l’outil et les correcteurs',
          'Broutement : vibrations visibles en surface',
          'État de surface non conforme',
          'Bavures',
        ],
      },
      'kb-qual-02': {
        title: 'Premier article après réglage',
        summary: 'Contrôle complet de la première pièce avant la série.',
        points: [
          'Programme et indice du plan vérifiés',
          'Toutes les cotes du plan contrôlées',
          'Moyens de mesure étalonnés',
          'Valider ou ouvrir une alerte qualité',
        ],
      },
      'kb-mat-01': {
        title: 'Outils et plaquettes',
        summary: 'Gestion des outils coupants au poste.',
        points: ['Durées de vie préventives respectées', 'Plaquettes rangées par nuance', 'Outil usé remplacé et correcteur mis à jour'],
      },
    },
    actions: {
      'ac-today-1': 'Reprendre les correcteurs du tour CN 1 (diamètre hors tolérance)',
      'ac-task-2': 'Faire contrôler la broche du centre d’usinage 5',
      'ac-meet-1': 'Relancer la maintenance sur la rectifieuse 4',
      'ac-gemba-1': 'Créer un chariot de préréglage des outils par machine',
    },
    todayAnomalies: [
      'Diamètre hors tolérance sur l’axe, série en cours',
      'Copeaux non évacués autour du tour CN 2',
      'Bruit anormal de broche sur le centre d’usinage 5',
    ],
    changeover: {
      name: 'Changement de série — tour CN 1',
      description: 'Séquence du changement de série sur le tour CN 1.',
      steps: [
        {
          title: 'Arrêter la machine et sécuriser',
          instruction: 'Fin de cycle, broche à l’arrêt, porte ouverte.',
          validation: 'Machine à l’arrêt',
          minutes: 2,
        },
        { title: 'Monter les mors et les outils de la nouvelle série', minutes: 12 },
        { title: 'Charger le programme', instruction: 'Vérifier le programme et l’indice du plan.', minutes: 3 },
        { title: 'Mesurer les outils et saisir les correcteurs', minutes: 8 },
        { title: 'Contrôler la première pièce', validation: 'Toutes les cotes conformes', minutes: 10 },
      ],
    },
    materials: [
      ['Barres acier Ø 40', 'm'],
      ['Barres aluminium Ø 60', 'm'],
      ['Barres inox Ø 30', 'm'],
      ['Plaquettes carbure', 'pcs'],
      ['Huile soluble', 'L'],
      ['Étiquettes de contrôle', 'pcs'],
      ['Emballages', 'pcs'],
    ],
    characteristics: [
      ['Diamètre de portée', 'mm', 24.98, 25.02, 25],
      ['Longueur', 'mm', 119.9, 120.1, 120],
      ['État de surface Ra', 'µm', 0.2, 1.6, 0.8],
      ['Concentration liquide de coupe', '%', 2.5, 5, 3.8],
    ],
    gemba: [
      {
        zone: 'Îlot tournage — Tour CN 1',
        comment: 'Outils cherchés pendant le réglage',
        finding: 'Les outils du changement de série sont cherchés dans plusieurs armoires : réglage allongé.',
        improvement: 'Préparer les outils sur un chariot par machine avant le changement.',
      },
      {
        zone: 'Îlot fraisage — Centre d’usinage 8',
        comment: 'Copeaux autour de la machine',
        finding: 'Les copeaux débordent du bac et rendent le sol glissant.',
        improvement: 'Vider le bac à chaque fin de poste et l’ajouter à l’audit 5S.',
      },
    ],
    handovers: [
      'Diamètre hors tolérance sur le tour CN 1 en cours d’analyse — voir avec la qualité.',
      'Broche du centre d’usinage 5 bruyante — surveiller. Plaquettes carbure à réapprovisionner.',
    ],
    training: 'Formation — correcteurs d’outils et premier article',
  },

  food: {
    knowledge: {
      'kb-sec-01': {
        title: 'Tenue et hygiène en zone de production',
        summary: 'Règles d’entrée en zone de production alimentaire.',
        points: [
          'Tenue propre, charlotte et cache-barbe',
          'Lavage et désinfection des mains',
          'Aucun bijou ni objet en verre',
          'Chaussures de sécurité dédiées à la zone',
        ],
      },
      'kb-std-01': {
        title: 'Dosage des barquettes',
        summary: 'Dosage et pesée au poste 4.',
        points: ['Recette et lot conformes à l’OF', 'Poids net contrôlé selon le plan d’autocontrôle', 'Barquette non conforme retirée'],
      },
      'kb-std-02': {
        title: 'Cuisson',
        summary: 'Maîtrise de la cuisson (point critique).',
        points: [
          'Température à cœur à la sonde étalonnée en fin de cuisson',
          'Couple temps/température du plan HACCP (ex. 70 °C pendant 2 min)',
          'Relevé enregistré à chaque fournée',
        ],
      },
      'kb-std-03': {
        title: 'Refroidissement rapide',
        summary: 'Refroidissement des préparations cuisinées.',
        points: ['De +63 °C à +10 °C en 2 heures au plus', 'Stockage ensuite entre 0 et +3 °C', 'Durée enregistrée'],
      },
      'kb-std-04': {
        title: 'Détecteur de métaux',
        summary: 'Test du détecteur (point critique).',
        points: [
          'Témoins ferreux, non ferreux et inox passés dans le produit',
          'Au démarrage, en cours de production, après arrêt ou changement, en fin de production',
          'Échec : arrêt et produits isolés depuis le dernier test conforme',
        ],
      },
      'kb-qual-01': {
        title: 'Allergènes',
        summary: 'Les 14 allergènes à déclaration obligatoire et le changement de production.',
        points: [
          'Gluten, crustacés, œufs, poissons, arachides, soja, lait',
          'Fruits à coque, céleri, moutarde, sésame, sulfites, lupin, mollusques',
          'Nettoyage vérifié avant tout changement d’allergène',
        ],
      },
      'kb-qual-02': {
        title: 'Contrôle de démarrage de fabrication',
        summary: 'Validation du premier lot de la production.',
        points: [
          'Recette et ingrédients conformes',
          'Étiquette et allergènes conformes',
          'Poids et aspect conformes',
          'Valider ou ouvrir une alerte qualité',
        ],
      },
      'kb-mat-01': {
        title: 'Approvisionnement en ingrédients et emballages',
        summary: 'Alimentation de la ligne et traçabilité.',
        points: [
          'Lot de chaque ingrédient enregistré',
          'Premier entré, premier sorti',
          'Emballages et étiquettes au bon produit',
          'Alerter avant la rupture',
        ],
      },
    },
    actions: {
      'ac-today-1': 'Analyser la cause du fragment plastique trouvé au conditionnement',
      'ac-task-2': 'Faire vérifier le détecteur de métaux de la ligne B',
      'ac-meet-1': 'Relancer la maintenance sur la cellule de refroidissement',
      'ac-gemba-1': 'Identifier les ustensiles par couleur et par zone',
    },
    todayAnomalies: [
      'Fragment plastique trouvé dans une barquette',
      'Bac de déchets non vidé en zone de dosage',
      'Détecteur de métaux en défaut au test du témoin inox',
    ],
    changeover: {
      name: 'Changement de produit — ligne de conditionnement',
      description: 'Séquence du changement de produit avec changement d’allergène.',
      steps: [
        { title: 'Vider la ligne du produit précédent', validation: 'Aucune barquette ni étiquette du produit précédent', minutes: 5 },
        { title: 'Nettoyer selon la procédure allergènes', minutes: 20 },
        { title: 'Vérifier le nettoyage', validation: 'Nettoyage validé par la qualité', minutes: 5 },
        { title: 'Charger les emballages et étiquettes du produit suivant', minutes: 5 },
        { title: 'Tester le détecteur de métaux', validation: 'Trois témoins détectés et éjectés', minutes: 3 },
      ],
    },
    materials: [
      ['Pâtes à lasagne', 'kg'],
      ['Sauce bolognaise', 'kg'],
      ['Fromage râpé', 'kg'],
      ['Barquettes 400 g', 'pcs'],
      ['Film d’operculage', 'm'],
      ['Étiquettes produit', 'pcs'],
      ['Cartons d’expédition', 'pcs'],
    ],
    characteristics: [
      ['Température à cœur en fin de cuisson', '°C', 70, 100, 78],
      ['Chambre froide des produits finis', '°C', 0, 3, 1.8],
      ['Poids net barquette 400 g', 'g', 388, 430, 405],
      ['Durée de refroidissement +63 → +10 °C', 'min', 0, 120, 95],
    ],
    gemba: [
      {
        zone: 'Ligne cuisson — Poste 4 (Dosage)',
        comment: 'Ustensiles mélangés entre zones',
        finding: 'Des ustensiles de la zone crue sont posés en zone cuite : risque de contamination croisée.',
        improvement: 'Ustensiles identifiés par couleur et par zone, avec emplacements dédiés.',
      },
      {
        zone: 'Ligne conditionnement — Poste 8 (Operculage)',
        comment: 'Chutes de film au sol',
        finding: 'Les chutes de film d’operculage s’accumulent au sol.',
        improvement: 'Bac à chutes identifié et vidé à chaque fin de poste.',
      },
    ],
    handovers: [
      'Fragment plastique trouvé au conditionnement — lot isolé, voir avec la qualité en priorité.',
      'Cellule de refroidissement lente en fin de poste — surveiller les durées. Barquettes 400 g à réapprovisionner.',
    ],
    training: 'Formation — allergènes et changement de production',
  },

  electronics: {
    knowledge: {
      'kb-sec-01': {
        title: 'Zone protégée contre les décharges électrostatiques',
        summary: 'Règles d’entrée et de travail en zone protégée.',
        points: [
          'Bracelet testé chaque jour (moins de 35 MΩ)',
          'Blouse et chaussures dissipatrices',
          'Plans de travail reliés à la terre',
          'Aucun emballage non dissipatif en zone',
        ],
      },
      'kb-std-01': {
        title: 'Inspection optique automatique',
        summary: 'Traitement des défauts signalés par l’inspection optique.',
        points: [
          'Confirmer chaque défaut à la loupe',
          'Pont de soudure, manque de brasure, composant décalé',
          'Carte non conforme identifiée et isolée',
        ],
      },
      'kb-std-02': {
        title: 'Placement des composants',
        summary: 'Chargement des bobines et vérifications de la placeuse.',
        points: ['Bobine conforme au programme', 'Orientation des composants polarisés', 'Premier passage contrôlé'],
      },
      'kb-std-03': {
        title: 'Sérigraphie de la pâte à braser',
        summary: 'Mise en service et utilisation de la pâte.',
        points: [
          'Stockage entre 0 et 10 °C',
          'Remise à température avant ouverture',
          'Durée sur pochoir selon le fabricant',
          'Pochoir nettoyé',
        ],
      },
      'kb-std-04': {
        title: 'Composants sensibles à l’humidité',
        summary: 'Durée hors emballage selon le niveau MSL.',
        points: [
          'MSL 3 : 168 h ; MSL 4 : 72 h ; MSL 5 : 48 h',
          'Heure d’ouverture notée sur le sachet',
          'Étuvage si la durée est dépassée',
        ],
      },
      'kb-qual-01': {
        title: 'Défauts de brasage',
        summary: 'Reconnaître les défauts de brasage.',
        points: ['Pont de soudure', 'Effet Manhattan (composant dressé)', 'Manque de brasure', 'Billes de soudure'],
      },
      'kb-qual-02': {
        title: 'Validation de la première carte',
        summary: 'Contrôle de la première carte d’une série.',
        points: [
          'Programme et révision de la carte vérifiés',
          'Inspection optique et contrôle visuel',
          'Test fonctionnel',
          'Valider ou ouvrir une alerte qualité',
        ],
      },
      'kb-mat-01': {
        title: 'Gestion des bobines de composants',
        summary: 'Approvisionnement et identification des bobines.',
        points: [
          'Bobines identifiées par référence et lot',
          'Composants sensibles suivis selon leur niveau MSL',
          'Alerter avant la rupture',
        ],
      },
    },
    actions: {
      'ac-today-1': 'Analyser les ponts de soudure signalés sur la carte de contrôle',
      'ac-task-2': 'Faire vérifier le profil du four de refusion',
      'ac-meet-1': 'Relancer la maintenance sur la placeuse',
      'ac-gemba-1': 'Identifier les bobines en bord de ligne par référence et lot',
    },
    todayAnomalies: [
      'Ponts de soudure détectés en inspection optique',
      'Bobines non identifiées en bord de ligne',
      'Feeder bloqué sur la placeuse',
    ],
    changeover: {
      name: 'Changement de série — ligne CMS',
      description: 'Séquence du changement de série sur la ligne CMS.',
      steps: [
        { title: 'Retirer les bobines de la série précédente', minutes: 10 },
        { title: 'Changer le pochoir et nettoyer la sérigraphieuse', minutes: 8 },
        { title: 'Charger le programme de placement', instruction: 'Vérifier la révision de la carte.', minutes: 3 },
        { title: 'Charger et vérifier les bobines', validation: 'Bobines conformes au programme', minutes: 15 },
        { title: 'Valider la première carte', validation: 'Inspection optique et test conformes', minutes: 10 },
      ],
    },
    materials: [
      ['Pâte à braser', 'pots'],
      ['Cartes nues', 'pcs'],
      ['Bobines de résistances', 'bobines'],
      ['Bobines de condensateurs', 'bobines'],
      ['Sachets antistatiques', 'pcs'],
      ['Étiquettes de contrôle', 'pcs'],
      ['Fil à braser', 'bobines'],
    ],
    characteristics: [
      ['Température de pic de refusion', '°C', 235, 250, 243],
      ['Épaisseur de pâte déposée', 'µm', 100, 150, 125],
      ['Résistance du plan de travail', 'MΩ', 0, 1000, 120],
      ['Taux de premier passage au test', '%', 95, 100, 98],
    ],
    gemba: [
      {
        zone: 'Ligne CMS — Poste 2 (Placeuse)',
        comment: 'Bobines non identifiées',
        finding: 'Des bobines entamées sont posées sans étiquette de lot : risque d’erreur et perte de traçabilité.',
        improvement: 'Étiquette référence et lot sur chaque bobine entamée.',
      },
      {
        zone: 'Ligne finale — Poste 8 (Insertion)',
        comment: 'Emballage non dissipatif en zone',
        finding: 'Un sac plastique ordinaire est utilisé en zone protégée.',
        improvement: 'Retirer les emballages non dissipatifs et l’ajouter à l’audit ESD.',
      },
    ],
    handovers: [
      'Ponts de soudure sur la carte de contrôle en cours d’analyse — voir avec la qualité.',
      'Feeder de la placeuse capricieux — surveiller. Pâte à braser à réapprovisionner.',
    ],
    training: 'Formation — protection contre les décharges électrostatiques',
  },
};
