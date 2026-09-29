import { useCurrentUser } from '@/app/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Checkbox, FormActions, FormGrid, SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { Tabs } from '@/components/ui/Tabs';
import { lineOptions, teamOptions, userOptions, workstationOptions, type Lookups } from '@/features/shared/api';
import { useForm } from '@/hooks/useForm';
import type { Recurrence, RoutineTemplate, Schedule } from '@/types/domain';
import { formatLongDate, todayKey } from '@/utils/date';
import { required } from '@/utils/validation';
import { useSaveSchedule } from '../api';
import { RECURRENCE_LABELS, WEEKDAY_SHORT, nextDates } from '../model';
import styles from './ScheduleForm.module.css';

interface Values {
  routineId: string;
  startDate: string;
  time: string;
  recurrence: Recurrence;
  weekdays: number[];
  endDate: string;
  target: 'person' | 'team';
  assigneeId: string;
  teamId: string;
  lineId: string;
  workstationId: string;
  note: string;
}

interface Props {
  schedule?: Schedule;
  routines: RoutineTemplate[];
  initialRoutineId?: string;
  lookups: Lookups;
  onDone: () => void;
}

/** Programmer une routine : date, heure, répétition, personne ou équipe, zone et poste. */
export function ScheduleForm({ schedule, routines, initialRoutineId, lookups, onDone }: Props) {
  const me = useCurrentUser();
  const save = useSaveSchedule();
  const initialRoutine = routines.find((r) => r.id === (schedule?.routineId ?? initialRoutineId));
  const form = useForm<Values>({
    initial: {
      routineId: initialRoutine?.id ?? '',
      startDate: schedule?.startDate ?? todayKey(),
      time: schedule?.time ?? initialRoutine?.defaultTime ?? '08:00',
      recurrence: schedule?.recurrence ?? 'weekdays',
      weekdays: schedule?.weekdays ?? [1, 2, 3, 4, 5],
      endDate: schedule?.endDate ?? '',
      target: schedule?.teamId ? 'team' : 'person',
      assigneeId: schedule?.assigneeId ?? '',
      teamId: schedule?.teamId ?? '',
      lineId: schedule?.lineId ?? initialRoutine?.lineId ?? '',
      workstationId: schedule?.workstationId ?? initialRoutine?.workstationId ?? '',
      note: schedule?.note ?? '',
    },
    rules: {
      routineId: [required('Choisissez une routine')],
      startDate: [required('Indiquez la date')],
      time: [required('Indiquez l’heure')],
      assigneeId: [(v, all) => (all.target === 'person' && !v ? 'Choisissez la personne' : null)],
      teamId: [(v, all) => (all.target === 'team' && !v ? 'Choisissez l’équipe' : null)],
      weekdays: [(v, all) => (all.recurrence === 'weekly' && v.length === 0 ? 'Choisissez au moins un jour' : null)],
      endDate: [(v, all) => (v && v < all.startDate ? 'Doit suivre la date de début' : null)],
    },
    onSubmit: async (v) => {
      await save.mutateAsync({
        id: schedule?.id,
        actor: me,
        input: {
          routineId: v.routineId,
          startDate: v.startDate,
          time: v.time,
          recurrence: v.recurrence,
          weekdays: v.recurrence === 'weekly' ? [...v.weekdays].sort() : [],
          endDate: v.recurrence === 'once' ? undefined : v.endDate || undefined,
          assigneeId: v.target === 'person' ? v.assigneeId : undefined,
          teamId: v.target === 'team' ? v.teamId : undefined,
          lineId: v.lineId || undefined,
          workstationId: v.workstationId || undefined,
          note: v.note.trim() || undefined,
        },
      });
      onDone();
    },
  });
  const { values, set, errors } = form;
  const routine = routines.find((r) => r.id === values.routineId);
  const preview = nextDates(
    {
      id: 'preview',
      routineId: values.routineId,
      startDate: values.startDate,
      endDate: values.endDate || undefined,
      time: values.time,
      recurrence: values.recurrence,
      weekdays: values.weekdays,
      status: 'active',
      skippedDates: schedule?.skippedDates ?? [],
      createdBy: me.id,
      createdAt: '',
      updatedAt: '',
    },
    values.startDate > todayKey() ? values.startDate : todayKey(),
    5,
  );
  const stations = values.lineId ? lookups.workstations.filter((w) => w.lineId === values.lineId) : lookups.workstations;

  return (
    <form onSubmit={form.handleSubmit} noValidate>
      <FormGrid>
        <SelectField
          className="full"
          label="Routine"
          required
          placeholder="Choisir une routine"
          options={routines
            .filter((r) => r.active || r.id === schedule?.routineId)
            .map((r) => ({ value: r.id, label: `${r.title} (${r.durationMin} min)` }))}
          value={values.routineId}
          disabled={Boolean(schedule)}
          hint={
            schedule ? 'La routine d’une planification existante ne se change pas : annulez-la et programmez-en une nouvelle.' : undefined
          }
          onChange={(e) => {
            const r = routines.find((x) => x.id === e.target.value);
            set('routineId', e.target.value);
            if (r) {
              set('time', r.defaultTime);
              set('lineId', r.lineId ?? '');
              set('workstationId', r.workstationId ?? '');
            }
          }}
          error={errors.routineId}
        />
        <TextField
          label={values.recurrence === 'once' ? 'Date' : 'À partir du'}
          type="date"
          required
          value={values.startDate}
          onChange={(e) => set('startDate', e.target.value)}
          error={errors.startDate}
        />
        <TextField
          label="Heure"
          type="time"
          required
          value={values.time}
          onChange={(e) => set('time', e.target.value)}
          error={errors.time}
        />
        <SelectField
          label="Répétition"
          options={(Object.keys(RECURRENCE_LABELS) as Recurrence[]).map((r) => ({ value: r, label: RECURRENCE_LABELS[r] }))}
          value={values.recurrence}
          onChange={(e) => set('recurrence', e.target.value as Recurrence)}
        />
        {values.recurrence !== 'once' && (
          <TextField
            label="Jusqu’au (facultatif)"
            type="date"
            value={values.endDate}
            min={values.startDate}
            onChange={(e) => set('endDate', e.target.value)}
            error={errors.endDate}
          />
        )}
        {values.recurrence === 'weekly' && (
          <fieldset className={`full ${styles.days}`}>
            <legend className={styles.legend}>Jours</legend>
            {WEEKDAY_SHORT.map((label, i) => (
              <Checkbox
                key={label}
                label={label}
                checked={values.weekdays.includes(i + 1)}
                onChange={(e) =>
                  set('weekdays', e.target.checked ? [...values.weekdays, i + 1] : values.weekdays.filter((d) => d !== i + 1))
                }
              />
            ))}
            {errors.weekdays && (
              <p className={styles.error} role="alert">
                {errors.weekdays}
              </p>
            )}
          </fieldset>
        )}
      </FormGrid>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Affectation</legend>
        <Tabs
          variant="segmented"
          label="Affecter à"
          value={values.target}
          onChange={(t) => set('target', t)}
          items={[
            { value: 'person', label: 'Une personne' },
            { value: 'team', label: 'Une équipe' },
          ]}
        />
        <div className={styles.target}>
          {values.target === 'person' ? (
            <SelectField
              label="Personne"
              required
              placeholder="Choisir"
              options={userOptions(lookups.activeUsers)}
              value={values.assigneeId}
              onChange={(e) => set('assigneeId', e.target.value)}
              error={errors.assigneeId}
            />
          ) : (
            <SelectField
              label="Équipe"
              required
              placeholder="Choisir"
              options={teamOptions(lookups.teams)}
              value={values.teamId}
              onChange={(e) => set('teamId', e.target.value)}
              error={errors.teamId}
              hint={
                values.teamId
                  ? `Visible par : ${
                      lookups
                        .teamMembers(values.teamId)
                        .map((u) => u.name)
                        .join(', ') || 'aucun membre actif'
                    }`
                  : 'Tous les membres de l’équipe verront la routine ; le premier qui la démarre l’exécute.'
              }
            />
          )}
        </div>
      </fieldset>

      <FormGrid>
        <SelectField
          label="Zone (ligne)"
          placeholder="Aucune zone précise"
          options={lineOptions(lookups.lines)}
          value={values.lineId}
          onChange={(e) => {
            set('lineId', e.target.value);
            set('workstationId', '');
          }}
        />
        <SelectField
          label="Poste"
          placeholder="Aucun poste précis"
          options={workstationOptions(stations)}
          value={values.workstationId}
          onChange={(e) => set('workstationId', e.target.value)}
        />
        <TextAreaField
          className="full"
          label="Note pour l’exécutant (facultative)"
          rows={2}
          value={values.note}
          onChange={(e) => set('note', e.target.value)}
        />
      </FormGrid>

      {routine && (
        <div className={styles.preview} aria-live="polite">
          <strong>Prochaines occurrences</strong>
          {preview.length ? (
            <ul>
              {preview.map((d) => (
                <li key={d}>
                  {formatLongDate(d)} à {values.time}
                </li>
              ))}
            </ul>
          ) : (
            <p>Aucune occurrence à venir avec ces réglages.</p>
          )}
        </div>
      )}

      <FormActions>
        <Button onClick={onDone}>Annuler</Button>
        <Button type="submit" variant="primary" loading={form.submitting}>
          {schedule ? 'Enregistrer' : 'Programmer'}
        </Button>
      </FormActions>
    </form>
  );
}
