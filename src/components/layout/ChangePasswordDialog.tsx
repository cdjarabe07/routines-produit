import { useState, type FormEvent } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { FormActions, FormGrid, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Overlay';
import { useToast } from '@/components/ui/Toast';
import { toUserMessage } from '@/services/errors';

/** Changement de son propre mot de passe (comptes serveur). Le mot de passe actuel est revérifié par le serveur. */
export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { service } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setCurrent('');
    setNext('');
    setConfirmation('');
    setError(null);
    onClose();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== confirmation) return setError('Les deux saisies du nouveau mot de passe diffèrent.');
    if (next === current) return setError('Le nouveau mot de passe doit être différent de l’actuel.');
    setBusy(true);
    try {
      await service.changePassword!(current, next);
      toast.success('Mot de passe modifié.');
      close();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Changer le mot de passe" size="sm">
      <form onSubmit={submit} noValidate>
        <FormGrid columns={1}>
          <TextField
            label="Mot de passe actuel"
            type="password"
            autoComplete="current-password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
          <TextField
            label="Nouveau mot de passe"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            hint="12 caractères minimum. Une phrase de passe est plus simple à retenir."
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          <TextField
            label="Confirmer le nouveau mot de passe"
            type="password"
            autoComplete="new-password"
            required
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            error={error ?? undefined}
          />
        </FormGrid>
        <FormActions>
          <Button onClick={close}>Annuler</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!current || !next || !confirmation}>
            Enregistrer
          </Button>
        </FormActions>
      </form>
    </Modal>
  );
}
