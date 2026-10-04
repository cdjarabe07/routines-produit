import { DEFAULT_CATALOG } from '@/app/catalog';
import type { ModuleKey } from '@/app/modules';
import type { Catalog, CatalogEntry, ChecklistItem, Priority, RoutineTask } from '@/types/domain';

/* Modèles de secteur : ils pré-remplissent la configuration d'une entreprise à sa mise en route
   (référentiels, checklists, routines types, modules). Ils s'effacent ensuite : l'entreprise adapte tout
   à ses standards, rien ne dépend du modèle après application. */

export type SectorKey = 'generic' | 'automotive' | 'plastics' | 'machining' | 'food' | 'electronics';

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
  /** Fréquence conseillée, affichée à la planification (le modèle ne planifie rien : il n'y a encore personne à affecter) */
  suggestedFrequency: string;
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
const num = (
  id: string,
  label: string,
  unit: string,
  min: number | undefined,
  max: number | undefined,
  extra: Partial<ChecklistItem> = {},
) => ({ id, label, type: 'number', unit, min, max, required: true, ...extra }) as ChecklistItem;
const lot = (id: string, label: string): ChecklistItem => ({ id, label, type: 'lot', required: true });
const text = (id: string, label: string): ChecklistItem => ({ id, label, type: 'text', required: true });
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

/* ---------- Routines communes à tous les secteurs ---------- */

const START_OF_SHIFT: SectorRoutine = {
  title: 'Démarrage de poste',
  description: 'Vérifications de l’opérateur avant de produire : sécurité, poste, outillage.',
  durationMin: 10,
  defaultTime: '06:15',
  suggestedFrequency: 'À chaque prise de poste',
  tasks: [
    task('Sécurité', 3, {
      checks: [yes('epi', 'EPI portés'), ok('protections', 'Protections et arrêt d’urgence en place', { autoAnomaly: 'major' })],
    }),
    task('Poste de travail', 4, { checks: [ok('standard', 'Mode opératoire affiché et à jour'), ok('rangement', 'Poste rangé (5S)')] }),
    task('Outillage', 3, { checks: [ok('outils', 'Outils et moyens de contrôle présents et en bon état')] }),
  ],
};

const AUDIT_5S: SectorChecklist = {
  name: 'Audit 5S',
  description: 'Débarrasser, ranger, nettoyer, standardiser, respecter.',
  items: [
    ok('trier', 'Aucun objet inutile au poste'),
    ok('ranger', 'Chaque chose à sa place, emplacements identifiés'),
    ok('nettoyer', 'Poste et machine propres'),
    ok('standard', 'Standards visuels affichés et respectés'),
    ok('respecter', 'Actions du précédent audit soldées'),
  ],
};

const LPA_QUESTIONS: ChecklistItem[] = [
  yes('q1', 'Le mode opératoire affiché correspond à la référence produite', { commentOnFail: true }),
  yes('q2', 'Les EPI requis sont portés', { commentOnFail: true }),
  yes('q3', 'Les pièces non conformes sont isolées et identifiées', { commentOnFail: true }),
  yes('q4', 'Le contrôle de démarrage a été réalisé et enregistré', { commentOnFail: true }),
  yes('q5', 'Les moyens de contrôle sont étalonnés (étiquette valide)', { commentOnFail: true }),
  yes('q6', 'Les détrompeurs ont été vérifiés en début de poste', { commentOnFail: true }),
  yes('q7', 'L’opérateur connaît la réaction en cas de défaut', { commentOnFail: true }),
  yes('q8', 'Les actions du précédent audit sont soldées', { commentOnFail: true }),
];

const LAYERED_AUDIT: SectorRoutine = {
  title: 'Audit par couches',
  description:
    'Trois questions tirées à tour de rôle à chaque audit. Planifiez-la à chaque niveau : chef d’équipe, encadrement, direction.',
  durationMin: 10,
  defaultTime: '10:00',
  suggestedFrequency: 'Niveau 1 chaque jour, niveau 2 chaque semaine, niveau 3 chaque mois',
  tasks: [task('Questions d’audit', 10, { checks: LPA_QUESTIONS, sampleSize: 3 })],
};

