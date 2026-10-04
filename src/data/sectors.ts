import { DEFAULT_CATALOG } from '@/app/catalog';
import type { ModuleKey } from '@/app/modules';
import type { Catalog, CatalogEntry, ChecklistItem, Priority, RoutineTask } from '@/types/domain';

/* Modèles de secteur : ils pré-remplissent la configuration d'une entreprise à sa mise en route
   (référentiels, checklists, routines types, modules). Ils s'effacent ensuite : l'entreprise adapte tout
   à ses standards, rien ne dépend du modèle après application.
   Contenu établi d'après des sources citées (règlements, normes, guides professionnels) ; les valeurs propres
   à chaque usine sont des EXEMPLES signalés dans l'aide du contrôle (« à adapter »). */

export type SectorKey = 'generic' | 'automotive' | 'plastics' | 'machining' | 'food' | 'electronics';

/** Cadence conseillée : sert à la planification proposée et à la démo */
export type Cadence = 'shift' | 'hourly' | 'every2h' | 'daily' | 'weekly' | 'event' | 'event_order' | 'layers';

export interface SectorChecklist {
  name: string;
  description: string;
  items: ChecklistItem[];
}

export interface SectorRoutine {
  title: string;
  description: string;
  durationMin: number;
  defaultTime: string;
  /** Fréquence conseillée, en clair (le modèle ne planifie rien : il n'y a encore personne à affecter) */
  suggestedFrequency: string;
  cadence: Cadence;
  /** Référence de la règle ou de la pratique (règlement, norme, guide) */
  reference?: string;
  tasks: (Omit<RoutineTask, 'id' | 'checks' | 'checklistId'> & { checks?: ChecklistItem[]; checklist?: string })[];
}

export interface SectorTemplate {
  key: SectorKey;
  label: string;
  description: string;
  catalog: Partial<Catalog>;
  checklists: SectorChecklist[];
  routines: SectorRoutine[];
  /** Modules masqués par défaut */
  disabledModules: ModuleKey[];
}

/** Aide d'un contrôle dont la valeur est un exemple, à remplacer par celle de l'usine */
export const EXAMPLE_PREFIX = 'Valeur d’exemple à adapter : ';
export const isExampleValue = (item: Pick<ChecklistItem, 'help'>) => Boolean(item.help?.startsWith(EXAMPLE_PREFIX));

/* ---------- Constructeurs concis ---------- */

const ok = (id: string, label: string, extra: Partial<ChecklistItem> = {}): ChecklistItem => ({
  id,
  label,
  type: 'conformity',
  required: true,
  commentOnFail: true,
  ...extra,
});
const yes = (id: string, label: string, extra: Partial<ChecklistItem> = {}): ChecklistItem => ({
  id,
  label,
  type: 'yes_no',
  required: true,
  ...extra,
});
const num = (id: string, label: string, unit: string, min: number, max: number, extra: Partial<ChecklistItem> = {}): ChecklistItem => ({
  id,
  label,
  type: 'number',
  unit,
  min,
  max,
  required: true,
  ...extra,
});
/** Mesure dont les bornes sont un exemple (fiche de réglage, plan, fiche fournisseur…) */
const example = (why: string): Partial<ChecklistItem> => ({ help: `${EXAMPLE_PREFIX}${why}` });
const lot = (id: string, label: string): ChecklistItem => ({ id, label, type: 'lot', required: true });
const text = (id: string, label: string): ChecklistItem => ({ id, label, type: 'text', required: true });
const choice = (id: string, label: string, options: string[]): ChecklistItem => ({ id, label, type: 'select', options, required: true });
const task = (
  title: string,
  estimatedMin: number,
  extra: Partial<SectorRoutine['tasks'][number]> = {},
  priority: Priority = 'high',
): SectorRoutine['tasks'][number] => ({ title, estimatedMin, priority, required: true, ...extra });
const stages = (...labels: [string, string][]): CatalogEntry[] => labels.map(([key, label]) => ({ key, label }));
const withCategories = (...extra: [string, string][]): CatalogEntry[] => [
  ...DEFAULT_CATALOG.anomalyCategories.filter((c) => c.key !== 'other'),
  ...stages(...extra),
  { key: 'other', label: 'Autre' },
];

