/* Contenus de référence repris du prototype (legacy/LL-App-LL.html).
   Ce sont des EXEMPLES destinés au mode démonstration : noms fictifs,
   standards génériques. À remplacer par les données réelles de l'atelier. */

import type { AnomalyCategory, KnowledgeCategory, Role } from '@/types/domain';

export const DEMO_USERS: { id: string; name: string; role: Role; line?: 'A' | 'B'; zone: string; shift?: 'morning' | 'afternoon' | 'night' }[] = [
  { id: 'u-karim', name: 'Karim Benali', role: 'line_leader', line: 'A', zone: 'Ligne A', shift: 'morning' },
  { id: 'u-sofia', name: 'Sofia Marques', role: 'line_leader', line: 'B', zone: 'Ligne B', shift: 'afternoon' },
  { id: 'u-yann', name: 'Yann Duclos', role: 'hancho', line: 'A', zone: 'Ligne A — Sertissage', shift: 'morning' },
  { id: 'u-lucia', name: 'Lucía Fernandez', role: 'hancho', line: 'B', zone: 'Ligne B — Test électrique', shift: 'morning' },
  { id: 'u-marc', name: 'Marc Weller', role: 'hancho', line: 'A', zone: 'Ligne A — Assemblage', shift: 'afternoon' },
  { id: 'u-aicha', name: 'Aïcha Camara', role: 'quality', zone: 'Contrôle qualité', shift: 'morning' },
  { id: 'u-tom', name: 'Tom Berg', role: 'quality', zone: 'Contrôle qualité', shift: 'afternoon' },
  { id: 'u-hina', name: 'Hina Patel', role: 'quality', zone: 'Contrôle qualité', shift: 'night' },
  { id: 'u-nadia', name: 'Nadia Roussel', role: 'operator', line: 'A', zone: 'Ligne A — Rubanage', shift: 'morning' },
  { id: 'u-ibrahim', name: 'Ibrahim Keita', role: 'operator', line: 'B', zone: 'Ligne B — Coupe', shift: 'morning' },
  { id: 'u-dupont', name: 'Xavier Dupont', role: 'manager', zone: 'Atelier', shift: 'morning' },
  { id: 'u-admin', name: 'Administrateur démo', role: 'admin', zone: 'Support', shift: 'morning' },
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
  id: string; code: string; category: KnowledgeCategory; title: string; summary: string; points: string[];
}[] = [
  { id: 'kb-sec-01', code: 'SEC-01', category: 'safety', title: 'Conformité EPI — zone câblage',
    summary: 'Vérifier que chaque opérateur porte les équipements de protection individuelle avant d’entrer en zone.',
    points: ['Gants résistants aux coupures', 'Lunettes de protection en zone de coupe', 'Chaussures de sécurité fermées', 'Cheveux attachés ou charlotte', 'Bagues et bijoux retirés avant le poste'] },
  { id: 'kb-5s-01', code: '5S-01', category: '5s', title: 'Rangement et désencombrement des postes',
    summary: 'Chaque poste est rangé selon la grille 5S avant la fin du poste.',
    points: ['Trier : retirer l’outillage inutile', 'Ranger : chaque outil à son emplacement étiqueté', 'Nettoyer les plans de travail', 'Standardiser les emplacements entre postes', 'Maintenir : audit visuel de 30 secondes'] },
  { id: 'kb-std-01', code: 'STD-01', category: 'standard', title: 'Rubanage et routage des faisceaux',
    summary: 'Critères de conformité du rubanage en sortie de poste.',
    points: ['Routage conforme au plan du faisceau', 'Recouvrement du ruban ≥ 50 %', 'Aucun ruban torsadé ou plié', 'Longueurs de dérivation respectées (± 5 mm)', 'Connecteurs centrés sur les points d’ancrage'] },
  { id: 'kb-std-02', code: 'STD-02', category: 'standard', title: 'Sertissage — presse A',
    summary: 'Contrôle du sertissage sur la presse A (postes 1 à 4).',
    points: ['Outil conforme à la référence fil/terminal', 'Force de sertissage dans les tolérances', 'Pas de bavure ni d’écrasement du fil', 'Essai de traction avant lancement', 'Signaler tout défaut immédiatement'] },
  { id: 'kb-std-03', code: 'STD-03', category: 'standard', title: 'Coupe et dénudage — tolérances',
    summary: 'Longueurs de coupe et de dénudage acceptables.',
    points: ['Longueur de coupe conforme au dossier faisceau', 'Dénudage sans entaille du cuivre', 'Aucun brin coupé', 'Défaut machine : anomalie + maintenance'] },
  { id: 'kb-std-04', code: 'STD-04', category: 'standard', title: 'Test électrique — continuité',
    summary: 'Conformité des enregistrements de test des faisceaux.',
    points: ['Programme du testeur conforme à la référence', 'Résultat de continuité OK affiché', 'Enregistrement horodaté', 'Écart : déclarer une anomalie et isoler le lot'] },
  { id: 'kb-qual-01', code: 'QUAL-01', category: 'quality', title: 'Contrôle visuel des connecteurs',
    summary: 'Critères visuels de contrôle des connecteurs sur la ligne.',
    points: ['Aucun contact plié ou manquant', 'Verrou secondaire en place', 'Boîtier sans casse', 'Orientation conforme', 'Insertion confirmée au clic'] },
  { id: 'kb-qual-02', code: 'QUAL-02', category: 'quality', title: 'Contrôle premier article',
    summary: 'Validation du premier article en début de série ou de poste.',
    points: ['Prélever le premier faisceau de la série', 'Mesurer les cotes critiques', 'Comparer au référentiel', 'Valider ou ouvrir une alerte qualité'] },
  { id: 'kb-qual-03', code: 'QUAL-03', category: 'quality', title: 'Bilan de conformité de fin de poste',
    summary: 'Synthèse des contrôles qualité à transmettre au Line Leader.',
    points: ['Relever la conformité par poste', 'Lister les anomalies transmises', 'Clôturer les écarts traités', 'Signaler l’usure matérielle à la maintenance'] },
  { id: 'kb-perf-01', code: 'PERF-01', category: 'performance', title: 'Bilan du jour — réalisé / écarts',
    summary: 'Indicateurs de performance pour la clôture de ligne.',
    points: ['Objectif planifié atteint ou non', 'Causes d’écart : matière, machine, effectif', 'Taux de rebut', 'Actions du lendemain'] },
  { id: 'kb-prod-01', code: 'PROD-01', category: 'production', title: 'Plan de production du jour',
    summary: 'Référence pour le point d’ouverture de ligne.',
    points: ['Ordres de fabrication planifiés', 'Priorités clients', 'Affectation ligne / référence faisceau', 'Capacité cible par poste'] },
  { id: 'kb-mat-01', code: 'MAT-01', category: 'material', title: 'Flux matières — tresse et épissures',
    summary: 'Approvisionnement des consommables sur la ligne de coupe.',
    points: ['Stock au-dessus du minimum kanban', 'Étiquettes référence / lot visibles', 'Réapprovisionnement déclenché sous le seuil', 'Alerter le Line Leader en cas de risque de rupture'] },
];

