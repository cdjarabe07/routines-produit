/* Jeu initial de l'environnement simulé (docs/role-model.md, docs/current-state.md §6).
   Contenus d'illustration repris du prototype (legacy/LL-App-LL.html) : personnes fictives,
   standards génériques marqués « à valider ». À remplacer par les données réelles de l'atelier. */

import type { AnomalyCategory, CheckType, KnowledgeCategory, Priority, Recurrence, Role, Shift } from '@/types/domain';

export const DEMO_TEAMS: { id: string; name: string; shift?: Shift; line?: 'A' | 'B'; leader: string }[] = [
  { id: 'team-a', name: 'Équipe A — matin', shift: 'morning', line: 'A', leader: 'u-karim' },
  { id: 'team-b', name: 'Équipe B — matin', shift: 'morning', line: 'B', leader: 'u-lucia' },
  { id: 'team-pm', name: 'Équipe après-midi', shift: 'afternoon', leader: 'u-sofia' },
  { id: 'team-lqc', name: 'Qualité LQC', leader: 'u-aicha' },
];

export const DEMO_USERS: {
  id: string;
  name: string;
  role: Role;
  line?: 'A' | 'B';
  zone: string;
  shift?: Shift;
  team?: string;
  ws?: string;
}[] = [
  { id: 'u-karim', name: 'Karim Benali', role: 'line_leader', line: 'A', zone: 'Ligne A', shift: 'morning' },
  { id: 'u-sofia', name: 'Sofia Marques', role: 'line_leader', line: 'B', zone: 'Ligne B', shift: 'afternoon' },
  {
    id: 'u-yann',
    name: 'Yann Duclos',
    role: 'hancho',
    line: 'A',
    zone: 'Ligne A — Sertissage',
    shift: 'morning',
    team: 'team-a',
    ws: 'ws-p1',
  },
  {
    id: 'u-lucia',
    name: 'Lucía Fernandez',
    role: 'hancho',
    line: 'B',
    zone: 'Ligne B — Test électrique',
    shift: 'morning',
    team: 'team-b',
    ws: 'ws-p5',
  },
  { id: 'u-marc', name: 'Marc Weller', role: 'hancho', zone: 'Ligne A — Assemblage', shift: 'afternoon', team: 'team-pm', ws: 'ws-p3' },
  { id: 'u-aicha', name: 'Aïcha Camara', role: 'quality', zone: 'Contrôle qualité', shift: 'morning', team: 'team-lqc', ws: 'ws-p6' },
  { id: 'u-tom', name: 'Tom Berg', role: 'quality', zone: 'Contrôle qualité', shift: 'afternoon', team: 'team-lqc', ws: 'ws-p6' },
  { id: 'u-hina', name: 'Hina Patel', role: 'quality', zone: 'Contrôle qualité', shift: 'night', team: 'team-lqc', ws: 'ws-p6' },
  {
    id: 'u-nadia',
    name: 'Nadia Roussel',
    role: 'operator',
    line: 'A',
    zone: 'Ligne A — Rubanage',
    shift: 'morning',
    team: 'team-a',
    ws: 'ws-p4',
  },
  {
    id: 'u-ibrahim',
    name: 'Ibrahim Keita',
    role: 'operator',
    line: 'B',
    zone: 'Ligne B — Coupe',
    shift: 'morning',
    team: 'team-b',
    ws: 'ws-p8',
  },
  { id: 'u-dupont', name: 'Xavier Dupont', role: 'manager', zone: 'Atelier', shift: 'morning' },
  { id: 'u-admin', name: 'Claire Fontaine', role: 'admin', zone: 'Support applicatif', shift: 'morning' },
];

