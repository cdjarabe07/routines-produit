/* Générateur du jeu de DÉMONSTRATION.
   - Toutes les données sont fictives et datées par rapport à « maintenant ».
   - Générateur pseudo-aléatoire à graine fixe : le jeu est reproductible.
   - Aucune logique métier ici : uniquement des enregistrements « comme saisis ». */

import type {
  Action,
  AndonAlert,
  AndonType,
  Anomaly,
  AnomalyStatus,
  BaseEntity,
  CheckResult,
  DateKey,
  ItemResult,
  KnowledgeItem,
  MaterialStock,
  Meeting,
  Priority,
  ProductionOrder,
  QualityCheck,
  RoutineRun,
  RoutineTemplate,
  Severity,
  User,
  Workstation,
} from '@/types/domain';
import type { Dataset } from '@/services/data/types';
import { addDays, atTime, toDateKey } from '@/utils/date';
import {
  DEMO_ANOMALY_SAMPLES,
  DEMO_AUDIT_SECTIONS,
  DEMO_KNOWLEDGE,
  DEMO_LINKS,
  DEMO_ROUTINES,
  DEMO_SEQUENCE_STEPS,
  DEMO_USERS,
  DEMO_WORKSTATIONS,
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

  const users: User[] = DEMO_USERS.map((u) =>
    stamp({
      id: u.id,
      name: u.name,
      role: u.role,
      email: `${u.id.slice(2)}@demo.local`,
      lineId: lineId(u.line),
      zoneLabel: u.zone,
      shift: u.shift,
      active: true,
    }),
  );
  const staff = users.filter((u) => u.role !== 'admin');

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

  /* ---------- Connaissances (exemples) ---------- */
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
          owner: 'Exemple — prototype',
          status: 'published' as const,
          isExample: true,
        },
        addDays(today, -60) + 'T08:00:00.000Z',
      ),
    ),
    ...DEMO_LINKS.map((l) =>
      stamp(
        {
          id: l.id,
          code: l.code,
          title: l.title,
          category: l.category,
          kind: 'link' as const,
          summary: 'Lien externe d’exemple (adresse fictive).',
          keyPoints: [],
          url: l.url,
          version: '1.0',
          owner: 'Exemple — prototype',
          status: 'published' as const,
          isExample: true,
        },
        addDays(today, -40) + 'T08:00:00.000Z',
      ),
    ),
  ];

  /* ---------- Routines ---------- */
  const routineTemplates: RoutineTemplate[] = [
    ...DEMO_ROUTINES.map((r) =>
      stamp({
        id: r.id,
        title: r.title,
        role: r.role,
        scheduledTime: r.time,
        active: true,
        sections: [
          {
            id: `${r.id}-s1`,
            title: 'Points de contrôle',
            items: r.items.map(([label, kb], i) => ({ id: `${r.id}-i${i}`, label, knowledgeId: kb })),
          },
        ],
      }),
    ),
    stamp({
      id: 'rt-ll-audit',
      title: 'Audit terrain',
      role: 'line_leader' as const,
      scheduledTime: '09:00',
      active: true,
      description: 'Tour de ligne structuré en 7 thèmes. Un point non conforme permet de déclarer une anomalie.',
      sections: DEMO_AUDIT_SECTIONS.map((s, si) => ({
        id: `rt-ll-audit-s${si}`,
        title: s.title,
        items: s.items.map((label, ii) => ({ id: `rt-ll-audit-s${si}-i${ii}`, label })),
      })),
    }),
  ];
  const assigneeFor: Record<string, string> = { line_leader: 'u-karim', hancho: 'u-yann', quality: 'u-aicha' };

  const routineRuns: RoutineRun[] = [];
  for (let d = HISTORY_DAYS - 1; d >= 0; d--) {
    const day = addDays(today, -d);
    for (const t of routineTemplates) {
      const items = t.sections.flatMap((s) => s.items);
      const by = assigneeFor[t.role]!;
      const results: Record<string, ItemResult> = {};
      if (d === 0) {
        // Aujourd'hui : seules les routines dont l'heure est passée depuis > 20 min sont (partiellement) faites.
        const due = new Date(atTime(day, t.scheduledTime)).getTime();
        if (nowMs - due < 20 * 60_000) continue;
        if (t.id === 'rt-ll-audit' || t.id === 'rt-q-conn') continue; // laissées à faire pour la démonstration
        items.forEach((it, i) => {
          if (t.id === 'rt-ll-safety' && i === items.length - 1) return; // une routine partielle
          results[it.id] = { status: 'ok', at: at(day, t.scheduledTime, 3 + i * 2), by };
        });
      } else {
        const skipped = chance(0.08);
        if (skipped) continue;
        const completion = chance(0.82) ? 1 : 0.5;
        items.forEach((it, i) => {
          if (i / items.length >= completion) return;
          const status: CheckResult = chance(0.05) ? 'ko' : chance(0.03) ? 'na' : 'ok';
          results[it.id] = {
            status,
            at: at(day, t.scheduledTime, 4 + i * 2 + Math.floor(rnd() * 40)),
            by,
            comment: status === 'ko' ? 'Écart constaté, traité avec l’équipe' : undefined,
          };
        });
      }
      const done = Object.keys(results).length === items.length;
      routineRuns.push(
        stamp(
          {
            id: nextId('run'),
            templateId: t.id,
            date: day,
            assigneeId: by,
            results,
            completedAt: done
              ? Object.values(results)
                  .map((r) => r.at)
                  .sort()
                  .at(-1)
              : undefined,
          },
          at(day, t.scheduledTime),
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
            urgency: type === 'safety' ? ('critical' as const) : ('normal' as const),
            detail: pick(andonDetails[type]),
            status: 'resolved' as const,
            raisedBy: pick(['u-nadia', 'u-ibrahim', 'u-yann']),
            raisedAt,
            acknowledgedBy: 'u-yann',
            acknowledgedAt: plus(ackMin),
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
        urgency: 'normal' as const,
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
        urgency: 'normal' as const,
        detail: 'Testeur de continuité en panne',
        status: 'acknowledged' as const,
        raisedBy: 'u-ibrahim',
        raisedAt: minutesAgo(14),
        acknowledgedBy: 'u-lucia',
        acknowledgedAt: minutesAgo(9),
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
      steps: DEMO_SEQUENCE_STEPS.map(([title, time, dur], i) => ({ id: `sq-day-${i}`, title, plannedTime: time, durationMin: dur })),
    }),
    stamp({
      id: 'sq-changeover',
      name: 'Changement de série — poste de sertissage',
      active: true,
      description: 'Exemple de séquence opératoire. Contenu à valider par les méthodes.',
      steps: [
        {
          id: 'sq-co-0',
          title: 'Arrêter la presse et consigner',
          instruction: 'Couper l’alimentation et poser le cadenas de consignation.',
          durationMin: 2,
          knowledgeId: 'kb-sec-01',
        },
        {
          id: 'sq-co-1',
          title: 'Changer l’outil de sertissage',
          instruction: 'Vérifier la correspondance outil / référence terminal.',
          durationMin: 6,
          knowledgeId: 'kb-std-02',
        },
        { id: 'sq-co-2', title: 'Charger la nouvelle bobine de terminaux', durationMin: 3 },
        {
          id: 'sq-co-3',
          title: 'Réaliser 5 pièces d’essai',
          instruction: 'Mesurer la hauteur de sertissage et faire l’essai de traction.',
          durationMin: 5,
        },
        { id: 'sq-co-4', title: 'Valider le premier article avec la qualité', durationMin: 4, knowledgeId: 'kb-qual-02' },
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

  /* ---------- Réunions ---------- */
  const agendaLabels = ['Sécurité et 5S', 'Production / OF du jour', 'Qualité et anomalies', 'Effectifs et absences', 'Suivi des actions'];
  const meetings: Meeting[] = [];
  for (let d = HISTORY_DAYS - 1; d >= 1; d--) {
    const day = addDays(today, -d);
    const id = d === 1 ? 'mt-yesterday' : nextId('mt');
    meetings.push(
      stamp(
        {
          id,
          title: 'Brief de début de poste',
          date: day,
          startTime: '06:40',
          durationMin: 10,
          organizerId: 'u-karim',
          participantIds: staff.filter(() => chance(0.7)).map((u) => u.id),
          status: 'done' as const,
          agenda: agendaLabels.map((label, i) => ({ id: `${id}-a${i}`, label, done: chance(0.9) })),
          minutes:
            d === 1
              ? 'Cadence correcte sur la ligne A. Suivi demandé sur la presse B. Un membre en congé.'
              : 'Points passés en revue, pas de blocage majeur.',
        },
        at(day, '06:40'),
      ),
    );
  }
  meetings.push(
    stamp({
      id: 'mt-today',
      title: 'Brief de début de poste',
      date: today,
      startTime: '06:40',
      durationMin: 10,
      organizerId: 'u-karim',
      participantIds: [],
      status: 'planned' as const,
      minutes: '',
      agenda: agendaLabels.map((label, i) => ({ id: `mt-today-a${i}`, label, done: false })),
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
  ];

  const settings = [
    stamp({ id: 'app', plantName: 'Atelier de câblage — démonstration', andonEscalationMinutes: 10, routineLateToleranceMinutes: 120 }),
  ];

  return {
    users,
    lines,
    workstations,
    presence,
    leaves,
    routineTemplates,
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
