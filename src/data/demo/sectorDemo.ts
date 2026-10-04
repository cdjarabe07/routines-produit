import type { SectorKey } from '@/data/sectors';

/* Habillage de l'atelier de démonstration par secteur (vitrine : « démo au choix du secteur »).
   Même organisation (2 lignes, 8 postes, mêmes personnes), mais vocabulaire, postes, produits et exemples
   propres au secteur. « automotive » garde l'atelier de câblage d'origine. */

export interface SectorDemo {
  plantName: string;
  lines: [string, string];
  /** 8 postes, dans l'ordre de DEMO_WORKSTATIONS : [nom, procédé] */
  workstations: [string, string][];
  /** 8 références produites, dans l'ordre des ordres de fabrication */
  products: string[];
  blockedReason: string;
  /** Exemples d'anomalies : [catégorie, description] */
  anomalies: [string, string][];
}

export const SECTOR_DEMO: Partial<Record<SectorKey, SectorDemo>> = {
  generic: {
    plantName: 'Atelier de démonstration',
    lines: ['Produits standard', 'Produits sur mesure'],
    workstations: [
      ['Poste 1 — Préparation', 'Préparation'],
      ['Poste 2 — Fabrication', 'Fabrication'],
      ['Poste 3 — Assemblage', 'Assemblage'],
      ['Poste 4 — Finition', 'Finition'],
      ['Poste 8 — Fabrication ligne B', 'Fabrication'],
      ['Poste 5 — Essais', 'Essais'],
      ['Poste 6 — Contrôle qualité', 'Contrôle'],
      ['Poste 7 — Conditionnement', 'Conditionnement'],
    ],
    products: ['ART-100', 'ART-110', 'ART-120', 'ART-130', 'ART-100', 'SPE-200', 'SPE-210', 'SPE-220'],
    blockedReason: 'Rupture de composant au poste 1',
    anomalies: [
      ['quality', 'Pièce non conforme détectée en contrôle final'],
      ['safety', 'Carter de protection mal refermé au poste 2'],
      ['5s', 'Outils non rangés en fin de poste'],
      ['equipment', 'Bruit anormal sur la machine du poste 2'],
      ['material', 'Composant manquant au bord de ligne'],
      ['standard', 'Mode opératoire non à jour au poste 3'],
    ],
  },
  plastics: {
    plantName: 'Atelier d’injection plastique',
    lines: ['Presses 50 à 200 t', 'Presses 300 à 500 t'],
    workstations: [
      ['Presse 1 — 80 t', 'Injection'],
      ['Presse 2 — 120 t', 'Injection'],
      ['Poste 3 — Assemblage clips', 'Assemblage'],
      ['Poste 4 — Ébavurage', 'Reprise'],
      ['Presse 8 — 350 t', 'Injection'],
      ['Étuve 5 — Séchage matière', 'Séchage'],
      ['Poste 6 — Contrôle qualité', 'Contrôle'],
      ['Poste 7 — Conditionnement', 'Conditionnement'],
    ],
    products: [
      'BOITIER-PP-12',
      'CAPOT-ABS-04',
      'CLIP-PA6-20',
      'GRILLE-PP-08',
      'BOITIER-PP-12',
      'PARE-CHOC-PP-01',
      'BAC-PEHD-30',
      'CONSOLE-ABS-02',
    ],
    blockedReason: 'Moule bloqué sur la presse 1',
    anomalies: [
      ['quality', 'Retassures sur le capot ABS, empreinte 2'],
      ['quality', 'Bavures en plan de joint sur le boîtier'],
      ['equipment', 'Fuite d’eau sur le circuit de refroidissement du moule'],
      ['material', 'Matière PA6 insuffisamment séchée'],
      ['safety', 'Barrière immatérielle de la presse 8 neutralisée'],
      ['5s', 'Carottes et purges non évacuées au pied de presse'],
    ],
  },
  machining: {
    plantName: 'Atelier d’usinage',
    lines: ['Îlot tournage', 'Îlot fraisage'],
    workstations: [
      ['Tour CN 1', 'Tournage'],
      ['Tour CN 2', 'Tournage'],
      ['Poste 3 — Ébavurage', 'Ébavurage'],
      ['Rectifieuse 4', 'Rectification'],
      ['Centre d’usinage 8', 'Fraisage'],
      ['Centre d’usinage 5', 'Fraisage'],
      ['Poste 6 — Métrologie', 'Contrôle'],
      ['Poste 7 — Expédition', 'Expédition'],
    ],
    products: [
      'AXE-42CD4-120',
      'BAGUE-BRZ-35',
      'ARBRE-C45-300',
      'ENTRETOISE-AL-20',
      'AXE-42CD4-120',
      'BRIDE-INOX-80',
      'CARTER-AL-150',
      'PLATINE-S235-10',
    ],
    blockedReason: 'Outil cassé sur le tour CN 1',
    anomalies: [
      ['quality', 'Diamètre hors tolérance sur l’axe, série 3'],
      ['quality', 'État de surface non conforme après rectification'],
      ['equipment', 'Alarme broche sur le centre d’usinage 5'],
      ['material', 'Barres de 42CD4 manquantes'],
      ['safety', 'Porte du tour CN 2 ouverte en cycle'],
      ['standard', 'Programme utilisé différent de l’indice du plan'],
    ],
  },
  food: {
    plantName: 'Atelier de plats cuisinés',
    lines: ['Ligne cuisson', 'Ligne conditionnement'],
    workstations: [
      ['Poste 1 — Préparation', 'Préparation'],
      ['Poste 2 — Cuisson', 'Cuisson'],
      ['Poste 3 — Refroidissement', 'Refroidissement'],
      ['Poste 4 — Dosage', 'Dosage'],
      ['Poste 8 — Operculage', 'Conditionnement'],
      ['Poste 5 — Détecteur de métaux', 'Contrôle'],
      ['Poste 6 — Laboratoire qualité', 'Contrôle'],
      ['Poste 7 — Expédition froid', 'Expédition'],
    ],
    products: ['LASAGNE-400G', 'HACHIS-350G', 'RISOTTO-300G', 'CURRY-350G', 'LASAGNE-400G', 'SALADE-250G', 'TABOULE-300G', 'GRATIN-400G'],
    blockedReason: 'Rupture de barquettes au poste 4',
    anomalies: [
      ['foreign_body', 'Fragment plastique trouvé dans une barquette'],
      ['hygiene', 'Nettoyage du doseur incomplet avant démarrage'],
      ['allergen', 'Étiquette allergène non conforme sur un lot'],
      ['quality', 'Température à cœur insuffisante sur une fournée'],
      ['equipment', 'Détecteur de métaux en défaut au test du témoin inox'],
      ['safety', 'Sol glissant en zone de cuisson'],
    ],
  },
  electronics: {
    plantName: 'Atelier d’assemblage électronique',
    lines: ['Ligne CMS', 'Ligne finale'],
    workstations: [
      ['Poste 1 — Sérigraphie', 'Sérigraphie'],
      ['Poste 2 — Placeuse', 'Placement'],
      ['Poste 3 — Four de refusion', 'Refusion'],
      ['Poste 4 — Inspection optique', 'Inspection'],
      ['Poste 8 — Insertion manuelle', 'Insertion'],
      ['Poste 5 — Test in situ', 'Test'],
      ['Poste 6 — Contrôle qualité', 'Contrôle'],
      ['Poste 7 — Conditionnement', 'Conditionnement'],
    ],
    products: [
      'CARTE-CTRL-V3',
      'CARTE-PUIS-V2',
      'CARTE-COM-V5',
      'CARTE-CTRL-V3',
      'CARTE-CAPT-V1',
      'MODULE-IHM-V4',
      'CARTE-ALIM-V2',
      'MODULE-RF-V1',
    ],
    blockedReason: 'Feeder bloqué sur la placeuse',
    anomalies: [
      ['quality', 'Ponts de soudure détectés en inspection optique'],
      ['esd', 'Bracelet antistatique défaillant au poste 5'],
      ['msl', 'Composants sensibles hors emballage depuis plus de 168 h'],
      ['equipment', 'Profil du four de refusion hors tolérance'],
      ['quality', 'Composant décalé sur la carte de contrôle'],
      ['5s', 'Bobines de composants non identifiées en bord de ligne'],
    ],
  },
};
