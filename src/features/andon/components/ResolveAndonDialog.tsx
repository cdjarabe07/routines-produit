import { useCurrentUser } from '@/app/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Checkbox, FormActions, FormGrid, TextAreaField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Overlay';
import { useForm } from '@/hooks/useForm';
import type { AndonAlert } from '@/types/domain';
import { required } from '@/utils/validation';
import { useResolveAndon } from '../api';

interface Values {
  rootCause: string;
  resolution: string;
  createFollowUp: boolean;
}

export function ResolveAndonDialog({
  alert,
  stationName,
  onClose,
}: {
  alert: AndonAlert | null;
  stationName: string;
  onClose: () => void;
}) {
  const user = useCurrentUser();
  const resolve = useResolveAndon();
  const form = useForm<Values>({
    initial: { rootCause: '', resolution: '', createFollowUp: false },
    rules: { rootCause: [required('Indiquez la cause identifiée')], resolution: [required('Indiquez ce qui a été fait')] },
    onSubmit: async (v) => {
      await resolve.mutateAsync({ alert: alert!, user, ...v });
      form.reset();
      onClose();
    },
  });
  const { values, set, errors } = form;

  return (
    <Modal
      open={alert !== null}
      onClose={() => {
        form.reset();
        onClose();
      }}
      title={`Résoudre l’Andon — ${stationName}`}
      description={alert?.detail}
      size="md"
    >
      <form onSubmit={form.handleSubmit} noValidate>
        <FormGrid columns={1}>
          <TextAreaField
            label="Cause identifiée"
            required
            rows={2}
            value={values.rootCause}
            onChange={(e) => set('rootCause', e.target.value)}
            error={errors.rootCause}
          />
          <TextAreaField
            label="Action réalisée"
            required
            rows={2}
            value={values.resolution}
            onChange={(e) => set('resolution', e.target.value)}
            error={errors.resolution}
          />
          <Checkbox
            label="Créer une anomalie pour le suivi"
            description="À cocher si la cause doit être traitée durablement (action corrective)."
            checked={values.createFollowUp}
            onChange={(e) => set('createFollowUp', e.target.checked)}
          />
        </FormGrid>
        <FormActions>
          <Button
            onClick={() => {
              form.reset();
              onClose();
            }}
          >
            Annuler
          </Button>
          <Button type="submit" variant="success" loading={form.submitting}>
            Marquer résolu
          </Button>
        </FormActions>
      </form>
    </Modal>
  );
}
