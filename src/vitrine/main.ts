import '@fontsource-variable/inter/wght.css';
import '@/styles/tokens.css';
import './vitrine.css';

/* Vitrine : page statique. Le choix du secteur met à jour la capture, l'exemple de contrôle, les exigences
   du secteur et les liens vers la démo. Contenu repris des modèles de secteur (src/data/sectors.ts) et de
   leurs sources (référentiels cités dans chaque routine).
   Le bouton « Demander une présentation » n'apparaît que si une adresse de contact est configurée
   (VITE_CONTACT_EMAIL, publique par nature : elle figure dans la page). */

type Sector = 'automotive' | 'plastics' | 'machining' | 'food' | 'electronics' | 'generic';

interface SectorContent {
  title: string;
  shotAlt: string;
  proof: { check: string; value: string; meta: string; ref: string };
  /** [exigence (texte riche autorisé : <strong>), référence] */
  requirements: [string, string][];
}

const SECTORS: Record<Sector, SectorContent> = {
  automotive: {
    title: 'Automobile et équipementiers',
    shotAlt: 'Vue d’ensemble de la supervision d’un atelier automobile : état des lignes, indicateurs du jour et actions à traiter',
    proof: {
      check: 'Détrompeurs vérifiés avec les pièces témoins',
      value: 'Conforme',
      meta: '· Yann D. · 06:22',
      ref: 'IATF 16949 §10.2.4',
    },
    requirements: [
      ['<strong>Détrompeurs vérifiés en début de poste</strong>, par défaillance simulée avec des pièces témoins', 'IATF 16949 §10.2.4'],
      ['<strong>Audit par couches</strong> : niveau 1 chaque jour, niveau 2 chaque semaine, niveau 3 chaque mois', 'AIAG CQI-8'],
      ['<strong>Premier article</strong> déclenché au démarrage de chaque ordre de fabrication', 'Pratique du secteur'],
      ['<strong>5S et maintenance autonome</strong> : nettoyer pour inspecter, lubrifier, resserrer', 'TPM'],
    ],
  },
  plastics: {
    title: 'Plasturgie (injection)',
    shotAlt: 'Vue d’ensemble de la supervision d’un atelier d’injection plastique',
    proof: {
      check: 'Poids de la pièce : 50,3 g',
      value: 'Conforme',
      meta: '· tolérance 48 à 52 g · 09:00',
      ref: 'Fiche de réglage du moule',
    },
    requirements: [
      [
        '<strong>Démarrage presse</strong> : matière séchée, point de rosée du sécheur, paramètres de la fiche de réglage',
        'Fiches matière',
      ],
      [
        '<strong>Changement de moule</strong> : circuits d’eau repérés, force de fermeture, éjecteurs, 5 premières injections',
        'Pratique du secteur',
      ],
      [
        '<strong>Contrôle en cours de production</strong> : manque matière, bavure, retassure, poids, temps de cycle',
        'Plan de surveillance',
      ],
      [
        '<strong>Défauts au vocabulaire du métier</strong> dans les motifs d’Andon : bavure, retassure, brûlure, ligne de soudure',
        'Pratique du secteur',
      ],
    ],
  },
  machining: {
    title: 'Usinage et mécanique',
    shotAlt: 'Vue d’ensemble de la supervision d’un atelier d’usinage',
    proof: {
      check: 'Concentration du liquide de coupe : 3,8 %',
      value: 'Conforme',
      meta: '· tolérance 2,5 à 5 % · 06:20',
      ref: 'Fiche du fournisseur',
    },
    requirements: [
      [
        '<strong>Prise de poste machine</strong> : arrêt d’urgence, liquide de coupe au réfractomètre, chauffe de la broche',
        'Pratique du secteur',
      ],
      [
        '<strong>Premier article après réglage</strong> : programme, indice du plan, toutes les cotes, moyens étalonnés',
        'AS9102 en aéronautique',
      ],
      ['<strong>Suivi des outils</strong> : durées de vie préventives, usure en dépouille, correcteurs à jour', 'Pratique du secteur'],
      [
        '<strong>Défauts au vocabulaire du métier</strong> : cote hors tolérance, broutement, état de surface, bavure',
        'Pratique du secteur',
      ],
    ],
  },
  food: {
    title: 'Agroalimentaire',
    shotAlt: 'Vue d’ensemble de la supervision d’un atelier de plats cuisinés',
    proof: {
      check: 'Chambre froide des produits finis : 1,8 °C',
      value: 'Conforme',
      meta: '· 0 à +3 °C · 10:00',
      ref: 'Arrêté du 21 décembre 2009',
    },
    requirements: [
      [
        '<strong>Détecteur de métaux</strong> : témoins ferreux, non ferreux et inox passés dans le produit ; arrêt en cas d’échec',
        'BRCGS',
      ],
      ['<strong>Refroidissement</strong> de +63 °C à +10 °C en 2 heures au plus, conservation entre 0 et +3 °C', 'Arrêté du 21/12/2009'],
      ['<strong>Changement d’allergène</strong> : nettoyage vérifié avant de libérer la ligne, 14 allergènes', 'Règlement (UE) 1169/2011'],
      ['<strong>Poids des préemballages</strong> contrôlé selon l’erreur maximale tolérée', 'Directive 76/211/CEE'],
    ],
  },
  electronics: {
    title: 'Électronique',
    shotAlt: 'Vue d’ensemble de la supervision d’un atelier d’assemblage électronique',
    proof: {
      check: 'Test du bracelet antistatique',
      value: 'Conforme',
      meta: '· système inférieur à 35 MΩ · 06:18',
      ref: 'ANSI/ESD S20.20',
    },
    requirements: [
      ['<strong>Contrôle ESD quotidien</strong> : bracelet inférieur à 35 MΩ, plan de travail inférieur à 10⁹ Ω', 'ANSI/ESD S20.20'],
      [
        '<strong>Composants sensibles à l’humidité</strong> : durée hors emballage selon le niveau MSL, étuvage au-delà',
        'IPC/JEDEC J-STD-033',
      ],
      ['<strong>Pâte à braser</strong> : stockage au froid, remise à température avant ouverture', 'Fabricants de pâte'],
      [
        '<strong>Défauts de brasage</strong> dans les motifs d’Andon : pont de soudure, effet Manhattan, manque de brasure',
        'Pratique du secteur',
      ],
    ],
  },
  generic: {
    title: 'Autre industrie',
    shotAlt: 'Vue d’ensemble de la supervision d’un atelier de démonstration',
    proof: {
      check: 'Protections machine et arrêt d’urgence en place',
      value: 'Conforme',
      meta: '· Nadia R. · 06:15',
      ref: 'Démarrage de poste',
    },
    requirements: [
      [
        '<strong>Démarrage de poste</strong> : équipements de protection, protections machine, mode opératoire, outillage',
        'Pratique courante',
      ],
      ['<strong>Audit 5S</strong> : trier, ranger, nettoyer, standardiser, maintenir', 'Lean'],
      ['<strong>Maintenance autonome</strong> : nettoyer pour inspecter, lubrifier, resserrer', 'TPM'],
      ['<strong>Audit par couches</strong> avec questions tournantes', 'AIAG CQI-8'],
    ],
  },
};

