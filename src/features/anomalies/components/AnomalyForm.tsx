import { useMemo } from 'react';
import { useCurrentUser } from '@/app/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { FormActions, FormGrid, SelectField, TextAreaField } from '@/components/ui/Field';
import { PhotoInput } from '@/components/ui/PhotoInput';
import { ANOMALY_CATEGORY, SEVERITY, options } from '@/features/shared/labels';
import { workstationOptions } from '@/features/shared/api';
import { useForm } from '@/hooks/useForm';
import type { Anomaly, AnomalyCategory, Severity, Workstation } from '@/types/domain';
import { maxLength, minLength, required } from '@/utils/validation';
import { useCreateAnomaly } from '../api';

interface Values {
  description: string;
  category: AnomalyCategory | '';
  severity: Severity;
  workstationId: string;
  photo?: string;
}

interface AnomalyFormProps {
  workstations: Workstation[];
  initial?: Partial<Values>;
  origin: Anomaly['origin'];
  onCreated: (anomaly: Anomaly) => void;
  onCancel?: () => void;
  submitLabel?: string;
}

/** Formulaire de déclaration d'anomalie, commun à tous les points d'entrée (QR, routine, LQC, Andon). */
export function AnomalyForm({
  workstations,
  initial,
  origin,
  onCreated,
  onCancel,
  submitLabel = 'Enregistrer l’anomalie',
}: AnomalyFormProps) {
  const user = useCurrentUser();
  const create = useCreateAnomaly();
  const rules = useMemo(
    () => ({
      description: [required('Décrivez le problème constaté'), minLength(8), maxLength(600)],
      category: [required('Choisissez une catégorie')],
    }),
    [],
  );
  const form = useForm<Values>({
    initial: { description: '', category: '', severity: 'minor', workstationId: '', ...initial },
    rules,
    onSubmit: async (v) => {
      const anomaly = await create.mutateAsync({
        input: {
          description: v.description.trim(),
          category: v.category as AnomalyCategory,
          severity: v.severity,
          workstationId: v.workstationId || undefined,
          photo: v.photo,
          origin,
        },
        reporter: user,
      });
      onCreated(anomaly);
    },
  });
  const { values, set, errors } = form;

  return (
    <form onSubmit={form.handleSubmit} noValidate>
      <FormGrid>
        <TextAreaField
          className="full"
          label="Description du problème"
          required
          rows={3}
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
          error={errors.description}
          placeholder="Ex. : connecteur mal positionné sur le faisceau en sortie de poste"
        />
        <SelectField
          label="Catégorie"
          required
          placeholder="Choisir…"
          options={options(ANOMALY_CATEGORY)}
          value={values.category}
          onChange={(e) => set('category', e.target.value as AnomalyCategory)}
          error={errors.category}
        />
        <SelectField
          label="Gravité"
          options={options(SEVERITY)}
          value={values.severity}
          onChange={(e) => set('severity', e.target.value as Severity)}
          hint={values.severity === 'critical' ? 'Les Line Leaders et le manager seront notifiés.' : undefined}
        />
        <SelectField
          className="full"
          label="Poste concerné"
          placeholder="Non précisé"
          options={workstationOptions(workstations)}
          value={values.workstationId}
          onChange={(e) => set('workstationId', e.target.value)}
        />
        <div className="full">
          <PhotoInput value={values.photo} onChange={(p) => set('photo', p)} />
        </div>
      </FormGrid>
      <FormActions>
        {onCancel && <Button onClick={onCancel}>Annuler</Button>}
        <Button type="submit" variant="primary" loading={form.submitting}>
          {submitLabel}
        </Button>
      </FormActions>
    </form>
  );
}