export const DEMO_LINKS = [
  { id: 'kb-link-01', code: 'LIEN-01', category: 'performance' as KnowledgeCategory, title: 'Tableau de performance atelier (exemple)', url: 'https://example.com/performance' },
  { id: 'kb-link-02', code: 'LIEN-02', category: 'standard' as KnowledgeCategory, title: 'Standard de rubanage ligne B (exemple)', url: 'https://example.com/rubanage' },
];

export const DEMO_ROUTINES: { id: string; role: Role; title: string; time: string; items: [string, string?][] }[] = [
  { id: 'rt-ll-open', role: 'line_leader', title: 'Ouverture de ligne', time: '06:30', items: [
    ['Présences et congés de l’équipe vérifiés'], ['Plan de production du jour vérifié', 'kb-prod-01'], ['Priorités communiquées (OF, clients, qualité)'] ] },
  { id: 'rt-ll-safety', role: 'line_leader', title: 'Revue sécurité et 5S', time: '06:45', items: [
    ['Zones de coupe et d’assemblage inspectées', 'kb-5s-01'], ['Port des EPI conforme', 'kb-sec-01'], ['Anomalies de sécurité signalées'] ] },
  { id: 'rt-ll-close', role: 'line_leader', title: 'Clôture de ligne', time: '21:30', items: [
    ['Bilan de journée établi (réalisé, rebuts)', 'kb-perf-01'], ['Anomalies du jour revues'], ['Passation rédigée pour l’équipe suivante'] ] },
  { id: 'rt-ha-crimp', role: 'hancho', title: 'Contrôle presses de sertissage', time: '07:00', items: [
    ['Presses et outils des postes 1 à 4 contrôlés', 'kb-std-02'], ['Défauts de sertissage ou d’outillage signalés'] ] },
  { id: 'rt-ha-cut', role: 'hancho', title: 'Contrôle coupe et dénudage', time: '13:00', items: [
    ['Machines de coupe contrôlées (longueurs, dénudage)', 'kb-std-03'], ['Flux matières vérifié (tresse, épissures)', 'kb-mat-01'] ] },
  { id: 'rt-ha-test', role: 'hancho', title: 'Contrôle poste de test électrique', time: '15:00', items: [
    ['Testeurs de continuité vérifiés', 'kb-std-04'], ['Enregistrements de test conformes'] ] },
  { id: 'rt-q-first', role: 'quality', title: 'Contrôle premier article', time: '07:30', items: [
    ['Premier article prélevé', 'kb-qual-02'], ['Mesures comparées au référentiel', 'kb-qual-01'], ['Article validé ou alerte qualité ouverte'] ] },
  { id: 'rt-q-conn', role: 'quality', title: 'Contrôle connecteurs et rubanage', time: '11:00', items: [
    ['Contrôle visuel des connecteurs', 'kb-qual-01'], ['Rubanage et routage conformes', 'kb-std-01'], ['Résultats saisis'] ] },
  { id: 'rt-q-end', role: 'quality', title: 'Bilan qualité de fin de poste', time: '17:00', items: [
    ['Bilan de conformité établi', 'kb-qual-03'], ['Anomalies transmises au Line Leader'] ] },
];