export const DEMO_WORKSTATIONS = [
  { id: 'ws-p1', code: 'P1', name: 'Poste 1 — Sertissage', process: 'Sertissage', line: 'A', x: 12, y: 30 },
  { id: 'ws-p2', code: 'P2', name: 'Poste 2 — Coupe & dénudage', process: 'Coupe', line: 'A', x: 37, y: 30 },
  { id: 'ws-p3', code: 'P3', name: 'Poste 3 — Assemblage', process: 'Assemblage', line: 'A', x: 62, y: 30 },
  { id: 'ws-p4', code: 'P4', name: 'Poste 4 — Rubanage', process: 'Rubanage', line: 'A', x: 87, y: 30 },
  { id: 'ws-p8', code: 'P8', name: 'Poste 8 — Coupe ligne B', process: 'Coupe', line: 'B', x: 12, y: 74 },
  { id: 'ws-p5', code: 'P5', name: 'Poste 5 — Test électrique', process: 'Test électrique', line: 'B', x: 37, y: 74 },
  { id: 'ws-p6', code: 'P6', name: 'Poste 6 — Contrôle qualité LQC', process: 'Contrôle', line: 'B', x: 62, y: 74 },
  { id: 'ws-p7', code: 'P7', name: 'Poste 7 — Kitting & expédition', process: 'Expédition', line: 'B', x: 87, y: 74 },
] as const;

export const DEMO_KNOWLEDGE: {
  id: string;
  code: string;
  category: KnowledgeCategory;
  title: string;
  summary: string;
  points: string[];
}[] = [
  {
    id: 'kb-sec-01',
    code: 'SEC-01',
    category: 'safety',
    title: 'Conformité EPI — zone câblage',
    summary: 'Vérifier que chaque opérateur porte les équipements de protection individuelle avant d’entrer en zone.',
    points: [
      'Gants résistants aux coupures',
      'Lunettes de protection en zone de coupe',
      'Chaussures de sécurité fermées',
      'Cheveux attachés ou charlotte',
      'Bagues et bijoux retirés avant le poste',
    ],
  },
  {
    id: 'kb-5s-01',
    code: '5S-01',
    category: '5s',
    title: 'Rangement et désencombrement des postes',
    summary: 'Chaque poste est rangé selon la grille 5S avant la fin du poste.',
    points: [
      'Trier : retirer l’outillage inutile',
      'Ranger : chaque outil à son emplacement étiqueté',
      'Nettoyer les plans de travail',
      'Standardiser les emplacements entre postes',
      'Maintenir : audit visuel de 30 secondes',
    ],
  },
  {
    id: 'kb-std-01',
    code: 'STD-01',
    category: 'standard',
    title: 'Rubanage et routage des faisceaux',
    summary: 'Critères de conformité du rubanage en sortie de poste.',
    points: [
      'Routage conforme au plan du faisceau',
      'Recouvrement du ruban ≥ 50 %',
      'Aucun ruban torsadé ou plié',
      'Longueurs de dérivation respectées (± 5 mm)',
      'Connecteurs centrés sur les points d’ancrage',
    ],
  },
  {
    id: 'kb-std-02',
    code: 'STD-02',
    category: 'standard',
    title: 'Sertissage — presse A',
    summary: 'Contrôle du sertissage sur la presse A (postes 1 à 4).',
    points: [
      'Outil conforme à la référence fil/terminal',
      'Force de sertissage dans les tolérances',
      'Pas de bavure ni d’écrasement du fil',
      'Essai de traction avant lancement',
      'Signaler tout défaut immédiatement',
    ],
  },
  {
    id: 'kb-std-03',
    code: 'STD-03',
    category: 'standard',
    title: 'Coupe et dénudage — tolérances',
    summary: 'Longueurs de coupe et de dénudage acceptables.',
    points: [
      'Longueur de coupe conforme au dossier faisceau',
      'Dénudage sans entaille du cuivre',
      'Aucun brin coupé',
      'Défaut machine : anomalie + maintenance',
    ],
  },
  {
    id: 'kb-std-04',
    code: 'STD-04',
    category: 'standard',
    title: 'Test électrique — continuité',
    summary: 'Conformité des enregistrements de test des faisceaux.',
    points: [
      'Programme du testeur conforme à la référence',
      'Résultat de continuité OK affiché',
      'Enregistrement horodaté',
      'Écart : déclarer une anomalie et isoler le lot',
    ],
  },
  {
    id: 'kb-qual-01',
    code: 'QUAL-01',
    category: 'quality',
    title: 'Contrôle visuel des connecteurs',
    summary: 'Critères visuels de contrôle des connecteurs sur la ligne.',
    points: [
      'Aucun contact plié ou manquant',
      'Verrou secondaire en place',
      'Boîtier sans casse',
      'Orientation conforme',
      'Insertion confirmée au clic',
    ],
  },
  {
    id: 'kb-qual-02',
    code: 'QUAL-02',
    category: 'quality',
    title: 'Contrôle premier article',
    summary: 'Validation du premier article en début de série ou de poste.',
    points: [
      'Prélever le premier faisceau de la série',
      'Mesurer les cotes critiques',
      'Comparer au référentiel',
      'Valider ou ouvrir une alerte qualité',
    ],
  },
  {
    id: 'kb-qual-03',
    code: 'QUAL-03',
    category: 'quality',
    title: 'Bilan de conformité de fin de poste',
    summary: 'Synthèse des contrôles qualité à transmettre au Line Leader.',
    points: [
      'Relever la conformité par poste',
      'Lister les anomalies transmises',
      'Clôturer les écarts traités',
      'Signaler l’usure matérielle à la maintenance',
    ],
  },
  {
    id: 'kb-perf-01',
    code: 'PERF-01',
    category: 'performance',
    title: 'Bilan du jour — réalisé / écarts',
    summary: 'Indicateurs de performance pour la clôture de ligne.',
    points: ['Objectif planifié atteint ou non', 'Causes d’écart : matière, machine, effectif', 'Taux de rebut', 'Actions du lendemain'],
  },
  {
    id: 'kb-prod-01',
    code: 'PROD-01',
    category: 'production',
    title: 'Plan de production du jour',
    summary: 'Référence pour le point d’ouverture de ligne.',
    points: ['Ordres de fabrication planifiés', 'Priorités clients', 'Affectation ligne / référence faisceau', 'Capacité cible par poste'],
  },
  {
    id: 'kb-mat-01',
    code: 'MAT-01',
    category: 'material',
    title: 'Flux matières — tresse et épissures',
    summary: 'Approvisionnement des consommables sur la ligne de coupe.',
    points: [
      'Stock au-dessus du minimum kanban',
      'Étiquettes référence / lot visibles',
      'Réapprovisionnement déclenché sous le seuil',
      'Alerter le Line Leader en cas de risque de rupture',
    ],
  },
];

