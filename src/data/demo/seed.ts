/* Générateur du jeu initial de l'environnement simulé (docs/current-state.md §6).
   - Personnes et contenus d'illustration, datés par rapport à « maintenant ».
   - Générateur pseudo-aléatoire à graine fixe : le jeu est reproductible.
   - Les exécutions de routines suivent les planifications (même règle que l'application : occursOn). */

import type {
  Action,
  AndonAlert,
  AndonType,
  Anomaly,
  AnomalyStatus,
  BaseEntity,
  Checklist,
  ChecklistItem,
  CheckResult,
  CheckValue,
  DateKey,
  ItemResult,
  KnowledgeItem,
  MaterialStock,
  Meeting,
  Priority,
  ProductionOrder,
  QualityCheck,
  RoutineRun,
  RoutineTask,
  RoutineTemplate,
  Schedule,
  Severity,
  Team,
  User,
  Workstation,
} from '@/types/domain';
import type { Dataset } from '@/services/data/types';
import { occursOn } from '@/features/planning/model';
import { checkKey, evaluateCheck } from '@/features/routines/model';
import { addDays, atTime, isoWeekday, toDateKey } from '@/utils/date';
import {
  DEMO_ANOMALY_SAMPLES,
  DEMO_AUDIT_SECTIONS,
  DEMO_CHECKLISTS,
  DEMO_KNOWLEDGE,
  DEMO_ROUTINES,
  DEMO_SEQUENCE_STEPS,
  DEMO_TEAMS,
  DEMO_USERS,
  DEMO_WORKSTATIONS,
  type DemoCheck,
  type DemoRoutine,
} from './reference';

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HISTORY_DAYS = 30;

/** prénom.nom@atelier.local, sans accents */
const emailOf = (name: string) => `${name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, '.')}@atelier.local`;

