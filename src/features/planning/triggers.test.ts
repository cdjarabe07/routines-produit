import { describe, expect, it } from 'vitest';
import { buildDemoData } from '@/data/demo/seed';
import { createMemoryStore, createStoreDataSource } from '@/services/data/storeDataSource';
import type { RoutineTemplate, RoutineTrigger, Schedule } from '@/types/domain';
import { todayKey } from '@/utils/date';
import { triggerOrderStart } from './api';
import { describeRecurrence, findOccurrence, occurrencePath, occurrenceSlot, occurrencesBetween, occursOn } from './model';

const base = { createdAt: '2026-09-01T08:00:00.000Z', updatedAt: '2026-09-01T08:00:00.000Z' };
const template = {
  ...base,
  id: 't',
  title: 'Libération de ligne',
  durationMin: 10,
  defaultTime: '08:00',
  active: true,
  tasks: [],
} as RoutineTemplate;
const schedule = (p: Partial<Schedule> = {}): Schedule => ({
  ...base,
  id: 'sc',
  routineId: 't',
  startDate: '2026-09-01',
  time: '08:00',
  recurrence: 'on_demand',
  weekdays: [],
  teamId: 'team-a',
  status: 'active',
  skippedDates: [],
  createdBy: 'admin',
  ...p,
});
const trigger = (p: Partial<RoutineTrigger> = {}): RoutineTrigger => ({
  ...base,
  id: 'trg',
  scheduleId: 'sc',
  date: '2026-09-29',
  slot: '09:17',
  reason: 'Changement de série',
  ...p,
});

describe('routines sur événement', () => {
  it('aucune occurrence au calendrier, une par déclenchement', () => {
    expect(occursOn(schedule(), '2026-09-29')).toBe(false);
    const src = {
      schedules: [schedule()],
      routines: [template],
      runs: [
        {
          ...base,
          id: 'r',
          scheduleId: 'sc',
          templateId: 't',
          date: '2026-09-29',
          slot: '14:02',
          assigneeId: 'u1',
          startedAt: '',
          results: {},
        },
      ],
      triggers: [
        trigger(),
        trigger({ id: 'trg2', slot: '14:02', reason: 'Nouveau lot matière' }),
        trigger({ id: 'autre', date: '2026-10-02' }),
      ],
    };
    const list = occurrencesBetween(src, '2026-09-29', '2026-09-29');
    expect(list.map((o) => [o.time, o.trigger?.reason, Boolean(o.run)])).toEqual([
      ['09:17', 'Changement de série', false],
      ['14:02', 'Nouveau lot matière', true],
    ]);
    expect(occurrencePath(list[0]!)).toBe('/app/routines/sc/2026-09-29/0917');
    expect(occurrenceSlot(list[0]!)).toBe('09:17');
    expect(findOccurrence(src, 'sc', '2026-09-29', '14:02')?.run?.id).toBe('r');
    // Planification annulée ou jour annulé : plus d'occurrence
    expect(occurrencesBetween({ ...src, schedules: [schedule({ skippedDates: ['2026-09-29'] })] }, '2026-09-29', '2026-09-29')).toEqual([]);
  });

  it('libellé', () => {
    expect(describeRecurrence(schedule())).toBe('Sur événement');
    expect(describeRecurrence(schedule({ triggerOn: 'order_start' }))).toBe('Sur événement · au démarrage d’un ordre de fabrication');
  });

  it('le démarrage d’un OF déclenche les routines prévues sur sa ligne (mode démo)', async () => {
    const ds = createStoreDataSource(createMemoryStore(), () => buildDemoData());
    const order = (await ds.repo('productionOrders').list()).find((o) => o.lineId === 'line-a')!;
    const before = (await ds.repo('routineTriggers').list()).length;
    expect(await triggerOrderStart(ds, order, 'u-karim')).toBe(1);
    const created = (await ds.repo('routineTriggers').list()).slice(before);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      scheduleId: 'sc-ll-clearance',
      date: todayKey(),
      orderId: order.id,
      reason: `Démarrage OF ${order.reference}`,
    });
    // Les personnes de l'équipe sont prévenues
    const notes = await ds.repo('notifications').list();
    expect(notes.some((n) => n.title.startsWith('Routine à réaliser : Libération de ligne'))).toBe(true);
    // Ligne B : aucune routine de démarrage prévue
    const lineB = (await ds.repo('productionOrders').list()).find((o) => o.lineId === 'line-b')!;
    expect(await triggerOrderStart(ds, lineB, 'u-karim')).toBe(0);
  });
});