/* ---------- Checklists réutilisables ---------- */

export interface DemoCheck {
  id: string;
  label: string;
  type: CheckType;
  required?: boolean;
  unit?: string;
  min?: number;
  max?: number;
  options?: string[];
  /** Valeur nominale (génération de l'historique des contrôles numériques) */
  nominal?: number;
  photo?: 'optional' | 'required';
  commentOnFail?: boolean;
  autoAnomaly?: 'minor' | 'major' | 'critical';
}

export const DEMO_CHECKLISTS: { id: string; name: string; description: string; items: DemoCheck[] }[] = [
  {
    id: 'cl-epi',
    name: 'Équipements de protection',
    description: 'Port des EPI avant la prise de poste (standard SEC-01).',
    items: [
      { id: 'gants', label: 'Gants anti-coupure portés', type: 'conformity', required: true },
      { id: 'lunettes', label: 'Lunettes en zone de coupe', type: 'conformity', required: true },
      { id: 'chaussures', label: 'Chaussures de sécurité', type: 'conformity', required: true },
    ],
  },
  {
    id: 'cl-first',
    name: 'Premier article',
    description: 'Mesures du premier faisceau de la série (standard QUAL-02).',
    items: [
      { id: 'ref', label: 'Référence faisceau contrôlée', type: 'text', required: true },
      { id: 'hauteur', label: 'Hauteur de sertissage', type: 'number', unit: 'mm', min: 1.42, max: 1.52, nominal: 1.47, required: true },
      { id: 'force', label: 'Force d’arrachement', type: 'number', unit: 'N', min: 80, max: 120, nominal: 100, required: true },
      { id: 'aspect', label: 'Aspect des connecteurs', type: 'conformity', required: true },
      { id: 'decision', label: 'Décision', type: 'select', options: ['Série validée', 'Alerte qualité ouverte'], required: true },
    ],
  },
  {
    id: 'cl-5s',
    name: 'Audit 5S du poste',
    description: 'Grille 5S de fin de poste (standard 5S-01).',
    items: [
      { id: 'trier', label: 'Outillage inutile retiré', type: 'conformity', required: true },
      { id: 'ranger', label: 'Chaque outil à son emplacement', type: 'conformity', required: true },
      { id: 'nettoyer', label: 'Plan de travail nettoyé', type: 'conformity', required: true },
      { id: 'sol', label: 'Aucune chute de câble au sol', type: 'yes_no', required: true },
    ],
  },
];