const isSector = (v: string | undefined): v is Sector => Boolean(v && v in SECTORS);

function select(sector: Sector, focusTab?: HTMLButtonElement) {
  const c = SECTORS[sector];
  for (const tab of document.querySelectorAll<HTMLButtonElement>('[role="tab"][data-sector]')) {
    const on = tab.dataset.sector === sector;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
  }
  focusTab?.focus();

  const shot = document.querySelector<HTMLImageElement>('[data-hero-shot]');
  if (shot) {
    shot.src = `./vitrine/supervision-${sector}.jpg`;
    shot.alt = c.shotAlt;
  }
  const set = (selector: string, text: string) => {
    const el = document.querySelector(selector);
    if (el) el.textContent = text;
  };
  set('[data-proof-check]', c.proof.check);
  set('[data-proof-value]', c.proof.value);
  set('[data-proof-meta]', c.proof.meta);
  set('[data-proof-ref]', c.proof.ref);
  set('[data-sector-title]', c.title);

  const list = document.querySelector('[data-sector-list]');
  if (list) {
    list.replaceChildren(
      ...c.requirements.map(([text, ref]) => {
        const li = document.createElement('li');
        li.innerHTML = text; // contenu statique de ce fichier (aucune donnée externe)
        const span = document.createElement('span');
        span.className = 'ref';
        span.textContent = ref;
        li.append(span);
        return li;
      }),
    );
  }
  // Tous les liens vers la démo ouvrent le secteur choisi
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[data-demo-link]')) link.href = `./app/?secteur=${sector}`;
}

for (const tablist of document.querySelectorAll<HTMLElement>('[role="tablist"]')) {
  const tabs = [...tablist.querySelectorAll<HTMLButtonElement>('[role="tab"][data-sector]')];
  tablist.addEventListener('click', (e) => {
    const tab = (e.target as HTMLElement).closest<HTMLButtonElement>('[role="tab"][data-sector]');
    if (tab && isSector(tab.dataset.sector)) select(tab.dataset.sector);
  });
  // Clavier : flèches, début, fin (motif des onglets accessibles)
  tablist.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const next =
      e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const tab = tabs[(next + tabs.length) % tabs.length]!;
    if (isSector(tab.dataset.sector)) select(tab.dataset.sector, tab);
  });
}

// Secteur déjà choisi pour la démo dans ce navigateur : repris à l'ouverture de la page
try {
  const saved = localStorage.getItem('ra:demo-sector') ?? undefined;
  if (isSector(saved)) select(saved);
} catch {
  /* stockage indisponible : secteur par défaut */
}

const email = (import.meta.env.VITE_CONTACT_EMAIL as string | undefined)?.trim();
if (email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  const subject = encodeURIComponent('Présentation de Routine');
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[data-contact]')) {
    link.href = `mailto:${email}?subject=${subject}`;
    link.hidden = false;
  }
}