/* ---------- Routines communes ---------- */

const START_OF_SHIFT: SectorRoutine = {
  title: 'Démarrage de poste',
  description: 'Vérifications de l’opérateur avant de produire : sécurité, poste, outillage.',
  durationMin: 10,
  defaultTime: '06:15',
  suggestedFrequency: 'À chaque prise de poste',
  cadence: 'shift',
  tasks: [
    task('Sécurité', 3, {
      checks: [
        yes('epi', 'Équipements de protection portés'),
        ok('protections', 'Protections machine et arrêt d’urgence en place', { autoAnomaly: 'major' }),
      ],
    }),
    task('Poste de travail', 4, { checks: [ok('standard', 'Mode opératoire affiché et à jour'), ok('rangement', 'Poste rangé (5S)')] }),
    task('Outillage', 3, { checks: [ok('outils', 'Outils et moyens de contrôle présents et en bon état')] }),
  ],
};

const AUDIT_5S: SectorChecklist = {
  name: 'Audit 5S',
  description: 'Trier, ranger, nettoyer, standardiser, maintenir.',
  items: [
    ok('trier', 'Trier : aucun objet inutile au poste'),
    ok('ranger', 'Ranger : chaque chose à sa place, emplacements identifiés'),
    ok('nettoyer', 'Nettoyer : poste et machine propres, anomalies visibles'),
    ok('standardiser', 'Standardiser : standards visuels affichés et respectés'),
    ok('maintenir', 'Maintenir : actions du précédent audit soldées'),
  ],
};

const AUTONOMOUS_MAINTENANCE: SectorRoutine = {
  title: 'Maintenance autonome',
  description: 'Entretien de premier niveau réalisé par l’opérateur : nettoyer pour inspecter, lubrifier, resserrer.',
  durationMin: 15,
  defaultTime: '13:30',
  suggestedFrequency: 'Chaque semaine',
  cadence: 'weekly',
  reference: 'Maintenance productive totale (TPM)',
  tasks: [
    task('Nettoyage et inspection', 8, {
      checks: [ok('nettoyage', 'Machine nettoyée, aucune fuite ni pièce desserrée détectée', { photo: 'optional' })],
    }),
    task(
      'Lubrification et resserrage',
      7,
      {
        checks: [yes('lubrification', 'Points de lubrification graissés selon la carte'), yes('serrage', 'Fixations resserrées')],
      },
      'medium',
    ),
  ],
};

/** Audit par couches (AIAG CQI-8 : liste de niveau 1 de 10 à 15 questions oui/non) */
const LPA_QUESTIONS: ChecklistItem[] = [
  yes('q1', 'Le mode opératoire affiché correspond à la référence produite', { commentOnFail: true }),
  yes('q2', 'Les équipements de protection requis sont portés', { commentOnFail: true }),
  yes('q3', 'Les pièces non conformes sont isolées et identifiées', { commentOnFail: true }),
  yes('q4', 'Le contrôle de démarrage a été réalisé et enregistré', { commentOnFail: true }),
  yes('q5', 'Les moyens de contrôle sont étalonnés (étiquette valide)', { commentOnFail: true }),
  yes('q6', 'Les détrompeurs ont été vérifiés en début de poste', { commentOnFail: true }),
  yes('q7', 'L’opérateur connaît la réaction en cas de défaut', { commentOnFail: true }),
  yes('q8', 'Les enregistrements qualité du poste sont à jour', { commentOnFail: true }),
  yes('q9', 'Les composants au poste sont identifiés et à la bonne référence', { commentOnFail: true }),
  yes('q10', 'Le poste est rangé et propre', { commentOnFail: true }),
  yes('q11', 'L’opérateur est formé et habilité sur ce poste', { commentOnFail: true }),
  yes('q12', 'Les actions du précédent audit sont soldées', { commentOnFail: true }),
];

