import { useMemo } from 'react';
import { useCurrentUser } from '@/app/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { FormActions, FormGrid, SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { PRIORITY, options } from '@/features/shared/labels';
import { userOptions } from '@/features/shared/api';
import { useForm } from '@/hooks/useForm';
import type { Action, Priority, User } from '@/types/domain';
import { addDays, todayKey } from '@/utils/date';
import { maxLength, minLength, required } from '@/utils/validation';
import { useCreateAction, useUpdateAction } from '../api';

interface Values {
  title: string;
  description: string;
  assigneeId: string;
  backupId: string;
  priority: Priority;
  dueDate: string;
}

interface ActionFormProps {
  users: User[];
  /** Action existante : mode modification */
  action?: Action;
  /** Création : origine de l'action et valeurs proposées */
  source?: Action['source'];
  defaults?: Partial<Values>;
  onDone: (action?: Action) => void;
}

export function ActionForm({ users, action, source = { type: 'manual' }, defaults, onDone }: ActionFormProps) {
  const user = useCurrentUser();
  const create = useCreateAction();
  const update = useUpdateAction();
  const today = todayKey();

  const rules = useMemo(
    () => ({
      title: [required('Décrivez l’action'), minLength(5), maxLength(160)],
      assigneeId: [required('Choisissez un responsable')],
      dueDate: [required('Fixez une échéance'), (v: string) => (!action && v < today ? 'L’échéance ne peut pas être dans le passé' : null)],
    }),
    [action, today],
  );

  const form = useForm<Values>({
    initial: {
      title: action?.title ?? '',
      description: action?.description ?? '',
      assigneeId: action?.assigneeId ?? '',
      backupId: action?.backupId ?? '',
      priority: action?.priority ?? 'medium',
      dueDate: action?.dueDate ?? addDays(today, 3),
      ...defaults,
    },
    rules,
    onSubmit: async (v) => {
      const common = {
        title: v.title.trim(),
        description: v.description.trim() || undefined,
        assigneeId: v.assigneeId,
        backupId: v.backupId && v.backupId !== v.assigneeId ? v.backupId : undefined,
        priority: v.priority,
        dueDate: v.dueDate,
      };
      const saved = action
        ? await update.mutateAsync({ action, patch: common, actor: user })
        : await create.mutateAsync({ input: { ...common, source }, creator: user });
      onDone(saved);
    },
  });
  const { values, set, errors } = form;
  const people = userOptions(users.filter((u) => u.active));

  return (
    <form onSubmit={form.handleSubmit} noValidate>
      <FormGrid>
        <TextField className="full" label="Action" required value={values.title} onChange={(e) => set('title', e.target.value)} error={errors.title} placeholder="Ex. : remplacer l’outil de sertissage du poste 3" />
        <TextAreaField className="full" label="Détails (facultatif)" rows={2} value={values.description} onChange={(e) => set('description', e.target.value)} />
        <SelectField label="Responsable" required placeholder="Choisir…" options={people} value={values.assigneeId} onChange={(e) => set('assigneeId', e.target.value)} error={errors.assigneeId} />
        <SelectField label="Suppléant" placeholder="Aucun" options={people.filter((p) => p.value !== values.assigneeId)} value={values.backupId} onChange={(e) => set('backupId', e.target.value)} />
        <SelectField label="Priorité" options={options(PRIORITY)} value={values.priority} onChange={(e) => set('priority', e.target.value as Priority)} />
        <TextField label="Échéance" type="date" required min={action ? undefined : today} value={values.dueDate} onChange={(e) => set('dueDate', e.target.value)} error={errors.dueDate} />
      </FormGrid>
      <FormActions>
        <Button onClick={() => onDone()}>Annuler</Button>
        <Button type="submit" variant="primary" loading={form.submitting}>{action ? 'Enregistrer' : 'Créer l’action'}</Button>
      </FormActions>
    </form>
  );
}