const FIRST_ARTICLE = (checks: ChecklistItem[]): SectorRoutine => ({
  title: 'Validation du premier article',
  description: 'Après un réglage, un changement de série ou d’outil : la production ne démarre qu’avec une première pièce conforme.',
  durationMin: 15,
  defaultTime: '08:00',
  suggestedFrequency: 'Sur événement, au démarrage d’un ordre de fabrication',
  tasks: [
    task('Identifier la série', 3, { checks: [text('of', 'Référence produite'), lot('lot', 'Lot matière')] }),
    task('Mesurer la première pièce', 10, { checks }),
    task('Décider', 2, { checks: [ok('decision', 'Première pièce validée', { autoAnomaly: 'major', photo: 'optional' })] }),
  ],
});

/* ---------- Modèles ---------- */

export const SECTOR_TEMPLATES: Record<SectorKey, SectorTemplate> = {
  generic: {
    key: 'generic',
    label: 'Industrie (générique)',
    description: 'Une base neutre pour toute fabrication : démarrage de poste, 5S, audit par couches.',
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
        tasks: [task('Audit 5S', 15, { checklist: 'Audit 5S' }, 'medium')],
      },
      LAYERED_AUDIT,
    ],
    disabledModules: ['erp', 'bi', 'sequences'],
  },

  automotive: {
    key: 'automotive',
    label: 'Automobile et équipementiers',
    description: 'Audits par couches (IATF 16949, CQI-8), détrompeurs, premier article, 5S.',
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
        tasks: [
          ...START_OF_SHIFT.tasks,
          task('Détrompeurs', 4, {
            checks: [ok('detrompeur', 'Détrompeurs testés avec les pièces étalons', { autoAnomaly: 'critical', commentOnFail: true })],
          }),
        ],
      },
      FIRST_ARTICLE([
        num('cote1', 'Cote caractéristique 1 (à adapter)', 'mm', 24.95, 25.05, { autoAnomaly: 'major' }),
        ok('aspect', 'Aspect conforme'),
      ]),
      LAYERED_AUDIT,
    ],
    disabledModules: ['bi'],
  },

  plastics: {
    key: 'plastics',
    label: 'Plasturgie (injection)',
    description: 'Démarrage presse, changement de moule, contrôle horaire des pièces.',
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
        quality: ['Bavure', 'Retassure', 'Pièce incomplète', 'Brûlure ou trace', 'Cote hors tolérance'],
        equipment: ['Presse à l’arrêt', 'Moule bloqué', 'Fuite du circuit d’eau', 'Robot de dépose en défaut'],
        material: ['Matière non séchée', 'Rupture de matière', 'Colorant manquant', 'Mauvais lot matière'],
      },
      roleLabels: { ...DEFAULT_CATALOG.roleLabels, hancho: 'Régleur', line_leader: 'Chef d’atelier' },
    },
    checklists: [
      {
        name: 'Changement de moule',
        description: 'Montage et mise en route d’un moule.',
        items: [
          ok('moule', 'Moule propre, sans dommage, référence conforme à l’OF'),
          ok('bridage', 'Bridage contrôlé', { autoAnomaly: 'critical' }),
          ok('eau', 'Circuits d’eau raccordés, sans fuite'),
          ok('ejection', 'Éjection et noyaux testés à vide'),
          ok('securites', 'Sécurités presse actives'),
        ],
      },
      AUDIT_5S,
    ],
    routines: [
      {
        title: 'Démarrage presse',
        description: 'Paramètres et premières injections avant la production.',
        durationMin: 15,
        defaultTime: '06:15',
        suggestedFrequency: 'À chaque démarrage de presse',
        tasks: [
          task('Matière', 3, { checks: [lot('lot', 'Lot matière chargé'), yes('sechage', 'Temps de séchage respecté')] }),
          task('Paramètres', 6, {
            checks: [
              num('temp', 'Température moule (à adapter)', '°C', 40, 80, { autoAnomaly: 'major' }),
              num('cycle', 'Temps de cycle (à adapter)', 's', 20, 40),
            ],
          }),
          task('Premières injections', 6, { checks: [ok('aspect', 'Aspect des premières pièces conforme', { photo: 'optional' })] }),
        ],
      },
      {
        title: 'Changement de moule',
        description: 'Montage du moule puis validation des premières pièces.',
        durationMin: 30,
        defaultTime: '08:00',
        suggestedFrequency: 'Sur événement, au changement de moule',
        tasks: [
          task('Montage', 20, { checklist: 'Changement de moule' }),
          task('Validation', 10, { checks: [ok('premiere', 'Premières pièces validées', { autoAnomaly: 'major' })] }),
        ],
      },
      {
        title: 'Contrôle horaire des pièces',
        description: 'Prélèvement et contrôle d’une pièce toutes les heures.',
        durationMin: 5,
        defaultTime: '07:00',
        suggestedFrequency: 'Toutes les heures pendant la production',
        tasks: [
          task('Contrôle', 5, {
            checks: [ok('aspect', 'Aspect conforme'), num('poids', 'Poids de la pièce (à adapter)', 'g', 48, 52, { autoAnomaly: 'major' })],
          }),
        ],
      },
    ],
    disabledModules: ['bi', 'sequences'],
  },

  machining: {
    key: 'machining',
    label: 'Usinage et mécanique',
    description: 'Prise de poste machine, premier article après réglage, suivi des outils.',
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
        quality: ['Cote hors tolérance', 'État de surface non conforme', 'Bavure', 'Doute sur une mesure'],
        equipment: ['Machine en alarme', 'Outil cassé', 'Broche anormale', 'Moyen de mesure en défaut'],
      },
      roleLabels: { ...DEFAULT_CATALOG.roleLabels, hancho: 'Régleur', line_leader: 'Chef d’îlot' },
    },
    checklists: [AUDIT_5S],
    routines: [
      {
        title: 'Prise de poste machine',
        description: 'Sécurité, niveaux et état de la machine avant de produire.',
        durationMin: 10,
        defaultTime: '06:15',
        suggestedFrequency: 'À chaque prise de poste',
        tasks: [
          task('Sécurité', 4, {
            checks: [
              ok('au', 'Arrêt d’urgence testé', { autoAnomaly: 'critical' }),
              ok('protecteurs', 'Protecteurs et portes fonctionnels'),
            ],
          }),
          task('Machine', 6, {
            checks: [ok('niveaux', 'Niveaux huile et liquide de coupe corrects'), yes('alarmes', 'Aucune alarme active')],
          }),
        ],
      },
      FIRST_ARTICLE([
        text('programme', 'Programme utilisé'),
        text('plan', 'Indice du plan'),
        num('cote1', 'Cote caractéristique 1 (à adapter)', 'mm', 24.95, 25.05, { autoAnomaly: 'major' }),
        yes('etalonne', 'Moyen de mesure étalonné'),
      ]),
      {
        title: 'Suivi des outils',
        description: 'Durée de vie et usure des outils critiques.',
        durationMin: 5,
        defaultTime: '12:00',
        suggestedFrequency: 'Chaque jour',
        tasks: [
          task('Outils critiques', 5, { checks: [ok('usure', 'Usure des outils acceptable'), yes('correcteurs', 'Correcteurs à jour')] }),
        ],
      },
    ],
    disabledModules: ['bi', 'sequences'],
  },

  food: {
    key: 'food',
    label: 'Agroalimentaire',
    description: 'Hygiène avant démarrage, détecteur de métaux, températures, changement d’allergène (HACCP, IFS, BRCGS).',
    catalog: {
      productionStages: stages(
        ['reception', 'Réception'],
        ['preparation', 'Préparation'],
        ['cooking', 'Cuisson'],
        ['cooling', 'Refroidissement'],
        ['packaging', 'Conditionnement'],
        ['shipping', 'Expédition'],
      ),
      anomalyCategories: withCategories(['hygiene', 'Hygiène'], ['allergen', 'Allergènes'], ['foreign_body', 'Corps étranger']),
      andonPresets: {
        ...DEFAULT_CATALOG.andonPresets,
        quality: ['Corps étranger', 'Température hors limite', 'Emballage non étanche', 'Étiquetage erroné'],
        material: ['Rupture d’ingrédient', 'Emballage manquant', 'Lot non conforme reçu'],
      },
      roleLabels: { ...DEFAULT_CATALOG.roleLabels, hancho: 'Chef d’équipe', line_leader: 'Chef de ligne', quality: 'Qualité – hygiène' },
    },
    checklists: [
      {
        name: 'Hygiène avant démarrage',
        description: 'Inspection de la ligne avant toute production.',
        items: [
          ok('nettoyage', 'Ligne nettoyée et désinfectée', { photo: 'optional', autoAnomaly: 'major' }),
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
        tasks: [task('Inspection de la ligne', 15, { checklist: 'Hygiène avant démarrage' })],
      },
      {
        title: 'Test du détecteur de métaux',
        description: 'Passage des trois témoins avant production puis à intervalle régulier (CCP).',
        durationMin: 5,
        defaultTime: '06:00',
        suggestedFrequency: 'Avant production puis toutes les heures',
        tasks: [
          task('Témoins', 5, {
            checks: [
              ok('ferreux', 'Témoin ferreux détecté et éjecté', { autoAnomaly: 'critical' }),
              ok('nonferreux', 'Témoin non ferreux détecté et éjecté', { autoAnomaly: 'critical' }),
              ok('inox', 'Témoin inox détecté et éjecté', { autoAnomaly: 'critical' }),
            ],
          }),
        ],
      },
      {
        title: 'Relevé de températures',
        description: 'Points critiques de maîtrise : valeur, heure et auteur enregistrés.',
        durationMin: 5,
        defaultTime: '07:00',
        suggestedFrequency: 'Toutes les 2 heures',
        tasks: [
          task('Relevés', 5, {
            checks: [
              num('cuisson', 'Température à cœur en fin de cuisson', '°C', 72, 100, { autoAnomaly: 'critical', commentOnFail: true }),
              num('chambre', 'Chambre froide', '°C', 0, 4, { autoAnomaly: 'major', commentOnFail: true }),
            ],
          }),
        ],
      },
      {
        title: 'Changement d’allergène',
        description: 'Nettoyage validé entre deux productions aux allergènes différents.',
        durationMin: 20,
        defaultTime: '08:00',
        suggestedFrequency: 'Sur événement, au changement de produit',
        tasks: [
          task('Nettoyage', 15, {
            checks: [ok('nettoyage', 'Nettoyage allergène réalisé', { photo: 'required', autoAnomaly: 'critical' })],
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
    description: 'Contrôle ESD quotidien, suivi des composants sensibles à l’humidité (MSL), audit de ligne CMS.',
    catalog: {
      productionStages: stages(
        ['kitting', 'Préparation'],
        ['printing', 'Sérigraphie'],
        ['placement', 'Placement CMS'],
        ['reflow', 'Refusion'],
        ['aoi', 'Inspection optique'],
        ['tht', 'Insertion manuelle'],
        ['test', 'Test'],
        ['packaging', 'Conditionnement'],
      ),
      anomalyCategories: withCategories(['esd', 'ESD'], ['msl', 'Composants sensibles (MSL)']),
      andonPresets: {
        ...DEFAULT_CATALOG.andonPresets,
        quality: ['Pont de soudure', 'Composant manquant', 'Composant décalé', 'Défaut AOI à confirmer'],
        equipment: ['Placeuse en défaut', 'Four hors profil', 'Feeder bloqué', 'Bracelet ESD défaillant'],
      },
    },
    checklists: [AUDIT_5S],
    routines: [
      {
        title: 'Contrôle ESD quotidien',
        description: 'Bracelets, tapis et mises à la terre de la zone protégée.',
        durationMin: 5,
        defaultTime: '06:15',
        suggestedFrequency: 'À chaque prise de poste',
        tasks: [
          task('Protection ESD', 5, {
            checks: [
              ok('bracelet', 'Test du bracelet réussi', { autoAnomaly: 'major' }),
              num('tapis', 'Résistance du tapis à la terre', 'MΩ', 1, 1000, { commentOnFail: true }),
              ok('terre', 'Mises à la terre des postes raccordées'),
            ],
          }),
        ],
      },
      {
        title: 'Suivi des composants sensibles (MSL)',
        description: 'Durée hors emballage des composants sensibles à l’humidité.',
        durationMin: 5,
        defaultTime: '08:00',
        suggestedFrequency: 'À chaque ouverture d’un sac de composants',
        tasks: [
          task('Composant', 5, {
            checks: [lot('lot', 'Lot du composant'), num('heures', 'Durée hors emballage', 'h', 0, 168, { autoAnomaly: 'major' })],
          }),
        ],
      },
      LAYERED_AUDIT,
    ],
    disabledModules: ['bi'],
  },
};

export const SECTOR_KEYS = Object.keys(SECTOR_TEMPLATES) as SectorKey[];
