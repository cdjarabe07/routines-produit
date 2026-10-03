import { type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { WEEKDAY_SHORT } from '@/features/planning/model';
import { EVENT_TYPE } from '@/features/shared/labels';
import { useNow } from '@/hooks/useNow';
import type { DateKey, EventType, Meeting } from '@/types/domain';
import { formatDate, formatLongDate, formatMonth, isoWeekday, minutesOfDay, toDateKey, todayKey } from '@/utils/date';
import { cx } from '@/utils/cx';
import { MEETING_STATUS } from '../model';
import { hourRange, layoutDay, periodDays, shiftAnchor, slotTime, type CalendarView } from '../calendar';
import styles from './AgendaCalendar.module.css';

export type AgendaView = CalendarView | 'list';

const VIEW_LABEL: Record<AgendaView, string> = { day: 'Jour', week: 'Semaine', month: 'Mois', list: 'Liste' };
const HOUR_PX = 48;
const MONTH_VISIBLE = 3;

interface Props {
  meetings: Meeting[];
  view: AgendaView;
  views: AgendaView[];
  anchor: DateKey;
  onChange: (next: { view?: AgendaView; anchor?: DateKey }) => void;
  /** Lien d'un événement */
  eventLink: (m: Meeting) => string;
  /** Création au clic sur un créneau libre (absent = consultation seule) */
  onCreate?: (date: DateKey, time?: string) => void;
  /** Contenu de la vue « Liste » (même période qu'une semaine) */
  renderList?: (days: DateKey[]) => ReactNode;
  /** Filtres affichés dans la barre d'outils */
  filters?: ReactNode;
}

/** Calendrier de l'agenda : vues Jour, Semaine, Mois (et Liste fournie par l'écran). */
export function AgendaCalendar({ meetings, view, views, anchor, onChange, eventLink, onCreate, renderList, filters }: Props) {
  const today = todayKey();
  const calendarView: CalendarView = view === 'list' ? 'week' : view;
  const days = periodDays(calendarView, anchor);
  const inPeriod = view === 'month' ? anchor.slice(0, 7) === today.slice(0, 7) : days.includes(today);

  const label =
    view === 'day'
      ? formatLongDate(anchor)
      : view === 'month'
        ? formatMonth(anchor)
        : `Semaine du ${formatDate(days[0]!)} au ${formatDate(days[6]!)}`;

  const byDay = new Map<DateKey, Meeting[]>();
  for (const m of meetings) {
    const list = byDay.get(m.date);
    if (list) list.push(m);
    else byDay.set(m.date, [m]);
  }
  const openDay = (date: DateKey) => onChange({ view: 'day', anchor: date });

  return (
    <div className={styles.calendar}>
      <div className={styles.toolbar}>
        <div className={styles.period}>
          <IconButton
            label="Période précédente"
            variant="secondary"
            icon={<ChevronLeft size={18} />}
            onClick={() => onChange({ anchor: shiftAnchor(calendarView, anchor, -1) })}
          />
          <IconButton
            label="Période suivante"
            variant="secondary"
            icon={<ChevronRight size={18} />}
            onClick={() => onChange({ anchor: shiftAnchor(calendarView, anchor, 1) })}
          />
          <h2 className={styles.periodLabel} aria-live="polite">
            {label}
          </h2>
          {!inPeriod && (
            <Button size="sm" variant="ghost" onClick={() => onChange({ anchor: today })}>
              Aujourd’hui
            </Button>
          )}
        </div>
        <div className={styles.controls}>
          {filters}
          <Tabs
            label="Affichage de l’agenda"
            variant="segmented"
            items={views.map((v) => ({ value: v, label: VIEW_LABEL[v] }))}
            value={view}
            onChange={(v) => onChange({ view: v })}
          />
        </div>
      </div>

      <Legend meetings={meetings} />

      {view === 'list' && renderList ? (
        renderList(days)
      ) : view === 'month' ? (
        <MonthGrid days={days} anchor={anchor} today={today} byDay={byDay} eventLink={eventLink} onOpenDay={openDay} onCreate={onCreate} />
      ) : (
        <TimeGrid days={days} today={today} byDay={byDay} eventLink={eventLink} onOpenDay={openDay} onCreate={onCreate} />
      )}
    </div>
  );
}

function Legend({ meetings }: { meetings: Meeting[] }) {
  const types = (Object.keys(EVENT_TYPE) as EventType[]).filter((t) => meetings.some((m) => m.type === t));
  if (types.length === 0) return null;
  return (
    <ul className={styles.legend} aria-label="Types d’événements">
      {types.map((t) => (
        <li key={t} className={styles[`type_${t}`]}>
          <span className={styles.swatch} aria-hidden />
          {EVENT_TYPE[t]}
        </li>
      ))}
    </ul>
  );
}

interface GridProps {
  days: DateKey[];
  today: DateKey;
  byDay: Map<DateKey, Meeting[]>;
  eventLink: (m: Meeting) => string;
  onOpenDay: (date: DateKey) => void;
  onCreate?: (date: DateKey, time?: string) => void;
}

const dayHeading = (date: DateKey) => `${WEEKDAY_SHORT[isoWeekday(date) - 1]} ${Number(date.slice(8))}`;

/* ---------- Jour et semaine : axe horaire ---------- */

function TimeGrid({ days, today, byDay, eventLink, onOpenDay, onCreate }: GridProps) {
  const now = useNow(60_000);
  const visible = days.flatMap((d) => byDay.get(d) ?? []);
  const [fromHour, toHour] = hourRange(visible);
  const hours = Array.from({ length: toHour - fromHour }, (_, i) => fromHour + i);
  const height = hours.length * HOUR_PX;
  const nowMin = minutesOfDay(now);
  const showNow = toDateKey(now) === today && nowMin >= fromHour * 60 && nowMin <= toHour * 60;
  const single = days.length === 1;

  const createAt = (date: DateKey) => (e: MouseEvent<HTMLDivElement>) => {
    if (!onCreate || e.target !== e.currentTarget) return;
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    onCreate(date, slotTime(fromHour * 60 + (y / HOUR_PX) * 60));
  };

  return (
    <div className={cx(styles.timeGrid, single && styles.single)}>
      <div className={styles.timeHead}>
        <span className={styles.corner} />
        {days.map((d) => (
          <div key={d} className={cx(styles.dayHead, d === today && styles.todayHead)}>
            {single ? (
              <span>{formatLongDate(d)}</span>
            ) : (
              <button type="button" className={styles.dayLink} onClick={() => onOpenDay(d)} aria-label={`Voir le ${formatLongDate(d)}`}>
                {dayHeading(d)}
              </button>
            )}
            {onCreate && (
              <IconButton
                label={`Ajouter un événement le ${formatLongDate(d)}`}
                size="sm"
                icon={<Plus size={14} />}
                onClick={() => onCreate(d)}
              />
            )}
          </div>
        ))}
      </div>
      <div className={styles.timeBody} style={{ height }}>
        <div className={styles.hours} aria-hidden>
          {hours.map((h) => (
            <span key={h} style={{ top: (h - fromHour) * HOUR_PX }}>
              {String(h).padStart(2, '0')}:00
            </span>
          ))}
        </div>
        {days.map((d) => {
          const placed = layoutDay(byDay.get(d) ?? []);
          return (
            <div
              key={d}
              className={cx(styles.dayColumn, d === today && styles.todayColumn, onCreate && styles.creatable)}
              style={{ backgroundSize: `100% ${HOUR_PX}px` }}
              onClick={createAt(d)}
              title={onCreate ? 'Cliquer pour créer un événement à cette heure' : undefined}
            >
              {placed.map(({ meeting: m, start, end, column, columns }) => {
                const top = ((start - fromHour * 60) / 60) * HOUR_PX;
                const h = ((end - start) / 60) * HOUR_PX;
                return (
                  <Link
                    key={m.id}
                    to={eventLink(m)}
                    className={cx(
                      styles.event,
                      styles[`type_${m.type}`],
                      m.status === 'cancelled' && styles.cancelled,
                      h < 36 && styles.compactEvent,
                    )}
                    style={{ top, height: h - 2, left: `calc(${(column / columns) * 100}% + 2px)`, width: `calc(${100 / columns}% - 4px)` }}
                    title={`${m.startTime}–${m.endTime} · ${m.title}${m.location ? ` · ${m.location}` : ''} (${MEETING_STATUS[m.status].label})`}
                  >
                    <span className={styles.eventTime}>
                      {m.startTime}–{m.endTime}
                    </span>
                    <span className={styles.eventTitle}>{m.title}</span>
                    {h >= 60 && m.location && <span className={styles.eventMeta}>{m.location}</span>}
                  </Link>
                );
              })}
              {showNow && d === today && (
                <span className={styles.nowLine} style={{ top: ((nowMin - fromHour * 60) / 60) * HOUR_PX }} aria-hidden />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Mois ---------- */

function MonthGrid({ days, anchor, today, byDay, eventLink, onOpenDay, onCreate }: GridProps & { anchor: DateKey }) {
  const month = anchor.slice(0, 7);
  return (
    <div className={styles.month}>
      <div className={styles.monthHead} aria-hidden>
        {WEEKDAY_SHORT.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className={styles.monthGrid}>
        {days.map((d) => {
          const events = [...(byDay.get(d) ?? [])].sort((a, b) => a.startTime.localeCompare(b.startTime));
          const hidden = events.length - MONTH_VISIBLE;
          return (
            <div
              key={d}
              className={cx(
                styles.monthCell,
                d.slice(0, 7) !== month && styles.outside,
                d === today && styles.todayCell,
                onCreate && styles.creatable,
              )}
              onClick={(e) => onCreate && e.target === e.currentTarget && onCreate(d)}
            >
              <button type="button" className={styles.monthDay} onClick={() => onOpenDay(d)} aria-label={`Voir le ${formatLongDate(d)}`}>
                {Number(d.slice(8))}
              </button>
              <ul className={styles.monthEvents}>
                {events.slice(0, MONTH_VISIBLE).map((m) => (
                  <li key={m.id}>
                    <Link
                      to={eventLink(m)}
                      className={cx(styles.monthEvent, styles[`type_${m.type}`], m.status === 'cancelled' && styles.cancelled)}
                      title={`${m.startTime}–${m.endTime} · ${m.title}`}
                    >
                      <span className={styles.eventTime}>{m.startTime}</span> {m.title}
                    </Link>
                  </li>
                ))}
              </ul>
              {hidden > 0 && (
                <button type="button" className={styles.more} onClick={() => onOpenDay(d)}>
                  + {hidden} autre{hidden > 1 ? 's' : ''}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
