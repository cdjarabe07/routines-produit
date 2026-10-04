import { useState, type FormEvent } from 'react';
import { Zap } from 'lucide-react';
import { useCurrentUser } from '@/app/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { FormActions, FormGrid, SelectField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Overlay';
import type { Schedule } from '@/types/domain';
import { useTriggerRoutine } from '../api';
import { TRIGGER_REASONS } from '../model';

const OTHER = '__autre__';

/** Déclencher une routine sur événement : choix du motif, puis occurrence créée à l'heure actuelle. */
export function TriggerButton({ schedule, title, size = 'sm' }: { schedule: Schedule; title: string; size?: 'sm' | 'md' }) {
  const user = useCurrentUser();
  const trigger = useTriggerRoutine();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<string>(TRIGGER_REASONS[0]!);
  const [other, setOther] = useState('');
  const reason = choice === OTHER ? other.trim() : choice;

  const close = () => {
    setOpen(false);
    setChoice(TRIGGER_REASONS[0]!);
    setOther('');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await trigger.mutateAsync({ schedule, reason, user });
    close();
  };

  return (
    <>
      <Button size={size} icon={<Zap size={15} aria-hidden />} aria-label={`Déclencher ${title}`} onClick={() => setOpen(true)}>
        Déclencher
      </Button>
      <Modal
        open={open}
        onClose={close}
        title={`Déclencher « ${title} »`}
        description="La routine est ajoutée maintenant au travail des personnes affectées, qui sont prévenues."
        size="sm"
      >
        <form onSubmit={submit} noValidate>
          <FormGrid columns={1}>
            <SelectField
              label="Motif"
              options={[...TRIGGER_REASONS.map((r) => ({ value: r, label: r })), { value: OTHER, label: 'Autre motif…' }]}
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
            />
            {choice === OTHER && (
              <TextField label="Précisez le motif" required maxLength={200} value={other} onChange={(e) => setOther(e.target.value)} />
            )}
          </FormGrid>
          <FormActions>
            <Button onClick={close}>Annuler</Button>
            <Button type="submit" variant="primary" loading={trigger.isPending} disabled={reason.length < 2}>
              Déclencher
            </Button>
          </FormActions>
        </form>
      </Modal>
    </>
  );
}
