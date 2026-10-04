import type { Dataset } from '@/services/data/types';
import type { SectorKey } from '@/data/sectors';
import { COMMON_KNOWLEDGE, SECTOR_DEMO_CONTENT } from './sectorDemoContent';

/* Habillage de la démo d'un autre secteur que le câblage : tout le contenu propre au câblage
   (standards, actions, anomalies du jour, séquence, matières, mesures qualité, Gemba, passations,
   réunions, notifications, libellés des routines conservées) est remplacé par celui du secteur.
   Les identifiants et l'organisation (personnes, équipes, lignes, postes) ne changent pas. */

const NEUTRAL_LABELS: Record<string, string> = {
  'Composants et faisceaux de la série précédente retirés': 'Pièces et composants de la série précédente retirés',
  'Lot de connecteurs approvisionné': 'Lot de composants de la nouvelle série approvisionné',
  'Zones de coupe et d’assemblage inspectées': 'Zones de production inspectées',
  'Aucune chute de câble au sol': 'Aucun déchet ni chute au sol',
  'Contrôles LQC réalisés': 'Contrôles qualité réalisés',
  'Contrôles équipements (Hancho)': 'Contrôles équipements (chef d’équipe)',
  'Contrôle premier article (LQC)': 'Contrôle premier article',
  'Anomalies transmises au Line Leader': 'Anomalies transmises au responsable de ligne',
};
const neutral = (s: string) => NEUTRAL_LABELS[s] ?? s;

export function dressDemo(data: Dataset, sector: SectorKey): Dataset {
  const c = SECTOR_DEMO_CONTENT[sector];
  if (!c) return data;
  const wsById = new Map(data.workstations.map((w) => [w.id, w]));
  const lineName = (id?: string) => (id === 'line-b' ? 'Ligne B' : 'Ligne A');

  // Organisation : zones reprises des postes, équipe qualité
  data.users = data.users.map((u) => {
    const ws = u.workstationId ? wsById.get(u.workstationId) : undefined;
    if (u.teamId === 'team-lqc') return { ...u, zoneLabel: 'Contrôle qualité' };
    return ws ? { ...u, zoneLabel: `${lineName(ws.lineId)} — ${ws.process}` } : u;
  });
  data.teams = data.teams.map((t) => (t.id === 'team-lqc' ? { ...t, name: 'Équipe qualité' } : t));

  // Standards
  data.knowledgeItems = data.knowledgeItems.map((k) => {
    const text = c.knowledge[k.id] ?? COMMON_KNOWLEDGE[k.id];
    return text ? { ...k, title: text.title, summary: text.summary, keyPoints: text.points } : k;
  });

  // Checklists : celles qui ne servent plus à aucune routine sont retirées ; libellés neutres
  const usedChecklists = new Set(data.routineTemplates.flatMap((r) => r.tasks.map((t) => t.checklistId).filter(Boolean)));
  data.checklists = data.checklists
    .filter((cl) => usedChecklists.has(cl.id) || cl.id.startsWith('cl-sec-'))
    .map((cl) => ({ ...cl, items: cl.items.map((i) => ({ ...i, label: neutral(i.label) })) }));
  data.routineTemplates = data.routineTemplates.map((r) => ({
    ...r,
    tasks: r.tasks.map((t) => ({ ...t, title: neutral(t.title), checks: t.checks.map((i) => ({ ...i, label: neutral(i.label) })) })),
  }));

  // Actions et anomalies du jour
  data.actions = data.actions.map((a) => (c.actions[a.id] ? { ...a, title: c.actions[a.id]! } : a));
  const today = ['an-today-1', 'an-today-2', 'an-today-3'];
  data.anomalies = data.anomalies.map((a) => {
    const i = today.indexOf(a.id);
    return i >= 0 ? { ...a, description: c.todayAnomalies[i]! } : a;
  });

  // Séquences guidées
  data.sequenceTemplates = data.sequenceTemplates.map((s) => {
    if (s.id === 'sq-day')
      return { ...s, name: 'Journée type du responsable de ligne', steps: s.steps.map((st) => ({ ...st, title: neutral(st.title) })) };
    if (s.id !== 'sq-changeover') return s;
    return {
      ...s,
      name: c.changeover.name,
      description: c.changeover.description,
      steps: c.changeover.steps.map((st, i) => ({
        id: `sq-co-${i}`,
        title: st.title,
        ...(st.instruction ? { instruction: st.instruction } : {}),
        ...(st.validation ? { validation: st.validation } : {}),
        durationMin: st.minutes,
        active: true,
      })),
    };
  });

  // Matières
  data.materialStocks = data.materialStocks.map((m, i) => {
    const mat = c.materials[i];
    return mat ? { ...m, material: mat[0], unit: mat[1] } : m;
  });

  // Mesures qualité : même dispersion relative, sur les caractéristiques du secteur
  const originals = Array.from(new Set(data.qualityChecks.map((q) => q.characteristic)));
  data.qualityChecks = data.qualityChecks.map((q) => {
    const target = c.characteristics[originals.indexOf(q.characteristic)];
    if (!target) return q;
    const [name, unit, min, max, nominal] = target;
    const position = q.max === q.min ? 0.5 : (q.value - q.min) / (q.max - q.min);
    const value = Math.round((min + position * (max - min)) * 100) / 100;
    void nominal;
    return { ...q, characteristic: name, unit, min, max, value };
  });

  // Gemba
  data.gembaWalks = data.gembaWalks.map((g, i) => {
    const t = c.gemba[i];
    if (!t) return g;
    return {
      ...g,
      zone: t.zone,
      checklist: g.checklist.map((item) => (item.comment ? { ...item, comment: t.comment } : item)),
      observations: g.observations.map((o) => ({ ...o, finding: t.finding, improvement: t.improvement })),
    };
  });

  // Passations, réunions, notifications
  data.handovers = data.handovers.map((h, i) => (c.handovers[i] ? { ...h, note: c.handovers[i]! } : h));
  data.meetings = data.meetings.map((m) =>
    m.id === 'ev-training'
      ? { ...m, title: c.training }
      : m.minutes.includes('presse B')
        ? { ...m, minutes: m.minutes.replace('la presse B', 'un équipement de la ligne B') }
        : m,
  );
  const actionTitle = (id: string) => data.actions.find((a) => a.id === id)?.title;
  data.notifications = data.notifications.map((n) => {
    if (n.id === 'nt-1') return { ...n, title: `Nouvelle action : ${actionTitle('ac-today-1')}` };
    if (n.id === 'nt-4') return { ...n, title: `Commentaire sur « ${actionTitle('ac-task-2')} »` };
    if (n.id === 'nt-5') return { ...n, title: `Invitation : ${c.training} (demain 14:00)` };
    return n;
  });
  return data;
}