export function buildDemoData(now: Date = new Date()): Dataset {
  const rnd = mulberry32(20260929);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)] as T;
  const chance = (p: number) => rnd() < p;
  const today = toDateKey(now);
  const nowIso = now.toISOString();
  const nowMs = now.getTime();

  /** Horodatage à une heure donnée, jamais dans le futur. */
  const at = (day: DateKey, time: string, offsetMin = 0) => {
    const ms = new Date(atTime(day, time)).getTime() + offsetMin * 60_000;
    return new Date(Math.min(ms, nowMs - 60_000)).toISOString();
  };
  const minutesAgo = (m: number) => new Date(nowMs - m * 60_000).toISOString();
  const stamp = <T extends object>(o: T, created = nowIso): T & Pick<BaseEntity, 'createdAt' | 'updatedAt'> => ({
    ...o,
    createdAt: created,
    updatedAt: created,
  });
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}-${(++seq).toString(36)}`;

  /* ---------- Organisation ---------- */
  const lines = [
    stamp({ id: 'line-a', code: 'A', name: 'Ligne A', description: 'Faisceaux portes' }),
    stamp({ id: 'line-b', code: 'B', name: 'Ligne B', description: 'Faisceaux moteur' }),
  ];
  const lineId = (l?: 'A' | 'B') => (l === 'B' ? 'line-b' : l === 'A' ? 'line-a' : undefined);

  const teams: Team[] = DEMO_TEAMS.map((t) =>
    stamp(
      { id: t.id, name: t.name, shift: t.shift, lineId: lineId(t.line), leaderId: t.leader, active: true },
      `${addDays(today, -90)}T08:00:00.000Z`,
    ),
  );

  const users: User[] = DEMO_USERS.map((u) =>
    stamp({
      id: u.id,
      name: u.name,
      role: u.role,
      email: emailOf(u.name),
      lineId: lineId(u.line),
      zoneLabel: u.zone,
      shift: u.shift,
      teamId: u.team,
      workstationId: u.ws,
      active: true,
      lastSignInAt: u.id === 'u-marc' ? minutesAgo(60 * 24 * 2) : minutesAgo(30 + Math.floor(rnd() * 400)),
    }),
  );

  const workstations: Workstation[] = DEMO_WORKSTATIONS.map((w) =>
    stamp({ id: w.id, code: w.code, name: w.name, process: w.process, lineId: lineId(w.line)!, mapX: w.x, mapY: w.y, active: true }),
  );
  const wsIds = workstations.map((w) => w.id);

  const leaves = [
    stamp({ id: 'lv-1', userId: 'u-marc', from: addDays(today, -1), to: addDays(today, 3), reason: 'Congés payés' }),
    stamp({ id: 'lv-2', userId: 'u-hina', from: addDays(today, 15), to: addDays(today, 18), reason: 'Congés payés' }),
  ];
  const presence = [
    stamp({ id: 'pr-1', userId: 'u-tom', date: today, status: 'absent' as const, recordedBy: 'u-karim' }),
    ...['u-karim', 'u-yann', 'u-lucia', 'u-aicha', 'u-nadia', 'u-ibrahim'].map((userId, i) =>
      stamp({ id: `pr-p${i}`, userId, date: today, status: 'present' as const, recordedBy: 'u-karim' }),
    ),
  ];

  /* ---------- Connaissances (contenus initiaux, à valider) ---------- */
  const knowledgeItems: KnowledgeItem[] = [
    ...DEMO_KNOWLEDGE.map((k) =>
      stamp(
        {
          id: k.id,
          code: k.code,
          title: k.title,
          category: k.category,
          kind: 'standard' as const,
          summary: k.summary,
          keyPoints: k.points,
          version: '1.0',
          owner: 'Service Méthodes',
          status: 'published' as const,
          toReview: true,
        },
        addDays(today, -60) + 'T08:00:00.000Z',
      ),
    ),
  ];

  /* ---------- Checklists, routines, planification ---------- */
  const configured = `${addDays(today, -HISTORY_DAYS - 5)}T08:00:00.000Z`;
  const toItem = (c: DemoCheck): ChecklistItem => ({
    id: c.id,
    label: c.label,
    type: c.type,
    required: c.required ?? false,
    unit: c.unit,
    min: c.min,
    max: c.max,
    options: c.options,
  });
  const nominal = new Map<string, number>();
  for (const c of DEMO_CHECKLISTS.flatMap((l) => l.items)) if (c.nominal !== undefined) nominal.set(c.id, c.nominal);
  for (const c of DEMO_ROUTINES.flatMap((r) => r.tasks.flatMap((t) => t.checks ?? [])))
    if (c.nominal !== undefined) nominal.set(c.id, c.nominal);

  const checklists: Checklist[] = DEMO_CHECKLISTS.map((c) =>
    stamp({ id: c.id, name: c.name, description: c.description, active: true, items: c.items.map(toItem) }, configured),
  );
  const checklistById = new Map(checklists.map((c) => [c.id, c]));

  const audit: DemoRoutine = {
    id: 'rt-ll-audit',
    title: 'Audit terrain',
    description: 'Tour de ligne structuré en 7 thèmes. Un point non conforme permet de déclarer une anomalie.',
    time: '09:00',
    durationMin: 45,
    line: 'A',
    tasks: DEMO_AUDIT_SECTIONS.map((s) => ({
      title: s.title,
      min: 6,
      required: true,
      checks: s.items.map((label, i) => ({ id: `p${i}`, label, type: 'conformity' as const, required: true })),
    })),
    schedules: [{ id: 'sc-ll-audit', recurrence: 'weekdays', assignee: 'u-karim' }],
  };
  const demoRoutines = [...DEMO_ROUTINES, audit];

  const routineTemplates: RoutineTemplate[] = demoRoutines.map((r) =>
    stamp(
      {
        id: r.id,
        title: r.title,
        description: r.description,
        durationMin: r.durationMin,
        defaultTime: r.time,
        lineId: lineId(r.line),
        workstationId: r.ws,
        active: true,
        tasks: r.tasks.map((t, i): RoutineTask => ({
          id: `${r.id}-t${i}`,
          title: t.title,
          instructions: t.instructions,
          estimatedMin: t.min,
          priority: t.priority ?? 'medium',
          required: t.required ?? true,
          knowledgeId: t.kb,
          checklistId: t.checklist,
          checks: (t.checks ?? []).map(toItem),
        })),
      },
      configured,
    ),
  );

  const schedules: Schedule[] = demoRoutines.flatMap((r) =>
    r.schedules.map((s) =>
      stamp(
        {
          id: s.id,
          routineId: r.id,
          startDate: addDays(today, -HISTORY_DAYS),
          time: s.time ?? r.time,
          recurrence: s.recurrence,
          weekdays: s.weekdays ?? [],
          assigneeId: s.assignee,
          teamId: s.team,
          lineId: lineId(r.line),
          workstationId: r.ws,
          status: 'active' as const,
          skippedDates: [],
          createdBy: 'u-admin',
        },
        configured,
      ),
    ),
  );

  /** Qui exécute une occurrence affectée à une équipe (le plus souvent la même personne). */
  const TEAM_EXECUTORS: Record<string, [string, string]> = {
    'team-a': ['u-nadia', 'u-yann'],
    'team-b': ['u-ibrahim', 'u-lucia'],
    'team-lqc': ['u-aicha', 'u-tom'],
  };
  /** Occurrences du jour laissées à faire, et une laissée en cours, pour que chaque profil ait du travail en attente. */
  const LEFT_TODO_TODAY = new Set(['sc-op-start-a', 'sc-ll-audit', 'sc-q-conn']);
  const LEFT_IN_PROGRESS_TODAY = 'sc-ll-safety';

  const valueFor = (item: ChecklistItem): CheckValue => {
    switch (item.type) {
      case 'conformity':
        return chance(0.04) ? 'ko' : 'ok';
      case 'yes_no':
        return !chance(0.04);
      case 'number': {
        const n = nominal.get(item.id) ?? ((item.min ?? 0) + (item.max ?? 0)) / 2;
        const spread = ((item.max ?? n * 1.1) - (item.min ?? n * 0.9)) / 4;
        return Math.round((n + (rnd() - 0.5) * 2 * spread * (chance(0.05) ? 3 : 1)) * 100) / 100;
      }
      case 'select':
        return item.options?.[0] ?? '';
      default:
        return item.id === 'ref' ? pick(['FX-PORTE-AVD-12', 'FX-PORTE-ARG-08', 'FX-MOTEUR-1.5-A']) : pick(['Indice C', 'Indice D']);
    }
  };

  const routineRuns: RoutineRun[] = [];
  const templateById = new Map(routineTemplates.map((t) => [t.id, t]));
  for (let d = HISTORY_DAYS - 1; d >= 0; d--) {
    const day = addDays(today, -d);
    for (const s of schedules) {
      if (!occursOn(s, day)) continue;
      const routine = templateById.get(s.routineId)!;
      const due = new Date(atTime(day, s.time)).getTime();
      let complete: boolean;
      if (d === 0) {
        // Aujourd'hui : rien avant l'heure prévue + 25 min ; quelques occurrences laissées à faire
        if (nowMs - due < 25 * 60_000 || LEFT_TODO_TODAY.has(s.id)) continue;
        complete = s.id !== LEFT_IN_PROGRESS_TODAY;
      } else {
        if (chance(0.07)) continue; // non réalisée
        complete = !chance(0.1);
      }
      const executors = s.teamId ? TEAM_EXECUTORS[s.teamId] : undefined;
      const by = s.assigneeId ?? (executors ? (chance(0.8) ? executors[0] : executors[1]) : 'u-karim');
      let cursor = Math.floor(rnd() * 15);
      const startedAt = at(day, s.time, cursor);
      const results: Record<string, ItemResult> = {};
      routine.tasks.forEach((task, ti) => {
        if (!complete && ti >= Math.ceil(routine.tasks.length / 2)) return;
        if (!task.required && chance(0.3)) return;
        const checks = [...(task.checklistId ? (checklistById.get(task.checklistId)?.items ?? []) : []), ...task.checks];
        const step = Math.max(1, Math.round((task.estimatedMin ?? 4) / Math.max(1, checks.length)));
        if (checks.length === 0) {
          cursor += step + Math.floor(rnd() * 3);
          const status: CheckResult = chance(0.04) ? 'ko' : 'ok';
          results[task.id] = {
            status,
            at: at(day, s.time, cursor),
            by,
            comment: status === 'ko' ? 'Écart constaté, traité avec l’équipe' : undefined,
          };
          return;
        }
        for (const item of checks) {
          cursor += step;
          const value = valueFor(item);
          const status = evaluateCheck(item, value);
          results[checkKey(task.id, item.id)] = {
            status,
            value: item.type === 'conformity' ? undefined : value,
            at: at(day, s.time, cursor),
            by,
          };
        }
      });
      if (Object.keys(results).length === 0) continue;
      const completedAt = complete ? at(day, s.time, cursor + 1) : undefined;
      routineRuns.push(
        stamp(
          {
            id: nextId('run'),
            scheduleId: s.id,
            templateId: routine.id,
            date: day,
            assigneeId: by,
            startedAt,
            results,
            completedAt,
            completedBy: complete ? by : undefined,
          },
          startedAt,
        ),
      );
    }
  }

  /* ---------- Anomalies & actions ---------- */
  const anomalies: Anomaly[] = [];
  const actions: Action[] = [];
  const sevOf = (): Severity => (chance(0.12) ? 'critical' : chance(0.4) ? 'major' : 'minor');
  const prioOf = (s: Severity): Priority => (s === 'critical' ? 'critical' : s === 'major' ? 'high' : 'medium');
  const reporters = ['u-karim', 'u-sofia', 'u-aicha', 'u-yann', 'u-nadia'];
  const assignees = ['u-yann', 'u-lucia', 'u-sofia', 'u-aicha', 'u-karim'];

  for (let d = HISTORY_DAYS - 1; d >= 1; d--) {
    const day = addDays(today, -d);
    const count = 1 + Math.floor(rnd() * 4);
    for (let i = 0; i < count; i++) {
      const sample = pick(DEMO_ANOMALY_SAMPLES);
      const severity = sevOf();
      const reportedAt = at(
        day,
        `${String(6 + Math.floor(rnd() * 14)).padStart(2, '0')}:${String(Math.floor(rnd() * 60)).padStart(2, '0')}`,
      );
      const closed = d > 4 ? chance(0.92) : chance(0.5);
      const status: AnomalyStatus = closed ? 'closed' : chance(0.5) ? 'in_progress' : 'open';
      const closeDay = addDays(day, 1 + Math.floor(rnd() * 4));
      const closedAt = closed ? at(closeDay > today ? today : closeDay, '14:00') : undefined;
      const anomaly: Anomaly = stamp(
        {
          id: nextId('an'),
          description: sample.text,
          category: sample.category,
          severity,
          workstationId: sample.ws,
          status,
          reportedBy: pick(reporters),
          origin: { type: chance(0.3) ? 'qr' : 'manual' } as Anomaly['origin'],
          closedAt,
          closedBy: closed ? 'u-karim' : undefined,
          resolutionNote: closed ? 'Cause traitée, vérifiée sur le terrain.' : undefined,
        },
        reportedAt,
      );
      anomalies.push(anomaly);
      if (severity !== 'minor' || chance(0.3)) {
        const due = addDays(day, severity === 'critical' ? 1 : severity === 'major' ? 3 : 7);
        const done = closed || chance(0.3);
        actions.push(
          stamp(
            {
              id: nextId('ac'),
              title: `Traiter : ${sample.text}`,
              assigneeId: pick(assignees),
              priority: prioOf(severity),
              status: done ? ('done' as const) : chance(0.5) ? ('in_progress' as const) : ('todo' as const),
              dueDate: due,
              source: { type: 'anomaly' as const, id: anomaly.id },
              createdBy: anomaly.reportedBy,
              closedAt: done ? (closedAt ?? at(addDays(due, -1) > today ? today : addDays(due, -1), '15:00')) : undefined,
            },
            reportedAt,
          ),
        );
      }
    }
  }

  // Situation du jour (reprise du prototype)
  const todayAnomalies: [string, Anomaly['category'], Severity, string, string, AnomalyStatus][] = [
    ['an-today-1', 'quality', 'major', 'Connecteur mal positionné détecté au contrôle premier article', 'ws-p4', 'open'],
    ['an-today-2', '5s', 'minor', 'Outillage non rangé au poste de coupe', 'ws-p8', 'open'],
    ['an-today-3', 'equipment', 'major', 'Bruit anormal sur la machine de dénudage C', 'ws-p2', 'in_progress'],
  ];
  todayAnomalies.forEach(([id, category, severity, description, ws, status], i) =>
    anomalies.push(
      stamp(
        {
          id,
          description,
          category,
          severity,
          workstationId: ws,
          status,
          reportedBy: i === 2 ? 'u-yann' : 'u-karim',
          origin: { type: i === 0 ? 'routine' : 'manual' } as Anomaly['origin'],
        },
        minutesAgo(90 - i * 25),
      ),
    ),
  );
  actions.push(
    stamp(
      {
        id: 'ac-today-1',
        title: 'Recadrer le positionnement des connecteurs au poste 4',
        assigneeId: 'u-sofia',
        priority: 'high' as Priority,
        status: 'todo' as const,
        dueDate: today,
        source: { type: 'anomaly' as const, id: 'an-today-1' },
        createdBy: 'u-karim',
      },
      minutesAgo(85),
    ),
    stamp(
      {
        id: 'ac-late-1',
        title: 'Remettre la cadence de la ligne A à l’objectif',
        assigneeId: 'u-yann',
        priority: 'critical' as Priority,
        status: 'in_progress' as const,
        dueDate: addDays(today, -1),
        source: { type: 'manual' as const },
        createdBy: 'u-karim',
      },
      minutesAgo(60 * 26),
    ),
    stamp(
      {
        id: 'ac-task-1',
        title: 'Réapprovisionner le poste de contrôle qualité',
        assigneeId: 'u-aicha',
        backupId: 'u-hina',
        priority: 'medium' as Priority,
        status: 'in_progress' as const,
        dueDate: today,
        source: { type: 'manual' as const },
        createdBy: 'u-karim',
      },
      minutesAgo(200),
    ),
    stamp(
      {
        id: 'ac-task-2',
        title: 'Faire régler la presse de sertissage du poste 3',
        assigneeId: 'u-yann',
        backupId: 'u-sofia',
        priority: 'high' as Priority,
        status: 'in_progress' as const,
        dueDate: addDays(today, 1),
        source: { type: 'manual' as const },
        createdBy: 'u-karim',
      },
      minutesAgo(300),
    ),
    stamp(
      {
        id: 'ac-meet-1',
        title: 'Relancer la maintenance sur la presse B',
        assigneeId: 'u-yann',
        priority: 'medium' as Priority,
        status: 'in_progress' as const,
        dueDate: today,
        source: { type: 'meeting' as const, id: 'mt-yesterday' },
        createdBy: 'u-karim',
      },
      minutesAgo(60 * 24),
    ),
  );

  const comments = [
    stamp(
      {
        id: 'cm-1',
        targetType: 'action' as const,
        targetId: 'ac-task-2',
        authorId: 'u-karim',
        text: 'En attente de la confirmation maintenance avant clôture.',
      },
      minutesAgo(240),
    ),
  ];

  /* ---------- Andon ---------- */
  const andonTypes: AndonType[] = ['quality', 'equipment', 'material', 'safety'];
  const andonDetails: Record<AndonType, string[]> = {
    quality: ['Connecteur mal serti', 'Défaut de rubanage', 'Longueur hors tolérance'],
    equipment: ['Presse de sertissage à l’arrêt', 'Testeur de continuité en panne', 'Machine de coupe bloquée'],
    material: ['Rupture de terminaux', 'Connecteurs manquants', 'Ruban épuisé'],
    safety: ['Situation dangereuse signalée'],
  };
  const andonAlerts: AndonAlert[] = [];
  for (let d = HISTORY_DAYS - 1; d >= 1; d--) {
    const day = addDays(today, -d);
    const n = Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const type = chance(0.05) ? 'safety' : pick(andonTypes.slice(0, 3));
      const raisedAt = at(day, `${String(6 + Math.floor(rnd() * 15)).padStart(2, '0')}:${String(Math.floor(rnd() * 60)).padStart(2, '0')}`);
      const ackMin = 1 + Math.floor(rnd() * 12);
      const resMin = ackMin + 3 + Math.floor(rnd() * 40);
      const plus = (m: number) => new Date(new Date(raisedAt).getTime() + m * 60_000).toISOString();
      andonAlerts.push(
        stamp(
          {
            id: nextId('ad'),
            workstationId: pick(wsIds),
            type,
            urgency: type === 'safety' ? ('critical' as const) : chance(0.3) ? ('low' as const) : ('medium' as const),
            detail: pick(andonDetails[type]),
            status: 'resolved' as const,
            raisedBy: pick(['u-nadia', 'u-ibrahim', 'u-yann']),
            raisedAt,
            acknowledgedBy: 'u-yann',
            acknowledgedAt: plus(ackMin),
            resolutionStartedAt: plus(ackMin + 1),
            resolvedBy: 'u-yann',
            resolvedAt: plus(resMin),
            rootCause: 'Cause identifiée sur place',
            resolution: 'Remise en état et redémarrage du poste',
          },
          raisedAt,
        ),
      );
    }
  }
  andonAlerts.push(
    stamp(
      {
        id: 'ad-live-1',
        workstationId: 'ws-p1',
        type: 'quality' as const,
        urgency: 'medium' as const,
        detail: 'Connecteur mal serti',
        status: 'active' as const,
        raisedBy: 'u-nadia',
        raisedAt: minutesAgo(6),
      },
      minutesAgo(6),
    ),
    stamp(
      {
        id: 'ad-live-2',
        workstationId: 'ws-p5',
        type: 'equipment' as const,
        urgency: 'medium' as const,
        detail: 'Testeur de continuité en panne',
        status: 'in_progress' as const,
        raisedBy: 'u-ibrahim',
        raisedAt: minutesAgo(14),
        acknowledgedBy: 'u-lucia',
        acknowledgedAt: minutesAgo(9),
        resolutionStartedAt: minutesAgo(5),
      },
      minutesAgo(14),
    ),
  );

  /* ---------- Séquence guidée ---------- */
  const sequenceTemplates = [
    stamp({
      id: 'sq-day',
      name: 'Journée type du Line Leader',
      active: true,
      description: 'Enchaînement des rendez-vous clés de la journée, avec durée cible par étape.',
      steps: DEMO_SEQUENCE_STEPS.map(([title, time, dur], i) => ({
        id: `sq-day-${i}`,
        title,
        plannedTime: time,
        durationMin: dur,
        active: true,
      })),
    }),
    stamp({
      id: 'sq-changeover',
      name: 'Changement de série — poste de sertissage',
      active: true,
      description: 'Séquence opératoire du changement de série sur presse de sertissage.',
      steps: [
        {
          id: 'sq-co-0',
          title: 'Arrêter la presse et consigner',
          instruction: 'Couper l’alimentation et poser le cadenas de consignation.',
          validation: 'Cadenas posé et presse hors tension',
          durationMin: 2,
          knowledgeId: 'kb-sec-01',
          active: true,
        },
        {
          id: 'sq-co-1',
          title: 'Changer l’outil de sertissage',
          instruction: 'Vérifier la correspondance outil / référence terminal.',
          durationMin: 6,
          knowledgeId: 'kb-std-02',
          active: true,
        },
        { id: 'sq-co-2', title: 'Charger la nouvelle bobine de terminaux', durationMin: 3, active: true },
        {
          id: 'sq-co-3',
          title: 'Réaliser 5 pièces d’essai',
          instruction: 'Mesurer la hauteur de sertissage et faire l’essai de traction.',
          validation: 'Hauteur et traction conformes sur les 5 pièces',
          durationMin: 5,
          active: true,
        },
        { id: 'sq-co-4', title: 'Valider le premier article avec la qualité', durationMin: 4, knowledgeId: 'kb-qual-02', active: true },
      ],
    }),
  ];

  /* ---------- Production ---------- */
  const productionOrders: ProductionOrder[] = [
    ['OF-2640', 'FX-PORTE-AVG-12', 'line-a', 120, 120, 'shipping', 'done'],
    ['OF-2641', 'FX-PORTE-AVD-12', 'line-a', 120, 86, 'taping', 'in_progress'],
    ['OF-2642', 'FX-PORTE-ARG-08', 'line-a', 80, 40, 'assembly', 'in_progress'],
    ['OF-2643', 'FX-PORTE-ARD-08', 'line-a', 80, 0, 'crimping', 'blocked'],
    ['OF-2644', 'FX-PORTE-AVG-12', 'line-a', 120, 0, 'cutting', 'planned'],
    ['OF-2650', 'FX-MOTEUR-1.5-A', 'line-b', 60, 44, 'electrical_test', 'in_progress'],
    ['OF-2651', 'FX-MOTEUR-1.5-B', 'line-b', 60, 12, 'cutting', 'in_progress'],
    ['OF-2652', 'FX-MOTEUR-2.0-A', 'line-b', 40, 40, 'inspection', 'in_progress'],
  ].map(([reference, harnessRef, line, planned, done, stage, status], i) =>
    stamp(
      {
        id: `of-${i}`,
        reference: reference as string,
        harnessRef: harnessRef as string,
        lineId: line as string,
        quantityPlanned: planned as number,
        quantityDone: done as number,
        stage: stage as ProductionOrder['stage'],
        status: status as ProductionOrder['status'],
        ownerId: line === 'line-a' ? 'u-karim' : 'u-sofia',
        dueDate: addDays(today, i % 3),
        blockedReason: status === 'blocked' ? 'Rupture de terminaux UY au poste 1' : undefined,
      },
      minutesAgo(60 * (10 - i)),
    ),
  );

  const materialStocks: MaterialStock[] = [
    ['Connecteurs 12 voies', 'ws-p1', 240, 100, 400, 'pcs'],
    ['Terminaux UY', 'ws-p1', 80, 150, 500, 'pcs'],
    ['Épissures', 'ws-p2', 45, 60, 200, 'pcs'],
    ['Ruban 19 mm', 'ws-p4', 120, 40, 160, 'rouleaux'],
    ['Capuchons d’essai', 'ws-p5', 6, 10, 40, 'pcs'],
    ['Étiquettes de contrôle', 'ws-p6', 300, 50, 400, 'pcs'],
    ['Tresse de blindage', 'ws-p8', 210, 120, 500, 'm'],
  ].map(([material, ws, quantity, min, target, unit], i) =>
    stamp({
      id: `st-${i}`,
      material: material as string,
      workstationId: ws as string,
      quantity: quantity as number,
      min: min as number,
      target: target as number,
      unit: unit as string,
    }),
  );

  /* ---------- Gemba ---------- */
  const gembaChecklist = [
    'Sécurité et EPI au poste',
    '5S : rangement, nettoyage, marquage au sol',
    'Respect du standard / mode opératoire',
    'Flux des matières et déplacements',
    'Qualité : autocontrôle et premier article',
    'Sécurité machine et ergonomie',
    'Compétences et polyvalence de l’équipe',
    'Performance : cadence et micro-arrêts',
  ];
  const gembaWalks = [
    stamp(
      {
        id: 'gw-1',
        date: today,
        zone: 'Ligne A — Poste 4 (Rubanage)',
        leaderId: 'u-karim',
        participantIds: ['u-aicha'],
        status: 'validated' as const,
        validatedAt: minutesAgo(120),
        checklist: gembaChecklist.map((label, i) => ({
          id: `gc-${i}`,
          label,
          result: (i === 3 ? 'ko' : 'ok') as CheckResult,
          comment: i === 3 ? 'Ruban recherché plusieurs fois sur le plan de travail' : undefined,
        })),
        observations: [
          {
            id: 'go-1',
            finding: 'Le ruban est cherché plusieurs fois sur le plan de travail : perte de temps et risque d’erreur de repère.',
            improvement: 'Préparer un kit ruban par faisceau avec étiquette de poste.',
            severity: 'major' as Severity,
            workstationId: 'ws-p4',
            actionId: 'ac-gemba-1',
          },
        ],
      },
      minutesAgo(130),
    ),
    stamp(
      {
        id: 'gw-2',
        date: addDays(today, -1),
        zone: 'Ligne B — Poste 8 (Coupe)',
        leaderId: 'u-karim',
        participantIds: [],
        status: 'validated' as const,
        validatedAt: minutesAgo(60 * 25),
        checklist: gembaChecklist.map((label, i) => ({
          id: `gc2-${i}`,
          label,
          result: (i === 1 ? 'ko' : i === 6 ? 'na' : 'ok') as CheckResult,
          comment: i === 1 ? 'Chutes de câble au sol' : undefined,
        })),
        observations: [
          {
            id: 'go-2',
            finding: 'Les chutes de câble s’accumulent au sol et gênent le passage.',
            improvement: 'Installer un bac identifié « chutes » et l’inclure dans l’audit 5S.',
            severity: 'minor' as Severity,
            workstationId: 'ws-p8',
          },
        ],
      },
      minutesAgo(60 * 25),
    ),
  ];
  actions.push(
    stamp(
      {
        id: 'ac-gemba-1',
        title: 'Kit ruban par faisceau au poste 4',
        assigneeId: 'u-sofia',
        priority: 'high' as Priority,
        status: 'todo' as const,
        dueDate: addDays(today, 3),
        source: { type: 'gemba' as const, id: 'gw-1' },
        createdBy: 'u-karim',
      },
      minutesAgo(120),
    ),
  );

  /* ---------- Qualité LQC ---------- */
  const characteristics: [string, string, number, number, number, number][] = [
    ['Force d’arrachement connecteur', 'ws-p1', 80, 120, 100, 12],
    ['Hauteur de sertissage', 'ws-p1', 1.42, 1.52, 1.47, 0.03],
    ['Longueur de coupe', 'ws-p8', 30, 33, 31.5, 0.9],
    ['Recouvrement du ruban', 'ws-p4', 50, 100, 62, 8],
  ];
  const units = ['N', 'mm', 'cm', '%'];
  const qualityChecks: QualityCheck[] = [];
  for (let d = HISTORY_DAYS - 1; d >= 0; d--) {
    const day = addDays(today, -d);
    characteristics.forEach(([name, ws, min, max, nominal, spread], ci) => {
      const times = d === 0 ? ['07:40'] : ['07:40', '11:10', '16:30'];
      times.forEach((time) => {
        const due = new Date(atTime(day, time)).getTime();
        if (due > nowMs) return;
        const raw = nominal + (rnd() - 0.5) * 2 * spread * (chance(0.06) ? 2.2 : 1);
        const value = Math.round(raw * 100) / 100;
        qualityChecks.push(
          stamp(
            { id: nextId('qc'), characteristic: name, workstationId: ws, value, min, max, unit: units[ci]!, measuredBy: 'u-aicha' },
            at(day, time),
          ),
        );
      });
    });
  }

  /* ---------- Agenda : briefs quotidiens (série), formation, audit, opération 5S ---------- */
  const agendaLabels = ['Sécurité et 5S', 'Production / OF du jour', 'Qualité et anomalies', 'Effectifs et absences', 'Suivi des actions'];
  const briefTeams = ['team-a', 'team-b'];
  const briefInvitees = users.filter((u) => u.teamId && briefTeams.includes(u.teamId)).map((u) => u.id);
  const brief = (id: string, day: DateKey, done: boolean): Meeting =>
    stamp(
      {
        id,
        title: 'Brief de début de poste',
        type: 'briefing' as const,
        date: day,
        startTime: '06:40',
        endTime: '06:50',
        location: 'Tableau d’équipe — ligne A',
        organizerId: 'u-karim',
        participantIds: ['u-aicha'],
        teamIds: briefTeams,
        attendeeIds: done ? ['u-karim', 'u-aicha', ...briefInvitees.filter(() => chance(0.85))] : [],
        status: done ? ('done' as const) : ('planned' as const),
        agenda: agendaLabels.map((label, i) => ({ id: `${id}-a${i}`, label, done: done && chance(0.9) })),
        minutes: !done
          ? ''
          : day === addDays(today, -1)
            ? 'Cadence correcte sur la ligne A. Suivi demandé sur la presse B. Un membre en congé.'
            : 'Points passés en revue, pas de blocage majeur.',
        seriesId: 'series-brief',
      },
      `${addDays(today, -HISTORY_DAYS - 1)}T08:00:00.000Z`,
    );
  const meetings: Meeting[] = [];
  for (let d = HISTORY_DAYS - 1; d >= 1; d--) {
    const day = addDays(today, -d);
    if (isoWeekday(day) > 5 && d !== 1) continue; // briefs les jours ouvrés
    meetings.push(brief(d === 1 ? 'mt-yesterday' : nextId('mt'), day, true));
  }
  meetings.push(brief('mt-today', today, false));
  for (let d = 1; d <= 10; d++) {
    const day = addDays(today, d);
    if (isoWeekday(day) <= 5) meetings.push(brief(nextId('mt'), day, false));
  }
  const event = (
    m: Partial<Meeting> & Pick<Meeting, 'id' | 'title' | 'type' | 'date' | 'startTime' | 'endTime' | 'organizerId'>,
  ): Meeting =>
    stamp(
      { participantIds: [], teamIds: [], attendeeIds: [], agenda: [], minutes: '', status: 'planned' as const, ...m },
      `${addDays(today, -3)}T09:00:00.000Z`,
    );
  meetings.push(
    event({
      id: 'ev-5s-a',
      title: 'Opération 5S ligne A',
      type: 'operational',
      date: today,
      startTime: '14:00',
      endTime: '15:00',
      location: 'Ligne A',
      description: 'Rangement et marquage au sol de tous les postes de la ligne A.',
      organizerId: 'u-karim',
      teamIds: ['team-a'],
    }),
    event({
      id: 'ev-training',
      title: 'Formation — nouveau standard de rubanage',
      type: 'training',
      date: addDays(today, 1),
      startTime: '14:00',
      endTime: '15:00',
      location: 'Salle de formation',
      description: 'Présentation du standard STD-01 révisé et exercices pratiques.',
      organizerId: 'u-aicha',
      participantIds: ['u-nadia', 'u-ibrahim', 'u-yann'],
      agenda: [
        { id: 'ev-training-a0', label: 'Écarts constatés au contrôle', done: false },
        { id: 'ev-training-a1', label: 'Nouveau standard STD-01', done: false },
        { id: 'ev-training-a2', label: 'Exercice au poste', done: false },
      ],
    }),
    event({
      id: 'ev-audit-b',
      title: 'Audit 5S ligne B',
      type: 'audit',
      date: addDays(today, 2),
      startTime: '10:00',
      endTime: '11:00',
      location: 'Ligne B',
      organizerId: 'u-dupont',
      participantIds: ['u-sofia', 'u-lucia'],
    }),
    event({
      id: 'ev-maint',
      title: 'Maintenance préventive — presse A',
      type: 'maintenance',
      date: addDays(today, 3),
      startTime: '12:30',
      endTime: '13:30',
      location: 'Poste 1',
      description: 'Arrêt de la presse A pendant l’intervention : prévoir le report des OF.',
      organizerId: 'u-karim',
      participantIds: ['u-yann'],
    }),
    event({
      id: 'ev-review',
      title: 'Revue hebdomadaire des indicateurs',
      type: 'meeting',
      date: addDays(today, 2),
      startTime: '15:00',
      endTime: '16:00',
      location: 'Bureau atelier',
      organizerId: 'u-dupont',
      participantIds: ['u-karim', 'u-sofia', 'u-aicha'],
      agenda: [
        { id: 'ev-review-a0', label: 'Réalisation des routines', done: false },
        { id: 'ev-review-a1', label: 'Andon et temps de réaction', done: false },
        { id: 'ev-review-a2', label: 'Actions correctives en retard', done: false },
      ],
    }),
  );

  /* ---------- Passations, annonce, notifications ---------- */
  const handovers = [
    stamp(
      {
        id: 'ho-1',
        fromShift: 'night' as const,
        toShift: 'morning' as const,
        authorId: 'u-sofia',
        workstationId: 'ws-p4',
        note: 'Incident qualité au poste 4 toujours ouvert — voir avec la qualité en priorité.',
      },
      at(today, '05:50'),
    ),
    stamp(
      {
        id: 'ho-2',
        fromShift: 'afternoon' as const,
        toShift: 'night' as const,
        authorId: 'u-karim',
        workstationId: 'ws-p3',
        note: 'Machine 3 bruyante au démarrage — surveiller le sertissage. Racks connecteurs à réapprovisionner.',
        acknowledgedBy: 'u-sofia',
        acknowledgedAt: at(addDays(today, -1), '22:05'),
      },
      at(addDays(today, -1), '21:45'),
    ),
  ];
  const announcements = [
    stamp(
      {
        id: 'an-msg-1',
        text: 'Opération 5S sur la ligne A à 14 h 00 — participation de toute l’équipe.',
        date: today,
        authorId: 'u-karim',
      },
      at(today, '06:00'),
    ),
  ];
  const notifications = [
    stamp(
      {
        id: 'nt-1',
        userId: 'u-sofia',
        kind: 'action_assigned' as const,
        title: 'Nouvelle action : Recadrer le positionnement des connecteurs au poste 4',
        link: '/actions/ac-today-1',
      },
      minutesAgo(85),
    ),
    stamp({ id: 'nt-2', userId: 'u-yann', kind: 'andon_raised' as const, title: 'Andon qualité — Poste 1', link: '/andon' }, minutesAgo(6)),
    stamp(
      { id: 'nt-3', userId: 'u-karim', kind: 'andon_raised' as const, title: 'Andon qualité — Poste 1', link: '/andon' },
      minutesAgo(6),
    ),
    stamp(
      {
        id: 'nt-4',
        userId: 'u-karim',
        kind: 'comment_added' as const,
        title: 'Commentaire sur « Faire régler la presse de sertissage du poste 3 »',
        link: '/actions/ac-task-2',
        readAt: minutesAgo(200),
      },
      minutesAgo(240),
    ),
    stamp(
      {
        id: 'nt-5',
        userId: 'u-nadia',
        kind: 'meeting_invited' as const,
        title: 'Invitation : Formation — nouveau standard de rubanage (demain 14:00)',
        link: '/reunions/ev-training',
      },
      at(addDays(today, -3), '09:00'),
    ),
  ];

  const settings = [
    stamp({
      id: 'app',
      plantName: 'Atelier de câblage',
      andonEscalationMinutes: 10,
      routineLateToleranceMinutes: 120,
      disabledModules: [],
    }),
  ];

  return {
    users,
    teams,
    lines,
    workstations,
    presence,
    leaves,
    checklists,
    routineTemplates,
    schedules,
    routineRuns,
    actions,
    comments,
    anomalies,
    andonAlerts,
    sequenceTemplates,
    sequenceRuns: [],
    productionOrders,
    materialStocks,
    stockMovements: [],
    gembaWalks,
    qualityChecks,
    knowledgeItems,
    favorites: [],
    meetings,
    handovers,
    announcements,
    notifications,
    settings,
  };
}
