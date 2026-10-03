import { Link, useSearchParams } from 'react-router';
import { Plus } from 'lucide-react';
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
import { formatLongDate, todayKey } from '@/utils/date';
import { cx } from '@/utils/cx';
import { AgendaCalendar, type AgendaView } from '../components/AgendaCalendar';
import { EventForm } from '../components/EventForm';
import { MEETING_STATUS } from '../model';
import styles from './AgendaAdminPage.module.css';

const ALL_TYPES = Object.keys(EVENT_TYPE) as EventType[];
const VIEWS: AgendaView[] = ['day', 'week', 'month', 'list'];
const VIEW_PARAM: Record<AgendaView, string> = { day: 'jour', week: 'semaine', month: 'mois', list: 'liste' };
const VIEW_FROM_PARAM: Record<string, AgendaView> = { jour: 'day', semaine: 'week', mois: 'month', liste: 'list' };

/** Agenda de l'atelier (jour, semaine, mois ou liste) : tous les événements (réunions, formations, audits, maintenances…). */
export function AgendaAdminPage() {
  const today = todayKey();
  const [params, setParams] = useSearchParams();
  const view = VIEW_FROM_PARAM[params.get('vue') ?? ''] ?? 'week';
  // « semaine » : ancien paramètre d'adresse, toujours accepté
  const anchor = params.get('date') ?? params.get('semaine') ?? today;
  const typeFilter = (params.get('type') as EventType | null) ?? '';
  const editingId = params.get('modifier');
  const createOn = params.get('nouveau');
  const meetings = useCollection('meetings');
  const { queries, lookups } = useLookups();

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
        <QueryBoundary queries={[meetings, ...queries]}>
          {() => (
            <AgendaCalendar
              meetings={meetings.data!.filter((m) => !typeFilter || m.type === typeFilter)}
              view={view}
              views={VIEWS}
              anchor={anchor}
              onChange={(next) =>
                setParam({
                  ...(next.view ? { vue: next.view === 'week' ? null : VIEW_PARAM[next.view] } : {}),
                  ...(next.anchor ? { date: next.anchor === today ? null : next.anchor } : {}),
                  semaine: null,
                })
              }
              eventLink={(m) => `/reunions/${m.id}`}
              onCreate={(date, time) => setParam({ nouveau: date, heure: time ?? null })}
              filters={
                <SelectField
                  label="Type d’événement"
                  placeholder="Tous les types"
                  options={options(EVENT_TYPE)}
                  value={typeFilter}
                  onChange={(e) => setParam({ type: e.target.value || null })}
                  className={styles.filter}
                />
              }
              renderList={(days) => (
                <div className={styles.grid}>
                  {days.map((day) => {
                    const events = meetings
                      .data!.filter((m) => m.date === day && (!typeFilter || m.type === typeFilter))
                      .sort((a, b) => a.startTime.localeCompare(b.startTime));
                    return (
                      <section key={day} className={cx(styles.day, day === today && styles.today)} aria-labelledby={`ag-${day}`}>
                        <header className={styles.dayHead}>
                          <h3 id={`ag-${day}`} className={styles.dayTitle}>
                            {formatLongDate(day)}
                          </h3>
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
            />
          )}
        </QueryBoundary>
      </Stack>

      <Drawer
        open={Boolean(editingId || createOn)}
        onClose={() => setParam({ modifier: null, nouveau: null, heure: null })}
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
            defaultStartTime={params.get('heure') ?? undefined}
            onDone={() => setParam({ modifier: null, nouveau: null, heure: null })}
          />
        )}
      </Drawer>
    </>
  );
}
