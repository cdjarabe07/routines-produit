import type { Tone } from '@/components/ui/Badge';
import type { Action, GembaChecklistEntry, GembaObservation, GembaStatus, GembaWalk } from '@/types/domain';
import { isOpenAction } from '@/features/actions/model';
import { createId } from '@/utils/id';

export const GEMBA_STATUS: Record<GembaStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Brouillon', tone: 'neutral' },
  validated: { label: 'Validée', tone: 'info' },
  closed: { label: 'Clôturée', tone: 'success' },
};

/** Checklist par défaut, reprise du prototype. */
export const DEFAULT_GEMBA_CHECKLIST = [
  'Sécurité et EPI au poste',
  '5S : rangement, nettoyage, marquage au sol',
  'Respect du standard / mode opératoire',
  'Flux des matières et déplacements',
  'Qualité : autocontrôle et premier article',
  'Sécurité machine et ergonomie',
  'Compétences et polyvalence de l’équipe',
  'Performance : cadence et micro-arrêts',
];

export const newChecklist = (): GembaChecklistEntry[] => DEFAULT_GEMBA_CHECKLIST.map((label) => ({ id: createId(), label }));

/** Erreurs bloquantes pour valider une marche (le brouillon, lui, peut être incomplet). */
export function validationErrors(walk: Pick<GembaWalk, 'zone' | 'checklist' | 'observations'>): string[] {
  const errors: string[] = [];
  if (!walk.zone.trim()) errors.push('Indiquez la zone observée.');
  if (walk.checklist.every((c) => !c.result)) errors.push('Renseignez au moins un point de la checklist.');
  const koWithoutComment = walk.checklist.filter((c) => c.result === 'ko' && !c.comment?.trim());
  if (koWithoutComment.length) errors.push(`Commentaire obligatoire pour ${koWithoutComment.length} point(s) non conforme(s).`);
  const incomplete = walk.observations.filter((o) => !o.finding.trim());
  if (incomplete.length) errors.push('Chaque observation doit décrire le constat.');
  return errors;
}

export const koItems = (walk: Pick<GembaWalk, 'checklist'>) => walk.checklist.filter((c) => c.result === 'ko');

/** Une observation majeure ou critique appelle une action corrective. */
export const suggestsAction = (o: GembaObservation) => o.severity !== 'minor';

export function canClose(walk: GembaWalk, actions: Action[]): { ok: boolean; openActions: number } {
  const linked = actions.filter((a) => a.source.type === 'gemba' && a.source.id === walk.id);
  const openActions = linked.filter(isOpenAction).length;
  return { ok: walk.status === 'validated' && openActions === 0, openActions };
}