const LAYERED_AUDIT: SectorRoutine = {
  title: 'Audit par couches',
  description:
    'Questions oui/non tirées à tour de rôle à chaque audit. Planifiez-la à chaque niveau. Pour poser toute la liste à chaque fois, videz « questions tournantes ».',
  durationMin: 10,
  defaultTime: '10:00',
  suggestedFrequency: 'Niveau 1 chaque jour ou chaque poste, niveau 2 chaque semaine, niveau 3 chaque mois',
  cadence: 'layers',
  reference: 'AIAG CQI-8',
  tasks: [task('Questions d’audit', 10, { checks: LPA_QUESTIONS, sampleSize: 5 })],
};

const FIRST_ARTICLE = (checks: ChecklistItem[]): SectorRoutine => ({
  title: 'Validation du premier article',
  description: 'Après un réglage, un changement de série ou d’outil : la production ne démarre qu’avec une première pièce conforme.',
  durationMin: 15,
  defaultTime: '08:00',
  suggestedFrequency: 'Sur événement, au démarrage d’un ordre de fabrication',
  cadence: 'event_order',
  tasks: [
    task('Identifier la série', 3, { checks: [text('of', 'Référence produite'), lot('lot', 'Lot matière')] }),
    task('Mesurer la première pièce', 10, { checks }),
    task('Décider', 2, { checks: [ok('decision', 'Première pièce validée', { autoAnomaly: 'major', photo: 'optional' })] }),
  ],
});

const COTE = (extra: Partial<ChecklistItem> = {}) =>
  num('cote1', 'Cote caractéristique 1', 'mm', 24.95, 25.05, {
    autoAnomaly: 'major',
    ...example('cote et tolérance du plan de la pièce'),
    ...extra,
  });

/* ---------- Modèles ---------- */