/** Ancienne « checklist digitale » du prototype → routine d'audit terrain du Line Leader. */
export const DEMO_AUDIT_SECTIONS: { title: string; items: string[] }[] = [
  { title: 'Sécurité', items: ['EPI conformes sur la ligne', 'Zones de circulation dégagées', 'Aucune situation dangereuse', 'Issues de secours accessibles'] },
  { title: '5S', items: ['Postes rangés', 'Outillage à sa place', 'Aucun déchet au sol', 'Marquage au sol visible'] },
  { title: 'Respect du standard', items: ['Mode opératoire suivi', 'Points de contrôle réalisés', 'Aucune dérive observée', 'Réglages conformes'] },
  { title: 'Qualité', items: ['Premier article conforme', 'Contrôles LQC réalisés', 'Aucun défaut non traité', 'Pièces non conformes isolées'] },
  { title: 'Performance', items: ['Cadence respectée', 'Pas de micro-arrêts répétitifs', 'Flux tiré respecté (kanban)', 'Objectif horaire atteint'] },
  { title: 'Production', items: ['Aucun Andon en attente', 'Matières disponibles aux postes', 'Aucun OF bloqué sans action', 'Encours dans les limites'] },
  { title: 'Actions précédentes', items: ['Actions de la veille vérifiées', 'Actions échues traitées', 'Passation du jour lue', 'Annonce du jour relayée'] },
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