/* ---------- Routines et planification ---------- */

export interface DemoTask {
  title: string;
  instructions?: string;
  min?: number;
  required?: boolean;
  priority?: Priority;
  kb?: string;
  checklist?: string;
  checks?: DemoCheck[];
}

export interface DemoRoutine {
  id: string;
  title: string;
  description?: string;
  time: string;
  durationMin: number;
  line?: 'A' | 'B';
  ws?: string;
  tasks: DemoTask[];
  /** Planifications de la routine */
  schedules: {
    id: string;
    recurrence: Recurrence;
    weekdays?: number[];
    assignee?: string;
    team?: string;
    time?: string;
    /** Répétition dans la journée */
    everyHours?: number;
    endTime?: string;
  }[];
}

const simple = (title: string, kb?: string): DemoTask => ({ title, kb, min: 3 });

export const DEMO_ROUTINES: DemoRoutine[] = [
  {
    id: 'rt-op-start',
    title: 'Contrôle début de poste',
    description: 'Vérifications de l’opérateur avant de lancer la production au poste.',
    time: '07:30',
    durationMin: 20,
    line: 'A',
    tasks: [
      {
        title: 'Vérifier le poste',
        instructions: 'Plan de travail dégagé, éclairage fonctionnel, écran du mode opératoire allumé.',
        min: 5,
        required: true,
        priority: 'high',
      },
      {
        title: 'Vérifier les outils',
        instructions: 'Contrôler l’outil de sertissage et réaliser une pièce d’essai.',
        min: 5,
        required: true,
        priority: 'high',
        kb: 'kb-std-02',
        checks: [
          {
            id: 'outil',
            label: 'Outil conforme à la référence du terminal',
            type: 'conformity',
            required: true,
            commentOnFail: true,
            autoAnomaly: 'major',
          },
          { id: 'lot', label: 'Lot de terminaux chargé', type: 'lot', required: true },
          {
            id: 'essai',
            label: 'Hauteur de sertissage de la pièce d’essai',
            type: 'number',
            unit: 'mm',
            min: 1.42,
            max: 1.52,
            nominal: 1.47,
            required: true,
            photo: 'optional',
            autoAnomaly: 'major',
          },
        ],
      },
      { title: 'Vérifier les équipements', min: 5, required: true, priority: 'high', kb: 'kb-sec-01', checklist: 'cl-epi' },
      {
        title: 'Vérifier les documents',
        min: 5,
        required: false,
        priority: 'medium',
        kb: 'kb-std-01',
        checks: [
          { id: 'mo', label: 'Mode opératoire affiché au poste', type: 'yes_no', required: true },
          { id: 'version', label: 'Indice du dossier faisceau', type: 'text' },
        ],
      },
    ],
    schedules: [
      { id: 'sc-op-start-a', recurrence: 'weekdays', team: 'team-a' },
      { id: 'sc-op-start-b', recurrence: 'weekdays', team: 'team-b' },
    ],
  },
  {
    id: 'rt-op-5s',
    title: 'Rangement 5S de fin de poste',
    time: '13:30',
    durationMin: 15,
    line: 'A',
    ws: 'ws-p4',
    tasks: [
      { title: 'Audit 5S du poste', min: 10, required: true, priority: 'medium', kb: 'kb-5s-01', checklist: 'cl-5s' },
      { title: 'Signaler les manques de consommables', min: 5, required: false, priority: 'low', kb: 'kb-mat-01' },
    ],
    schedules: [{ id: 'sc-op-5s-nadia', recurrence: 'weekdays', assignee: 'u-nadia' }],
  },
  {
    id: 'rt-ll-open',
    title: 'Ouverture de ligne',
    time: '06:30',
    durationMin: 15,
    line: 'A',
    tasks: [
      simple('Présences et congés de l’équipe vérifiés'),
      simple('Plan de production du jour vérifié', 'kb-prod-01'),
      simple('Priorités communiquées (OF, clients, qualité)'),
    ],
    schedules: [{ id: 'sc-ll-open', recurrence: 'daily', assignee: 'u-karim' }],
  },
  {
    id: 'rt-ll-safety',
    title: 'Revue sécurité et 5S',
    time: '06:45',
    durationMin: 15,
    line: 'A',
    tasks: [
      simple('Zones de coupe et d’assemblage inspectées', 'kb-5s-01'),
      simple('Port des EPI conforme', 'kb-sec-01'),
      { title: 'Anomalies de sécurité signalées', min: 3, required: false },
    ],
    schedules: [{ id: 'sc-ll-safety', recurrence: 'daily', assignee: 'u-karim' }],
  },
  {
    id: 'rt-ll-close',
    title: 'Clôture de ligne',
    time: '21:30',
    durationMin: 20,
    line: 'B',
    tasks: [
      simple('Bilan de journée établi (réalisé, rebuts)', 'kb-perf-01'),
      simple('Anomalies du jour revues'),
      simple('Passation rédigée pour l’équipe suivante'),
    ],
    schedules: [{ id: 'sc-ll-close', recurrence: 'weekdays', assignee: 'u-sofia' }],
  },
  {
    id: 'rt-ha-crimp',
    title: 'Contrôle presses de sertissage',
    time: '07:00',
    durationMin: 20,
    line: 'A',
    ws: 'ws-p1',
    tasks: [
      {
        title: 'Presses et outils des postes 1 à 4',
        min: 12,
        required: true,
        priority: 'high',
        kb: 'kb-std-02',
        checks: [
          { id: 'force', label: 'Force de sertissage presse A', type: 'number', unit: 'kN', min: 18, max: 22, nominal: 20, required: true },
          { id: 'usure', label: 'Usure de l’outil acceptable', type: 'conformity', required: true },
        ],
      },
      { title: 'Défauts de sertissage ou d’outillage signalés', min: 5, required: false },
    ],
    schedules: [{ id: 'sc-ha-crimp', recurrence: 'daily', assignee: 'u-yann' }],
  },
  {
    id: 'rt-ha-crimp-hourly',
    title: 'Contrôle fréquentiel de sertissage',
    description: 'Mesure de hauteur de sertissage toutes les deux heures, pour détecter une dérive avant qu’elle ne produise des rebuts.',
    time: '08:00',
    durationMin: 5,
    line: 'A',
    ws: 'ws-p1',
    tasks: [
      {
        title: 'Mesurer un échantillon',
        min: 5,
        required: true,
        priority: 'high',
        kb: 'kb-std-02',
        checks: [
          {
            id: 'hauteur',
            label: 'Hauteur de sertissage',
            type: 'number',
            unit: 'mm',
            min: 1.42,
            max: 1.52,
            nominal: 1.47,
            required: true,
            autoAnomaly: 'major',
          },
        ],
      },
    ],
    schedules: [{ id: 'sc-ha-crimp-hourly', recurrence: 'weekdays', team: 'team-a', everyHours: 2, endTime: '16:00' }],
  },
  {
    id: 'rt-ha-cut',
    title: 'Contrôle coupe et dénudage',
    time: '10:00',
    durationMin: 15,
    line: 'B',
    ws: 'ws-p8',
    tasks: [
      simple('Machines de coupe contrôlées (longueurs, dénudage)', 'kb-std-03'),
      simple('Flux matières vérifié (tresse, épissures)', 'kb-mat-01'),
    ],
    schedules: [{ id: 'sc-ha-cut', recurrence: 'weekdays', assignee: 'u-lucia' }],
  },
  {
    id: 'rt-ha-test',
    title: 'Contrôle poste de test électrique',
    time: '11:30',
    durationMin: 15,
    line: 'B',
    ws: 'ws-p5',
    tasks: [simple('Testeurs de continuité vérifiés', 'kb-std-04'), simple('Enregistrements de test conformes')],
    schedules: [{ id: 'sc-ha-test', recurrence: 'weekly', weekdays: [1, 3, 5], assignee: 'u-lucia' }],
  },
  {
    id: 'rt-q-first',
    title: 'Contrôle premier article',
    time: '07:45',
    durationMin: 20,
    ws: 'ws-p6',
    tasks: [
      { title: 'Prélever le premier article', min: 3, required: true, priority: 'high', kb: 'kb-qual-02' },
      { title: 'Mesurer et décider', min: 15, required: true, priority: 'high', kb: 'kb-qual-01', checklist: 'cl-first' },
    ],
    schedules: [{ id: 'sc-q-first', recurrence: 'weekdays', assignee: 'u-aicha' }],
  },
  {
    id: 'rt-q-conn',
    title: 'Contrôle connecteurs et rubanage',
    time: '11:00',
    durationMin: 20,
    tasks: [simple('Contrôle visuel des connecteurs', 'kb-qual-01'), simple('Rubanage et routage conformes', 'kb-std-01')],
    schedules: [{ id: 'sc-q-conn', recurrence: 'weekdays', team: 'team-lqc' }],
  },
  {
    id: 'rt-q-end',
    title: 'Bilan qualité de fin de poste',
    time: '17:00',
    durationMin: 15,
    tasks: [simple('Bilan de conformité établi', 'kb-qual-03'), simple('Anomalies transmises au Line Leader')],
    schedules: [{ id: 'sc-q-end', recurrence: 'weekdays', assignee: 'u-tom' }],
  },
];

