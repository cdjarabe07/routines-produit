import { describe, expect, it } from 'vitest';
import type { Meeting } from '@/types/domain';
import { hourRange, layoutDay, periodDays, shiftAnchor, slotTime } from './calendar';

const meeting = (id: string, startTime: string, endTime: string): Meeting => ({ id, date: '2026-10-05', startTime, endTime }) as Meeting;

describe('Calendrier de l’agenda — périodes', () => {
  it('la semaine va du lundi au dimanche', () => {
    const days = periodDays('week', '2026-10-07');
    expect(days[0]).toBe('2026-10-05');
    expect(days).toHaveLength(7);
  });

  it('le mois est complété en semaines entières', () => {
    const days = periodDays('month', '2026-10-15');
    expect(days[0]).toBe('2026-09-28'); // lundi avant le 1er octobre (jeudi)
    expect(days.at(-1)).toBe('2026-11-01'); // dimanche après le 31
    expect(days.length % 7).toBe(0);
  });

  it('navigue d’une période à l’autre', () => {
    expect(shiftAnchor('day', '2026-10-31', 1)).toBe('2026-11-01');
    expect(shiftAnchor('week', '2026-10-07', -1)).toBe('2026-09-30');
    expect(shiftAnchor('month', '2026-01-31', 1)).toBe('2026-02-01');
    expect(shiftAnchor('month', '2026-03-31', -1)).toBe('2026-02-01');
  });
});

describe('Calendrier de l’agenda — placement', () => {
  it('met côte à côte les événements simultanés', () => {
    const placed = layoutDay([meeting('a', '09:00', '10:00'), meeting('b', '09:30', '10:30'), meeting('c', '11:00', '11:30')]);
    const byId = Object.fromEntries(placed.map((p) => [p.meeting.id, p]));
    expect(byId.a).toMatchObject({ column: 0, columns: 2 });
    expect(byId.b).toMatchObject({ column: 1, columns: 2 });
    expect(byId.c).toMatchObject({ column: 0, columns: 1 });
  });

  it('réutilise une colonne libérée dans un même groupe', () => {
    const placed = layoutDay([meeting('long', '08:00', '12:00'), meeting('x', '08:00', '09:00'), meeting('y', '10:00', '11:00')]);
    const byId = Object.fromEntries(placed.map((p) => [p.meeting.id, p]));
    expect(byId.y!.column).toBe(1);
    expect(byId.long!.columns).toBe(2);
  });

  it('garde une durée minimale visible', () => {
    expect(layoutDay([meeting('z', '09:00', '09:00')])[0]!.end).toBe(9 * 60 + 25);
  });

  it('élargit la plage horaire aux événements', () => {
    expect(hourRange([])).toEqual([6, 20]);
    expect(hourRange([meeting('n', '05:30', '22:15')])).toEqual([5, 23]);
  });

  it('arrondit le créneau cliqué à la demi-heure', () => {
    expect(slotTime(9 * 60 + 44)).toBe('09:30');
    expect(slotTime(-10)).toBe('00:00');
  });
});
