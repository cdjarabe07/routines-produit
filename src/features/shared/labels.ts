import type { Tone } from '@/components/ui/Badge';
import type {
  ActionSourceType, ActionStatus, AnomalyCategory, AnomalyStatus, KnowledgeCategory, Priority, ProductionStage,
  ProductionStatus, Severity, Shift,
} from '@/types/domain';

/* Libellés et tons partagés entre modules. Un seul endroit pour la terminologie. */

export const PRIORITY: Record<Priority, { label: string; tone: Tone; rank: number }> = {
  critical: { label: 'Critique', tone: 'danger', rank: 0 },
  high: { label: 'Haute', tone: 'warning', rank: 1 },
  medium: { label: 'Moyenne', tone: 'info', rank: 2 },
  low: { label: 'Basse', tone: 'neutral', rank: 3 },
};

export const SEVERITY: Record<Severity, { label: string; tone: Tone; rank: number }> = {
  critical: { label: 'Critique', tone: 'danger', rank: 0 },
  major: { label: 'Majeure', tone: 'warning', rank: 1 },
  minor: { label: 'Mineure', tone: 'neutral', rank: 2 },
};

export const ACTION_STATUS: Record<ActionStatus, { label: string; tone: Tone }> = {
  todo: { label: 'À faire', tone: 'neutral' },
  in_progress: { label: 'En cours', tone: 'info' },
  done: { label: 'Terminée', tone: 'success' },
  cancelled: { label: 'Annulée', tone: 'neutral' },
};

export const ACTION_SOURCE: Record<ActionSourceType, string> = {
  manual: 'Saisie manuelle',
  meeting: 'Réunion',
  anomaly: 'Anomalie',
  gemba: 'Gemba Walk',
  routine: 'Routine',
  andon: 'Andon',
  quality: 'Contrôle LQC',
};

export const ANOMALY_CATEGORY: Record<AnomalyCategory, string> = {
  safety: 'Sécurité',
  quality: 'Qualité',
  '5s': '5S',
  standard: 'Standard',
  performance: 'Performance',
  equipment: 'Équipement',
  material: 'Matière',
  other: 'Autre',
};

export const ANOMALY_STATUS: Record<AnomalyStatus, { label: string; tone: Tone }> = {
  open: { label: 'Ouverte', tone: 'warning' },
  in_progress: { label: 'En traitement', tone: 'info' },
  closed: { label: 'Clôturée', tone: 'success' },
};

export const KNOWLEDGE_CATEGORY: Record<KnowledgeCategory, string> = {
  safety: 'Sécurité',
  '5s': '5S',
  standard: 'Standard',
  quality: 'Qualité',
  performance: 'Performance',
  production: 'Production',
  material: 'Matière',
};

export const SHIFT: Record<Shift, string> = {
  morning: 'Équipe du matin',
  afternoon: 'Équipe d’après-midi',
  night: 'Équipe de nuit',
};

export const PRODUCTION_STAGE: Record<ProductionStage, string> = {
  cutting: 'Coupe',
  crimping: 'Sertissage',
  assembly: 'Assemblage',
  taping: 'Rubanage',
  electrical_test: 'Test électrique',
  inspection: 'Contrôle',
  shipping: 'Expédition',
};

export const PRODUCTION_STAGES: ProductionStage[] = ['cutting', 'crimping', 'assembly', 'taping', 'electrical_test', 'inspection', 'shipping'];

export const PRODUCTION_STATUS: Record<ProductionStatus, { label: string; tone: Tone }> = {
  planned: { label: 'Planifié', tone: 'neutral' },
  in_progress: { label: 'En cours', tone: 'info' },
  blocked: { label: 'Bloqué', tone: 'danger' },
  done: { label: 'Terminé', tone: 'success' },
};

export const options = <K extends string>(map: Record<K, string | { label: string }>) =>
  (Object.keys(map) as K[]).map((value) => {
    const v = map[value];
    return { value, label: typeof v === 'string' ? v : v.label };
  });