/** Ancienne « checklist digitale » du prototype → routine d'audit terrain du Line Leader (une tâche par thème). */
export const DEMO_AUDIT_SECTIONS: { title: string; items: string[] }[] = [
  {
    title: 'Sécurité',
    items: ['EPI conformes sur la ligne', 'Zones de circulation dégagées', 'Aucune situation dangereuse', 'Issues de secours accessibles'],
  },
  { title: '5S', items: ['Postes rangés', 'Outillage à sa place', 'Aucun déchet au sol', 'Marquage au sol visible'] },
  {
    title: 'Respect du standard',
    items: ['Mode opératoire suivi', 'Points de contrôle réalisés', 'Aucune dérive observée', 'Réglages conformes'],
  },
  {
    title: 'Qualité',
    items: ['Premier article conforme', 'Contrôles LQC réalisés', 'Aucun défaut non traité', 'Pièces non conformes isolées'],
  },
  {
    title: 'Performance',
    items: ['Cadence respectée', 'Pas de micro-arrêts répétitifs', 'Flux tiré respecté (kanban)', 'Objectif horaire atteint'],
  },
  {
    title: 'Production',
    items: ['Aucun Andon en attente', 'Matières disponibles aux postes', 'Aucun OF bloqué sans action', 'Encours dans les limites'],
  },
  {
    title: 'Actions précédentes',
    items: ['Actions de la veille vérifiées', 'Actions échues traitées', 'Passation du jour lue', 'Annonce du jour relayée'],
  },
];

