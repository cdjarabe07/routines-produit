import { Link, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { QueryBoundary } from '@/components/feedback/States';
import { PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { SelectField } from '@/components/ui/Field';
import { Drawer } from '@/components/ui/Overlay';
import { useLookups } from '@/features/shared/api';
import { EVENT_TYPE, options } from '@/features/shared/labels';
import { useCollection } from '@/hooks/useData';
import type { EventType } from '@/types/domain';
import { addDays, enumerateDays, formatDate, formatLongDate, startOfWeek, todayKey } from '@/utils/date';
import { cx } from '@/utils/cx';
import { EventForm } from '../components/EventForm';
import { MEETING_STATUS } from '../model';
import styles from './AgendaAdminPage.module.css';

const ALL_TYPES = Object.keys(EVENT_TYPE) as EventType[];

/** Agenda de l'atelier en semaine : tous les événements (réunions, formations, audits, maintenances…). */
export function AgendaAdminPage() {
  const today = todayKey();
  const [params, setParams] = useSearchParams();
  const weekStart = startOfWeek(params.get('semaine') ?? today);
  const typeFilter = (params.get('type') as EventType | null) ?? '';
  const editingId = params.get('modifier');
  const createOn = params.get('nouveau');
  const meetings = useCollection('meetings');
  const { queries, lookups } = useLookups();
  const days = enumerateDays(weekStart, addDays(weekStart, 6));

  const setParam = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Agenda"
        description="Réunions, briefings, formations, audits, maintenances et événements opérationnels de l’atelier."
        actions={
          <Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setParam({ nouveau: today })}>
            Nouvel événement
          </Button>
        }
      />
      <Stack>
        <div className={styles.toolbar}>
          <div className={styles.week}>
            <IconButton
              label="Semaine précédente"
              variant="secondary"
              icon={<ChevronLeft size={18} />}
              onClick={() => setParam({ semaine: addDays(weekStart, -7) })}
            />
            <span className={styles.weekLabel}>
              Semaine du {formatDate(weekStart)} au {formatDate(addDays(weekStart, 6))}
            </span>
            <IconButton
              label="Semaine suivante"
              variant="secondary"
              icon={<ChevronRight size={18} />}
              onClick={() => setParam({ semaine: addDays(weekStart, 7) })}
            />
            {(today < weekStart || today > addDays(weekStart, 6)) && (
              <Button size="sm" variant="ghost" onClick={() => setParam({ semaine: null })}>
                Cette semaine
              </Button>
            )}
          </div>
          <SelectField
            label="Type d’événement"
            placeholder="Tous les types"
            options={options(EVENT_TYPE)}
            value={typeFilter}
            onChange={(e) => setParam({ type: e.target.value || null })}
            className={styles.filter}
          />
        </div>

        <QueryBoundary queries={[meetings, ...queries]}>
          {() => (
            <div className={styles.grid}>
              {days.map((day) => {
                const events = meetings
                  .data!.filter((m) => m.date === day && (!typeFilter || m.type === typeFilter))
                  .sort((a, b) => a.startTime.localeCompare(b.startTime));
                return (
                  <section key={day} className={cx(styles.day, day === today && styles.today)} aria-labelledby={`ag-${day}`}>
                    <header className={styles.dayHead}>
                      <h2 id={`ag-${day}`} className={styles.dayTitle}>
                        {formatLongDate(day)}
                      </h2>
                      <IconButton
                        label={`Ajouter un événement le ${formatLongDate(day)}`}
                        size="sm"
                        icon={<Plus size={15} />}
                        onClick={() => setParam({ nouveau: day })}
                      />
                    </header>
                    {events.length === 0 ? (
                      <p className={styles.empty}>Aucun événement.</p>
                    ) : (
                      <ul className={styles.events}>
                        {events.map((m) => (
                          <li key={m.id} className={cx(styles.event, m.status === 'cancelled' && styles.cancelled)}>
                            <span className={styles.time}>
                              {m.startTime}–{m.endTime}
                            </span>
                            <Link to={`/reunions/${m.id}`} className={styles.title}>
                              {m.title}
                            </Link>
                            <span className={styles.meta}>
                              {EVENT_TYPE[m.type]}
                              {m.location && ` · ${m.location}`}
                            </span>
                            <span className={styles.foot}>
                              <Badge tone={MEETING_STATUS[m.status].tone}>{MEETING_STATUS[m.status].label}</Badge>
                              {m.status !== 'done' && m.status !== 'cancelled' && (
                                <button type="button" className={styles.edit} onClick={() => setParam({ modifier: m.id })}>
                                  Modifier
                                </button>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </QueryBoundary>
      </Stack>

      <Drawer
        open={Boolean(editingId || createOn)}
        onClose={() => setParam({ modifier: null, nouveau: null })}
        title={editingId ? 'Modifier l’événement' : 'Nouvel événement'}
        size="lg"
      >
        {(editingId || createOn) && lookups && meetings.data && (
          <EventForm
            key={editingId ?? `new-${createOn}`}
            meeting={editingId ? meetings.data.find((m) => m.id === editingId) : undefined}
            lookups={lookups}
            types={ALL_TYPES}
            defaultType="training"
            defaultDate={createOn ?? undefined}
            onDone={() => setParam({ modifier: null, nouveau: null })}
          />
        )}
      </Drawer>
    </>
  );
}