export const SECTOR_TEMPLATES: Record<SectorKey, SectorTemplate> = {
  generic: {
    key: 'generic',
    label: 'Industrie (générique)',
    description: 'Une base neutre pour toute fabrication : démarrage de poste, 5S, maintenance autonome, audit par couches.',
    catalog: DEFAULT_CATALOG,
    checklists: [AUDIT_5S],
    routines: [
      START_OF_SHIFT,
      {
        title: 'Audit 5S hebdomadaire',
        description: 'Tour du poste avec la checklist 5S.',
        durationMin: 15,
        defaultTime: '14:00',
        suggestedFrequency: 'Chaque semaine',
        cadence: 'weekly',
        tasks: [task('Audit 5S', 15, { checklist: 'Audit 5S' }, 'medium')],
      },
      AUTONOMOUS_MAINTENANCE,
      LAYERED_AUDIT,
    ],
    disabledModules: ['erp', 'bi', 'sequences'],
  },

  automotive: {
    key: 'automotive',
    label: 'Automobile et équipementiers',
    description: 'Audits par couches (CQI-8), vérification des détrompeurs (IATF 16949), premier article, 5S.',
    catalog: {
      productionStages: stages(
        ['reception', 'Réception'],
        ['fabrication', 'Fabrication'],
        ['assembly', 'Assemblage'],
        ['final_inspection', 'Contrôle final'],
        ['packaging', 'Conditionnement'],
        ['shipping', 'Expédition'],
      ),
      anomalyCategories: withCategories(['customer', 'Réclamation client'], ['poka_yoke', 'Détrompeur']),
      roleLabels: { ...DEFAULT_CATALOG.roleLabels, hancho: 'Team leader', line_leader: 'Responsable d’UAP' },
    },
    checklists: [AUDIT_5S],
    routines: [
      {
        ...START_OF_SHIFT,
        reference: 'IATF 16949 §10.2.4',
        tasks: [
          ...START_OF_SHIFT.tasks,
          task('Détrompeurs', 4, {
            checks: [
              ok('detrompeur', 'Chaque détrompeur vérifié par défaillance simulée avec les pièces témoins', { autoAnomaly: 'critical' }),
              yes('temoins', 'Pièces témoins (« lapins rouges ») identifiées et en bon état'),
            ],
          }),
        ],
      },
      FIRST_ARTICLE([COTE(), ok('aspect', 'Aspect conforme')]),
      LAYERED_AUDIT,
      AUTONOMOUS_MAINTENANCE,
    ],
    disabledModules: ['bi'],
  },

  plastics: {
    key: 'plastics',
    label: 'Plasturgie (injection)',
    description: 'Démarrage presse (séchage, point de rosée), changement de moule, contrôle en cours de production.',
    catalog: {
      productionStages: stages(
        ['drying', 'Séchage matière'],
        ['injection', 'Injection'],
        ['finishing', 'Reprise et ébavurage'],
        ['assembly', 'Assemblage'],
        ['inspection', 'Contrôle'],
        ['packaging', 'Conditionnement'],
      ),
      andonPresets: {
        ...DEFAULT_CATALOG.andonPresets,
        quality: ['Manque matière', 'Bavure', 'Retassure', 'Brûlure', 'Ligne de soudure visible', 'Pièce déformée'],
        equipment: ['Presse à l’arrêt', 'Moule bloqué', 'Fuite du circuit d’eau', 'Sécheur en défaut', 'Robot de dépose en défaut'],
        material: ['Matière non séchée', 'Rupture de matière', 'Mauvais lot matière', 'Colorant manquant'],
      },
      roleLabels: { ...DEFAULT_CATALOG.roleLabels, operator: 'Conducteur de presse', hancho: 'Régleur', line_leader: 'Chef d’atelier' },
    },
    checklists: [
      {
        name: 'Changement de moule',
        description: 'Montage et mise en route d’un moule.',
        items: [
          ok('reference', 'Référence du moule conforme à l’ordre de fabrication'),
          ok('etat', 'Moule propre et inspecté, évents dégagés'),
          ok('eau', 'Circuits d’eau repérés entrée/sortie, raccordés, sans fuite'),
          ok('fermeture', 'Force de fermeture conforme à la fiche de réglage', { autoAnomaly: 'major' }),
          ok('ejection', 'Éjecteurs, tiroirs et noyaux revenus en position'),
          ok('securites', 'Sécurités de la presse actives', { autoAnomaly: 'critical' }),
        ],
      },
      AUDIT_5S,
    ],
    routines: [
      {
        title: 'Démarrage presse',
        description: 'Matière, sécheur et paramètres vérifiés avant de produire.',
        durationMin: 15,
        defaultTime: '06:15',
        suggestedFrequency: 'À chaque démarrage de presse',
        cadence: 'shift',
        tasks: [
          task('Matière', 5, {
            checks: [
              lot('lot', 'Lot matière chargé'),
              yes('sechage', 'Matière séchée selon sa fiche (temps et température)'),
              num('rosee', 'Point de rosée du sécheur', '°C', -60, -30, {
                autoAnomaly: 'major',
                ...example('≤ −30 °C pour un PA ; ≤ −40 °C pour PC, PET ou PBT'),
              }),
            ],
          }),
          task('Paramètres', 5, {
            checks: [
              num('temp', 'Température du moule', '°C', 40, 80, {
                autoAnomaly: 'major',
                ...example('valeur de la fiche de réglage du moule'),
              }),
              ok('fiche', 'Paramètres conformes à la fiche de réglage'),
            ],
          }),
          task('Premières injections', 5, { checks: [ok('aspect', 'Aspect des premières pièces conforme', { photo: 'optional' })] }),
        ],
      },
      {
        title: 'Changement de moule',
        description: 'Montage du moule, puis contrôle des 5 premières injections.',
        durationMin: 30,
        defaultTime: '08:00',
        suggestedFrequency: 'Sur événement, au changement de moule',
        cadence: 'event',
        tasks: [
          task('Montage', 20, { checklist: 'Changement de moule' }),
          task('Validation', 10, {
            checks: [
              text('moule', 'Identification du moule monté'),
              ok('premieres', 'Les 5 premières injections sont conformes', { autoAnomaly: 'major' }),
            ],
          }),
        ],
      },
      {
        title: 'Contrôle en cours de production',
        description: 'Prélèvement et contrôle d’une pièce : aspect, poids, temps de cycle.',
        durationMin: 5,
        defaultTime: '07:00',
        suggestedFrequency: 'Selon le plan de surveillance (exemple : toutes les heures)',
        cadence: 'hourly',
        tasks: [
          task('Contrôle', 5, {
            checks: [
              ok('aspect', 'Aspect conforme (manque, bavure, retassure, brûlure, ligne de soudure, déformation)'),
              num('poids', 'Poids de la pièce', 'g', 48, 52, {
                autoAnomaly: 'major',
                ...example('poids nominal et tolérance de la fiche de réglage'),
              }),
              num('cycle', 'Temps de cycle', 's', 20, 40, example('temps de cycle de la fiche de réglage')),
            ],
          }),
        ],
      },
    ],
    disabledModules: ['bi', 'sequences'],
  },

  machining: {
    key: 'machining',
    label: 'Usinage et mécanique',
    description: 'Prise de poste machine (liquide de coupe, broche), premier article après réglage, suivi des outils.',
    catalog: {
      productionStages: stages(
        ['cutting', 'Débit'],
        ['turning', 'Tournage'],
        ['milling', 'Fraisage'],
        ['grinding', 'Rectification'],
        ['deburring', 'Ébavurage'],
        ['inspection', 'Contrôle'],
        ['shipping', 'Expédition'],
      ),
      andonPresets: {
        ...DEFAULT_CATALOG.andonPresets,
        quality: ['Cote hors tolérance', 'Broutement', 'État de surface non conforme', 'Bavure', 'Doute sur une mesure'],
        equipment: ['Machine en alarme', 'Casse d’outil', 'Bruit anormal de broche', 'Moyen de mesure en défaut'],
      },
      roleLabels: {
        ...DEFAULT_CATALOG.roleLabels,
        operator: 'Opérateur sur commande numérique',
        hancho: 'Régleur',
        line_leader: 'Chef d’îlot',
      },
    },
    checklists: [AUDIT_5S],
    routines: [
      {
        title: 'Prise de poste machine',
        description: 'Sécurité, fluides et broche vérifiés avant de produire.',
        durationMin: 12,
        defaultTime: '06:15',
        suggestedFrequency: 'À chaque prise de poste',
        cadence: 'shift',
        tasks: [
          task('Sécurité', 3, {
            checks: [
              ok('au', 'Arrêt d’urgence testé', { autoAnomaly: 'critical' }),
              ok('protecteurs', 'Protecteurs et portes fonctionnels'),
            ],
          }),
          task('Fluides', 5, {
            checks: [
              num(
                'concentration',
                'Concentration du liquide de coupe (réfractomètre)',
                '%',
                2.5,
                5,
                example('fiche du fournisseur du liquide de coupe'),
              ),
              yes('graissage', 'Graissage des glissières au niveau'),
              yes('air', 'Pression d’air correcte'),
            ],
          }),
          task('Machine', 4, {
            checks: [yes('copeaux', 'Convoyeur à copeaux dégagé'), yes('broche', 'Chauffe de la broche réalisée, aucun bruit anormal')],
          }),
        ],
      },
      FIRST_ARTICLE([
        text('programme', 'Programme utilisé'),
        text('plan', 'Indice du plan'),
        COTE(),
        yes('toutes', 'Toutes les cotes du plan contrôlées'),
        yes('etalonne', 'Moyens de mesure étalonnés'),
      ]),
      {
        title: 'Suivi des outils',
        description: 'Durée de vie et usure des outils critiques.',
        durationMin: 5,
        defaultTime: '12:00',
        suggestedFrequency: 'Chaque jour',
        cadence: 'daily',
        tasks: [
          task('Outils critiques', 5, {
            checks: [
              num('vb', 'Usure en dépouille (VB) de l’outil critique', 'mm', 0, 0.3, {
                autoAnomaly: 'minor',
                ...example('fin de vie vers 0,2 à 0,3 mm, 0,1 mm sur inox ; selon vos outils'),
              }),
              yes('vie', 'Durées de vie préventives respectées'),
              yes('correcteurs', 'Correcteurs d’outil à jour'),
            ],
          }),
        ],
      },
      AUTONOMOUS_MAINTENANCE,
    ],
    disabledModules: ['bi', 'sequences'],
  },

  food: {
    key: 'food',
    label: 'Agroalimentaire',
    description: 'Hygiène avant démarrage, détecteur de métaux (BRCGS), cuisson et refroidissement, températures, poids, allergènes.',
    catalog: {
      productionStages: stages(
        ['reception', 'Réception'],
        ['preparation', 'Préparation'],
        ['cooking', 'Cuisson'],
        ['cooling', 'Refroidissement'],
        ['packaging', 'Conditionnement'],
        ['shipping', 'Expédition'],
      ),
      anomalyCategories: withCategories(
        ['hygiene', 'Hygiène'],
        ['allergen', 'Allergènes'],
        ['foreign_body', 'Corps étranger'],
        ['temperature', 'Température'],
        ['labelling', 'Étiquetage'],
        ['weight', 'Poids'],
      ),
      andonPresets: {
        ...DEFAULT_CATALOG.andonPresets,
        quality: ['Corps étranger', 'Température hors limite', 'Emballage non étanche', 'Étiquetage erroné', 'Poids hors tolérance'],
        equipment: ['Détecteur de métaux en défaut', 'Operculeuse à l’arrêt', 'Cellule de refroidissement en défaut', 'Machine à l’arrêt'],
        material: ['Rupture d’ingrédient', 'Barquettes manquantes', 'Lot non conforme reçu', 'Étiquettes manquantes'],
      },
      roleLabels: {
        ...DEFAULT_CATALOG.roleLabels,
        operator: 'Opérateur de production',
        line_leader: 'Chef de ligne',
        quality: 'Qualité – hygiène',
      },
    },
    checklists: [
      {
        name: 'Hygiène avant démarrage',
        description: 'Vérification de la réalisation et de l’efficacité du nettoyage et de la désinfection, selon le plan de nettoyage.',
        items: [
          ok('nettoyage', 'Nettoyage et désinfection réalisés selon le plan de nettoyage', { photo: 'optional', autoAnomaly: 'major' }),
          ok('residus', 'Aucun résidu de la production précédente'),
          ok('tenues', 'Tenues, charlottes et gants conformes'),
          ok('verre', 'Aucun bris de verre ou de plastique dur'),
        ],
      },
    ],
    routines: [
      {
        title: 'Hygiène avant démarrage',
        description: 'Aucun démarrage sans ligne propre et contrôlée.',
        durationMin: 15,
        defaultTime: '05:45',
        suggestedFrequency: 'Avant chaque démarrage de ligne',
        cadence: 'shift',
        reference: 'Guide de bonnes pratiques d’hygiène',
        tasks: [task('Inspection de la ligne', 15, { checklist: 'Hygiène avant démarrage' })],
      },
      {
        title: 'Test du détecteur de métaux',
        description:
          'Témoins passés dans le produit, en tête, au centre et en queue. En cas d’échec : arrêt de la ligne et produits isolés depuis le dernier test conforme.',
        durationMin: 5,
        defaultTime: '06:00',
        suggestedFrequency:
          'Au démarrage, en cours de production à la fréquence validée (souvent toutes les 30 à 60 min), après un arrêt ou un changement de produit, en fin de production',
        cadence: 'hourly',
        reference: 'BRCGS (point critique de maîtrise)',
        tasks: [
          task('Témoins', 5, {
            checks: [
              ok('ferreux', 'Témoin ferreux détecté et éjecté', {
                autoAnomaly: 'critical',
                ...example('taille validée par le site (ex. 1,5 mm en produit sec)'),
              }),
              ok('nonferreux', 'Témoin non ferreux détecté et éjecté', {
                autoAnomaly: 'critical',
                ...example('taille validée par le site (ex. 2,0 mm en produit sec)'),
              }),
              ok('inox', 'Témoin inox détecté et éjecté', {
                autoAnomaly: 'critical',
                ...example('taille validée par le site (ex. 2,5 mm en produit sec)'),
              }),
              yes('produit', 'Témoins passés dans le produit (tête, centre, queue)'),
            ],
          }),
        ],
      },
      {
        title: 'Cuisson et refroidissement',
        description: 'Température à cœur en fin de cuisson à la sonde étalonnée, puis refroidissement rapide.',
        durationMin: 5,
        defaultTime: '08:00',
        suggestedFrequency: 'À chaque fournée (exemple : toutes les 2 heures)',
        cadence: 'every2h',
        reference: 'Arrêté du 21 décembre 2009 ; plan HACCP',
        tasks: [
          task('Cuisson', 3, {
            checks: [
              num('coeur', 'Température à cœur en fin de cuisson', '°C', 70, 100, {
                autoAnomaly: 'critical',
                commentOnFail: true,
                ...example('couple temps/température de votre plan HACCP (ex. 70 °C pendant 2 min)'),
              }),
              yes('maintien', 'Durée de maintien à cette température respectée'),
            ],
          }),
          task('Refroidissement', 2, {
            checks: [
              num('refroidissement', 'Durée de refroidissement de +63 °C à +10 °C', 'min', 0, 120, {
                autoAnomaly: 'critical',
                commentOnFail: true,
                help: 'Arrêté du 21/12/2009 : 2 heures au maximum.',
              }),
            ],
          }),
        ],
      },
      {
        title: 'Relevé des températures',
        description: 'Enceintes froides des produits finis et maintien au chaud.',
        durationMin: 5,
        defaultTime: '07:00',
        suggestedFrequency: 'Plusieurs fois par jour (exemple : toutes les 2 heures)',
        cadence: 'every2h',
        reference: 'Arrêté du 21 décembre 2009',
        tasks: [
          task('Relevés', 5, {
            checks: [
              num('chambre', 'Chambre froide des produits finis', '°C', 0, 3, {
                autoAnomaly: 'major',
                commentOnFail: true,
                help: 'Plats cuisinés réfrigérés : entre 0 et +3 °C (arrêté du 21/12/2009).',
              }),
              num('chaud', 'Maintien au chaud', '°C', 63, 90, { commentOnFail: true, help: '63 °C au minimum à cœur.' }),
            ],
          }),
        ],
      },
      {
        title: 'Contrôle du poids des préemballages',
        description: 'Pesée d’un échantillon de barquettes par rapport à la quantité nominale.',
        durationMin: 5,
        defaultTime: '09:00',
        suggestedFrequency: 'Selon votre plan d’autocontrôle (exemple : toutes les 2 heures)',
        cadence: 'every2h',
        reference: 'Directive 76/211/CEE (erreur maximale tolérée)',
        tasks: [
          task('Pesée', 5, {
            checks: [
              num('poids', 'Poids net d’une barquette', 'g', 388, 430, {
                autoAnomaly: 'major',
                ...example('barquette de 400 g : erreur maximale tolérée de 3 %, soit 12 g ; adaptez à votre quantité nominale'),
              }),
            ],
          }),
        ],
      },
      {
        title: 'Changement d’allergène',
        description: 'Nettoyage selon la procédure allergènes du site, vérifié avant de libérer la ligne.',
        durationMin: 20,
        defaultTime: '08:00',
        suggestedFrequency: 'Sur événement, au changement de produit',
        cadence: 'event',
        reference: 'Règlement (UE) 1169/2011 (14 allergènes)',
        tasks: [
          task('Nettoyage', 15, {
            checks: [
              choice('allergene', 'Allergène de la production précédente', [
                'Gluten',
                'Crustacés',
                'Œufs',
                'Poissons',
                'Arachides',
                'Soja',
                'Lait',
                'Fruits à coque',
                'Céleri',
                'Moutarde',
                'Sésame',
                'Sulfites',
                'Lupin',
                'Mollusques',
              ]),
              ok('nettoyage', 'Nettoyage allergène réalisé et vérifié', { photo: 'required', autoAnomaly: 'critical' }),
            ],
          }),
          task('Libération', 5, {
            checks: [lot('lot', 'Lot du produit suivant'), ok('etiquettes', 'Étiquettes du produit suivant en place')],
          }),
        ],
      },
    ],
    disabledModules: ['bi', 'sequences', 'erp'],
  },

  electronics: {
    key: 'electronics',
    label: 'Électronique',
    description: 'Contrôle ESD (S20.20), composants sensibles à l’humidité (J-STD-033), pâte à braser, audit de ligne.',
    catalog: {
      productionStages: stages(
        ['printing', 'Sérigraphie'],
        ['placement', 'Placement CMS'],
        ['reflow', 'Refusion'],
        ['aoi', 'Inspection optique'],
        ['tht', 'Insertion traversante'],
        ['test', 'Test'],
        ['packaging', 'Conditionnement'],
      ),
      anomalyCategories: withCategories(['esd', 'ESD'], ['msl', 'Composants sensibles (MSL)'], ['soldering', 'Brasage']),
      andonPresets: {
        ...DEFAULT_CATALOG.andonPresets,
        quality: ['Pont de soudure', 'Effet Manhattan', 'Manque de brasure', 'Billes de soudure', 'Composant manquant ou décalé'],
        equipment: ['Placeuse en défaut', 'Four hors profil', 'Feeder bloqué', 'Bracelet ESD défaillant'],
      },
    },
    checklists: [AUDIT_5S],
    routines: [
      {
        title: 'Contrôle ESD',
        description: 'Bracelets et mises à la terre de la zone protégée, avant de manipuler des composants sensibles.',
        durationMin: 5,
        defaultTime: '06:15',
        suggestedFrequency: 'Chaque jour, avant de manipuler des composants sensibles',
        cadence: 'shift',
        reference: 'ANSI/ESD S20.20',
        tasks: [
          task('Protection ESD', 5, {
            checks: [
              ok('bracelet', 'Test du bracelet réussi (système inférieur à 35 MΩ)', { autoAnomaly: 'major' }),
              num('plan', 'Résistance du plan de travail à la terre', 'MΩ', 0, 1000, {
                commentOnFail: true,
                help: 'Limite S20.20 : moins de 1×10⁹ Ω, soit 1 000 MΩ.',
              }),
              ok('terre', 'Mises à la terre des postes raccordées'),
            ],
          }),
        ],
      },
      {
        title: 'Suivi des composants sensibles à l’humidité',
        description: 'Durée hors emballage selon le niveau MSL, à 30 °C et 60 % HR au plus ; étuvage si elle est dépassée.',
        durationMin: 5,
        defaultTime: '08:00',
        suggestedFrequency: 'À chaque ouverture d’un sachet de composants',
        cadence: 'event',
        reference: 'IPC/JEDEC J-STD-033',
        tasks: [
          task('Composant', 5, {
            checks: [
              lot('lot', 'Lot du composant'),
              choice('msl', 'Niveau MSL', [
                'MSL 2a (4 semaines)',
                'MSL 3 (168 h)',
                'MSL 4 (72 h)',
                'MSL 5 (48 h)',
                'MSL 5a (24 h)',
                'MSL 6 (selon étiquette)',
              ]),
              yes('duree', 'Durée hors emballage dans la limite du niveau', { autoAnomaly: 'major' }),
            ],
          }),
        ],
      },
      {
        title: 'Mise en service de la pâte à braser',
        description: 'Stockage au froid, remise à température avant ouverture, durée d’utilisation sur pochoir.',
        durationMin: 5,
        defaultTime: '06:30',
        suggestedFrequency: 'À chaque mise en service d’un pot',
        cadence: 'event',
        reference: 'Recommandations des fabricants de pâte à braser',
        tasks: [
          task('Pâte', 5, {
            checks: [
              lot('lot', 'Lot de la pâte'),
              yes('froid', 'Stockée au réfrigérateur entre 0 et 10 °C'),
              num('remise', 'Durée de remise à température avant ouverture', 'h', 2, 24, example('au moins 2 à 4 h selon le fabricant')),
              yes('heure', 'Heure de mise sur pochoir notée'),
            ],
          }),
        ],
      },
      LAYERED_AUDIT,
    ],
    disabledModules: ['bi'],
  },
};

export const SECTOR_KEYS = Object.keys(SECTOR_TEMPLATES) as SectorKey[];
