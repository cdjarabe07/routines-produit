import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useCurrentUser } from '@/app/providers/AuthProvider';
import { Button, IconButton } from '@/components/ui/Button';
import { Checkbox, FormActions, FormGrid, SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { move } from '@/features/checklists/components/ChecklistItemsEditor';
import { EVENT_TYPE, options } from '@/features/shared/labels';
import { userOptions, type Lookups } from '@/features/shared/api';
import { useForm } from '@/hooks/useForm';
import type { AgendaPoint, EventType, Meeting } from '@/types/domain';
import { addDays, todayKey } from '@/utils/date';
import { createId } from '@/utils/id';
import { required } from '@/utils/validation';
import { useSaveMeeting } from '../api';
import { DEFAULT_AGENDA, hasMinutes } from '../model';
import styles from './EventForm.module.css';

interface Values {
  title: string;
  type: EventType;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  organizerId: string;
  participantIds: string[];
  teamIds: string[];
  description: string;
  agenda: AgendaPoint[];
  repeat: boolean;
  until: string;
  weekdaysOnly: boolean;
}

interface Props {
  meeting?: Meeting;
  lookups: Lookups;
  /** Types proposés (réunions seules, ou tout l'agenda) */
  types: EventType[];
  defaultType: EventType;
  defaultDate?: string;
  onDone: () => void;
}

/** Création et modification d'un événement d'agenda (réunion, briefing, formation, audit…). */
export function EventForm({ meeting, lookups, types, defaultType, defaultDate, onDone }: Props) {
  const me = useCurrentUser();
  const save = useSaveMeeting();
  const [search, setSearch] = useState('');
  const form = useForm<Values>({
    initial: {
      title: meeting?.title ?? '',
      type: meeting?.type ?? defaultType,
      date: meeting?.date ?? defaultDate ?? todayKey(),
      startTime: meeting?.startTime ?? '09:00',
      endTime: meeting?.endTime ?? '09:30',
      location: meeting?.location ?? '',
      organizerId: meeting?.organizerId ?? me.id,
      participantIds: meeting?.participantIds ?? [],
      teamIds: meeting?.teamIds ?? [],
      description: meeting?.description ?? '',
      agenda: meeting?.agenda ?? (hasMinutes(defaultType) ? DEFAULT_AGENDA.map((label) => ({ id: createId(), label, done: false })) : []),
      repeat: false,
      until: addDays(defaultDate ?? todayKey(), 13),
      weekdaysOnly: true,
    },
    rules: {
      title: [required('Donnez un titre')],
      date: [required('Indiquez la date')],
      startTime: [required('Heure de début obligatoire')],
      endTime: [required('Heure de fin obligatoire'), (v, all) => (v <= all.startTime ? 'Doit suivre l’heure de début' : null)],
      organizerId: [required('Choisissez un responsable')],
      until: [(v, all) => (all.repeat && (!v || v < all.date) ? 'Doit suivre la date de début' : null)],
    },
    onSubmit: async (v) => {
      await save.mutateAsync({
        id: meeting?.id,
        actor: me,
        repeat: !meeting && v.repeat ? { until: v.until, weekdaysOnly: v.weekdaysOnly } : undefined,
        input: {
          title: v.title.trim(),
          type: v.type,
          date: v.date,
          startTime: v.startTime,
          endTime: v.endTime,
          location: v.location.trim() || undefined,
          description: v.description.trim() || undefined,
          organizerId: v.organizerId,
          participantIds: v.participantIds.filter((id) => id !== v.organizerId),
          teamIds: v.teamIds,
          agenda: v.agenda.filter((p) => p.label.trim()).map((p) => ({ ...p, label: p.label.trim() })),
        },
      });
      onDone();
    },
  });
  const { values, set, errors } = form;
  const toggle = (key: 'participantIds' | 'teamIds', id: string, on: boolean) =>
    set(key, on ? [...values[key], id] : values[key].filter((x) => x !== id));
  const people = lookups.activeUsers.filter(
    (u) => u.id !== values.organizerId && u.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <form onSubmit={form.handleSubmit} noValidate>
      <FormGrid>
        <TextField
          className="full"
          label="Titre"
          required
          value={values.title}
          onChange={(e) => set('title', e.target.value)}
          error={errors.title}
        />
        <SelectField
          label="Type"
          options={options(EVENT_TYPE).filter((o) => types.includes(o.value))}
          value={values.type}
          onChange={(e) => set('type', e.target.value as EventType)}
        />
        <SelectField
          label="Responsable"
          required
          options={userOptions(lookups.activeUsers)}
          value={values.organizerId}
          onChange={(e) => set('organizerId', e.target.value)}
          error={errors.organizerId}
        />
        <TextField
          label="Date"
          type="date"
          required
          value={values.date}
          onChange={(e) => set('date', e.target.value)}
          error={errors.date}
        />
        <TextField
          label="Lieu"
          value={values.location}
          onChange={(e) => set('location', e.target.value)}
          placeholder="Salle, ligne, poste…"
        />
        <TextField
          label="Heure de début"
          type="time"
          required
          value={values.startTime}
          onChange={(e) => set('startTime', e.target.value)}
          error={errors.startTime}
        />
        <TextField
          label="Heure de fin"
          type="time"
          required
          value={values.endTime}
          onChange={(e) => set('endTime', e.target.value)}
          error={errors.endTime}
        />
        <TextAreaField
          className="full"
          label="Description"
          rows={2}
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </FormGrid>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Participants</legend>
        <p className={styles.hint}>Invitez des équipes entières et, si besoin, des personnes en plus. Chaque invité est prévenu.</p>
        <div className={styles.teams}>
          {lookups.teams
            .filter((t) => t.active)
            .map((t) => (
              <Checkbox
                key={t.id}
                label={t.name}
                description={`${lookups.teamMembers(t.id).length} membre(s)`}
                checked={values.teamIds.includes(t.id)}
                onChange={(e) => toggle('teamIds', t.id, e.target.checked)}
              />
            ))}
        </div>
        <TextField label="Rechercher une personne" value={search} onChange={(e) => setSearch(e.target.value)} className={styles.search} />
        <div className={styles.people} role="group" aria-label="Personnes invitées">
          {people.map((u) => (
            <Checkbox
              key={u.id}
              label={u.name}
              description={u.teamId && values.teamIds.includes(u.teamId) ? 'Invitée via son équipe' : undefined}
              checked={values.participantIds.includes(u.id) || Boolean(u.teamId && values.teamIds.includes(u.teamId))}
              disabled={Boolean(u.teamId && values.teamIds.includes(u.teamId))}
              onChange={(e) => toggle('participantIds', u.id, e.target.checked)}
            />
          ))}
          {people.length === 0 && <p className={styles.hint}>Aucune personne ne correspond.</p>}
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Ordre du jour</legend>
        <ol className={styles.agenda}>
          {values.agenda.map((p, i) => (
            <li key={p.id} className={styles.point}>
              <TextField
                label={`Point ${i + 1}`}
                hideLabel
                value={p.label}
                placeholder={`Point ${i + 1}`}
                onChange={(e) =>
                  set(
                    'agenda',
                    values.agenda.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)),
                  )
                }
              />
              <IconButton
                label={`Monter le point ${i + 1}`}
                size="sm"
                icon={<ArrowUp size={15} />}
                disabled={i === 0}
                onClick={() => set('agenda', move(values.agenda, i, -1))}
              />
              <IconButton
                label={`Descendre le point ${i + 1}`}
                size="sm"
                icon={<ArrowDown size={15} />}
                disabled={i === values.agenda.length - 1}
                onClick={() => set('agenda', move(values.agenda, i, 1))}
              />
              <IconButton
                label={`Supprimer le point ${i + 1}`}
                size="sm"
                icon={<Trash2 size={15} />}
                onClick={() =>
                  set(
                    'agenda',
                    values.agenda.filter((_, k) => k !== i),
                  )
                }
              />
            </li>
          ))}
        </ol>
        <Button
          size="sm"
          variant="ghost"
          icon={<Plus size={15} aria-hidden />}
          onClick={() => set('agenda', [...values.agenda, { id: createId(), label: '', done: false }])}
        >
          Ajouter un point
        </Button>
      </fieldset>

      {!meeting && (
        <fieldset className={styles.group}>
          <legend className={styles.legend}>Répétition</legend>
          <Checkbox
            label="Répéter cet événement"
            description="Crée un événement par date : chacun aura ses présences et son compte-rendu."
            checked={values.repeat}
            onChange={(e) => set('repeat', e.target.checked)}
          />
          {values.repeat && (
            <FormGrid>
              <TextField
                label="Jusqu’au (inclus)"
                type="date"
                value={values.until}
                min={values.date}
                onChange={(e) => set('until', e.target.value)}
                error={errors.until}
              />
              <div style={{ alignSelf: 'end' }}>
                <Checkbox
                  label="Du lundi au vendredi uniquement"
                  checked={values.weekdaysOnly}
                  onChange={(e) => set('weekdaysOnly', e.target.checked)}
                />
              </div>
            </FormGrid>
          )}
        </fieldset>
      )}

      <FormActions>
        <Button onClick={onDone}>Annuler</Button>
        <Button type="submit" variant="primary" loading={form.submitting}>
          {meeting ? 'Enregistrer' : 'Planifier'}
        </Button>
      </FormActions>
    </form>
  );
}
