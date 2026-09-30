import { afterEach, describe, expect, it, vi } from 'vitest';
import { completedOnTime, occurrenceState } from '@/features/planning/model';
import type { Occurrence } from '@/features/planning/model';
import {
  addDays,
  atTime,
  dateKeyOf,
  daysBetween,
  formatDate,
  formatLongDate,
  formatTime,
  getPlantTimeZone,
  isoWeekday,
  minutesOfDay,
  setPlantTimeZone,
  startOfMonth,
  startOfWeek,
  todayKey,
  toDateKey,
} from './date';

/* Date opérationnelle : toujours celle du fuseau de l'ATELIER, quel que soit le fuseau du poste.
   Le fuseau du « poste » est simulé en changeant process.env.TZ pendant l'exécution (pris en compte par Node). */

const PLANT = 'Africa/Dakar'; // UTC+0, sans heure d'été
const originalTz = process.env.TZ;
const restoreTz = () => {
  // Affecter undefined écrirait la chaîne « undefined »
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
};

function onBrowserIn<T>(tz: string, fn: () => T): T {
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    restoreTz();
  }
}

/** Heure locale du « poste » : garantit que la simulation de fuseau agit vraiment */
const browserHour = (iso: string) => new Date(iso).getHours();

afterEach(() => {
  setPlantTimeZone(null);
  vi.useRealTimers();
  restoreTz();
});

describe('Fuseau de l’atelier', () => {
  it('se règle une seule fois et refuse une valeur invalide', () => {
    expect(setPlantTimeZone(PLANT)).toBe(true);
    expect(getPlantTimeZone()).toBe(PLANT);
    expect(setPlantTimeZone('Pas/Un_Fuseau')).toBe(false);
    expect(getPlantTimeZone()).toBe(PLANT);
  });
});