export const DEMO_SEQUENCE_STEPS: [string, string, number][] = [
  ['Brief de ligne — priorités du jour', '06:30', 5],
  ['Revue sécurité et 5S', '06:45', 5],
  ['Contrôles équipements (Hancho)', '07:00', 10],
  ['Contrôle premier article (LQC)', '07:30', 10],
  ['Contrôle qualité en cours de poste', '11:00', 8],
  ['Bilan qualité de fin de poste', '17:00', 8],
  ['Clôture de ligne', '21:30', 5],
];

export const DEMO_ANOMALY_SAMPLES: { category: AnomalyCategory; text: string; ws: string }[] = [
  { category: 'quality', text: 'Connecteur mal positionné détecté au contrôle premier article', ws: 'ws-p4' },
  { category: '5s', text: 'Outillage non rangé au poste de coupe', ws: 'ws-p2' },
  { category: 'performance', text: 'Cadence sous objectif sur la ligne A (98 / 110 faisceaux)', ws: 'ws-p3' },
  { category: 'safety', text: 'EPI manquant en zone de coupe', ws: 'ws-p8' },
  { category: 'equipment', text: 'Bruit anormal sur la machine de dénudage', ws: 'ws-p2' },
  { category: 'quality', text: 'Défaut de sertissage — hauteur hors tolérance', ws: 'ws-p1' },
  { category: 'material', text: 'Terminaux livrés avec une mauvaise référence', ws: 'ws-p1' },
  { category: 'standard', text: 'Mode opératoire non affiché au poste', ws: 'ws-p5' },
  { category: 'quality', text: 'Recouvrement du ruban insuffisant', ws: 'ws-p4' },
  { category: 'equipment', text: 'Testeur de continuité en défaut intermittent', ws: 'ws-p5' },
  { category: '5s', text: 'Chutes de câble au sol', ws: 'ws-p8' },
  { category: 'material', text: 'Stock de capuchons d’essai sous le minimum', ws: 'ws-p5' },
];
