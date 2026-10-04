import { Link, useNavigate } from 'react-router';
import { ChevronRight, Play } from 'lucide-react';
import { useAuth, useCurrentUser } from '@/app/providers/AuthProvider';
import { Badge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Progress } from '@/components/ui/Progress';
import { OCCURRENCE_STATE, isMultiSlot, occurrencePath } from '@/features/planning/model';
import { useStartRoutine } from '@/features/routines/api';
import { runSummary } from '@/features/routines/model';
import type { Checklist, ID } from '@/types/domain';
import { formatShortDate, todayKey } from '@/utils/date';
import { cx } from '@/utils/cx';
import type { MyOccurrence } from '../model';
import styles from './OccurrenceCard.module.css';

interface Props {
  occurrence: MyOccurrence;
  checklists: Map<ID, Checklist>;
  zone?: string;
  /** Mise en avant (activité en cours sur le tableau de bord) */
  emphasis?: boolean;
}

/** Carte d'une routine planifiée : heure, durée, état et action principale (Démarrer, Reprendre, Voir). */
export function OccurrenceCard({ occurrence: o, checklists, zone, emphasis }: Props) {
  const user = useCurrentUser();
  const { can } = useAuth();
  const navigate = useNavigate();
  const start = useStartRoutine();
  const to = occurrencePath(o);
  const summary = runSummary(o.routine, checklists, o.run);
  const isToday = o.date === todayKey();
  const canStart = isToday && !o.run && can('routine.execute');

  return (
    <article className={cx(styles.card, emphasis && styles.emphasis, styles[o.state])} aria-labelledby={`occ-${o.key}`}>
      <div className={styles.when}>
        <span className={styles.time}>{o.time}</span>
        {!isToday && <span className={styles.date}>{formatShortDate(o.date)}</span>}
      </div>
      <div className={styles.body}>
        <h3 id={`occ-${o.key}`} className={styles.title}>
          <Link to={to}>{o.routine.title}</Link>
        </h3>
        <p className={styles.meta}>
          {o.routine.durationMin} min · {o.routine.tasks.length} tâche(s)
          {zone && ` · ${zone}`}
        </p>
        {o.run && !o.run.completedAt && (
          <div className={styles.progress}>
            <Progress value={summary.tasksDone} max={summary.tasks} label={`Avancement ${o.routine.title}`} size="sm" tone="info" />
            <span>
              {summary.tasksDone}/{summary.tasks}
            </span>
          </div>
        )}
        {o.run?.completedAt && summary.durationMin !== null && <p className={styles.meta}>Terminée en {summary.durationMin} min</p>}
      </div>
      <div className={styles.side}>
        <Badge tone={OCCURRENCE_STATE[o.state].tone}>{OCCURRENCE_STATE[o.state].label}</Badge>
        {canStart ? (
          <Button
            variant={o.state === 'upcoming' ? 'secondary' : 'primary'}
            size={emphasis ? 'lg' : 'md'}
            icon={<Play size={16} aria-hidden />}
            loading={start.isPending}
            aria-label={`Démarrer ${o.routine.title}`}
            onClick={async () => {
              await start.mutateAsync({ schedule: o.schedule, date: o.date, slot: isMultiSlot(o.schedule) ? o.time : undefined, user });
              navigate(to);
            }}
          >
            Démarrer
          </Button>
        ) : o.state === 'in_progress' ? (
          <ButtonLink to={to} variant="primary" size={emphasis ? 'lg' : 'md'} aria-label={`Reprendre ${o.routine.title}`}>
            Reprendre
          </ButtonLink>
        ) : (
          <ButtonLink to={to} variant="ghost" iconRight={<ChevronRight size={16} aria-hidden />} aria-label={`Voir ${o.routine.title}`}>
            Voir
          </ButtonLink>
        )}
      </div>
    </article>
  );
}