describe('Date opérationnelle selon le fuseau du poste (atelier : Africa/Dakar)', () => {
  // 01/10/2026 00:30 à Dakar = 30/09 20:30 à New York = 01/10 08:30 à Shanghai
  const INSTANT = '2026-10-01T00:30:00.000Z';

  it('1. poste dans le même fuseau que l’atelier', () => {
    setPlantTimeZone(PLANT);
    onBrowserIn(PLANT, () => {
      expect(browserHour(INSTANT)).toBe(0);
      expect(dateKeyOf(INSTANT)).toBe('2026-10-01');
      expect(minutesOfDay(new Date(INSTANT))).toBe(30);
    });
  });

  it('2. poste plusieurs heures en arrière (New York) : la date reste celle de l’atelier', () => {
    setPlantTimeZone(PLANT);
    onBrowserIn('America/New_York', () => {
      expect(browserHour(INSTANT)).toBe(20); // le poste est encore le 30/09 à 20:30
      expect(dateKeyOf(INSTANT)).toBe('2026-10-01');
      expect(minutesOfDay(new Date(INSTANT))).toBe(30);
    });
  });

  it('3. poste plusieurs heures en avance (Shanghai) : la date reste celle de l’atelier', () => {
    setPlantTimeZone(PLANT);
    const evening = '2026-09-30T20:00:00.000Z'; // 30/09 20:00 à Dakar, déjà 01/10 04:00 à Shanghai
    onBrowserIn('Asia/Shanghai', () => {
      expect(browserHour(evening)).toBe(4);
      expect(dateKeyOf(evening)).toBe('2026-09-30');
      expect(minutesOfDay(new Date(evening))).toBe(20 * 60);
    });
  });

  it('4. passage de minuit à l’atelier', () => {
    setPlantTimeZone(PLANT);
    onBrowserIn('Asia/Shanghai', () => {
      expect(dateKeyOf('2026-09-30T23:59:00.000Z')).toBe('2026-09-30');
      expect(minutesOfDay(new Date('2026-09-30T23:59:00.000Z'))).toBe(1439);
      expect(dateKeyOf('2026-10-01T00:00:00.000Z')).toBe('2026-10-01');
      expect(minutesOfDay(new Date('2026-10-01T00:00:00.000Z'))).toBe(0);
    });
  });

  it('5. date du poste différente de celle de l’atelier : « aujourd’hui » est celui de l’atelier', () => {
    setPlantTimeZone(PLANT);
    vi.useFakeTimers({ now: new Date('2026-10-01T02:00:00.000Z'), toFake: ['Date'] });
    onBrowserIn('America/Los_Angeles', () => {
      expect(new Date().getDate()).toBe(30); // le poste est encore le 30/09
      expect(todayKey()).toBe('2026-10-01');
    });
    onBrowserIn('Pacific/Kiritimati', () => {
      expect(new Date().getDate()).toBe(1); // UTC+14 : le poste est déjà le 01/10 à 16:00
      expect(todayKey()).toBe('2026-10-01');
    });
  });

  it('6. changer le fuseau du système du poste ne change pas la date opérationnelle', () => {
    setPlantTimeZone(PLANT);
    vi.useFakeTimers({ now: new Date('2026-09-30T20:00:00.000Z'), toFake: ['Date'] });
    const seen = ['Africa/Dakar', 'America/New_York', 'Asia/Shanghai', 'Pacific/Kiritimati', 'Pacific/Pago_Pago'].map((tz) =>
      onBrowserIn(tz, () => ({ today: todayKey(), minutes: minutesOfDay(), time: formatTime(new Date()) })),
    );
    expect(new Set(seen.map((s) => JSON.stringify(s))).size).toBe(1);
    expect(seen[0]).toEqual({ today: '2026-09-30', minutes: 20 * 60, time: '20:00' });
  });

  it('sans fuseau d’atelier (mode démo local) : repli sur le fuseau du poste', () => {
    expect(getPlantTimeZone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const now = new Date();
    expect(toDateKey(now)).toBe(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    );
  });
});

describe('Arithmétique calendaire indépendante du fuseau du poste', () => {
  const zones = ['UTC', 'America/New_York', 'Asia/Shanghai', 'Europe/Paris', 'Pacific/Kiritimati', 'Pacific/Pago_Pago'];

  it.each(zones)('%s : ajout de jours, jour de la semaine, semaine, mois, écart', (tz) => {
    onBrowserIn(tz, () => {
      expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
      expect(addDays('2026-03-28', 2)).toBe('2026-03-30'); // passage à l'heure d'été (Europe)
      expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
      expect(isoWeekday('2026-10-01')).toBe(4); // jeudi
      expect(startOfWeek('2026-10-01')).toBe('2026-09-28');
      expect(startOfMonth('2026-10-17')).toBe('2026-10-01');
      expect(daysBetween('2026-03-01', '2026-04-01')).toBe(31);
      expect(formatDate('2026-10-01')).toBe('01/10/2026');
      expect(formatLongDate('2026-10-01')).toBe('jeudi 1 octobre');
    });
  });
});

describe('Heure de l’atelier → instant (atTime)', () => {
  it('atelier sans heure d’été', () => {
    setPlantTimeZone(PLANT);
    onBrowserIn('Asia/Shanghai', () => expect(atTime('2026-10-01', '08:00')).toBe('2026-10-01T08:00:00.000Z'));
  });

  it('atelier avec heure d’été : avant et après le changement d’heure', () => {
    setPlantTimeZone('Europe/Paris');
    onBrowserIn('America/New_York', () => {
      expect(atTime('2026-03-28', '08:00')).toBe('2026-03-28T07:00:00.000Z'); // UTC+1
      expect(atTime('2026-03-29', '08:00')).toBe('2026-03-29T06:00:00.000Z'); // UTC+2
      expect(atTime('2026-10-25', '08:00')).toBe('2026-10-25T07:00:00.000Z'); // retour UTC+1
    });
  });

  it('aller-retour : l’instant produit se relit à la même date et à la même heure de l’atelier', () => {
    setPlantTimeZone('America/New_York');
    onBrowserIn('Asia/Shanghai', () => {
      const iso = atTime('2026-10-01', '23:30');
      expect(dateKeyOf(iso)).toBe('2026-10-01');
      expect(minutesOfDay(new Date(iso))).toBe(23 * 60 + 30);
    });
  });
});

describe('Routines : états et ponctualité selon l’atelier', () => {
  const occurrence = (over: Partial<Occurrence> = {}) =>
    ({ date: '2026-09-30', time: '19:30', run: undefined, routine: { durationMin: 20 }, ...over }) as unknown as Occurrence;

  it('une routine du soir de l’atelier reste « du jour » pour un poste déjà au lendemain', () => {
    setPlantTimeZone(PLANT);
    vi.useFakeTimers({ now: new Date('2026-09-30T20:00:00.000Z'), toFake: ['Date'] });
    onBrowserIn('Asia/Shanghai', () => {
      const today = todayKey();
      expect(today).toBe('2026-09-30');
      // 20:00 à l'atelier pour une routine prévue à 19:30, tolérance 15 min → en retard (et non « manquée » ou « à venir »)
      expect(occurrenceState(occurrence(), today, new Date(), 15)).toBe('late');
      expect(occurrenceState(occurrence(), today, new Date(), 45)).toBe('due');
    });
  });

  it('ponctualité jugée à l’heure de l’atelier', () => {
    setPlantTimeZone(PLANT);
    const run = (completedAt: string) => ({ completedAt }) as Occurrence['run'];
    onBrowserIn('Asia/Shanghai', () => {
      // Clôture à 19:55 à l'atelier (03:55 le lendemain au poste) : à l'heure (19:30 + 20 + 15 = 20:05)
      expect(completedOnTime(occurrence({ run: run('2026-09-30T19:55:00.000Z') }), 15)).toBe(true);
      expect(completedOnTime(occurrence({ run: run('2026-09-30T20:10:00.000Z') }), 15)).toBe(false);
    });
  });
});
