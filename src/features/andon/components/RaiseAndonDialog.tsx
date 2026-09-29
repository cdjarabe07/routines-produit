import { useState } from 'react';
import { useCurrentUser } from '@/app/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { TextAreaField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Overlay';
import type { AndonType, AndonUrgency, Line, Workstation } from '@/types/domain';
import { cx } from '@/utils/cx';
import { useRaiseAndon } from '../api';
import { ANDON_PRESETS, ANDON_TYPE, ANDON_URGENCY } from '../model';
import styles from './AndonDialogs.module.css';

const URGENCY_HINT: Record<AndonUrgency, string> = {
  low: 'Sans impact immédiat',
  medium: 'Poste ralenti',
  critical: 'Arrêt de ligne, risque client',
};

interface Props {
  open: boolean;
  onClose: () => void;
  workstations: Workstation[];
  lines: Line[];
  initialWorkstationId?: string;
}

/** Déclenchement en quelques gestes : poste, type, description, urgence. */
export function RaiseAndonDialog({ open, onClose, workstations, lines, initialWorkstationId }: Props) {
  const user = useCurrentUser();
  const raise = useRaiseAndon();
  const [workstationId, setWorkstationId] = useState(initialWorkstationId ?? '');
  const [type, setType] = useState<AndonType | ''>('');
  const [detail, setDetail] = useState('');
  const [urgency, setUrgency] = useState<AndonUrgency>('medium');
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setWorkstationId(initialWorkstationId ?? '');
    setType('');
    setDetail('');
    setUrgency('medium');
    setError(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    if (!workstationId || !type) {
      setError('Choisissez le poste et le type de problème.');
      return;
    }
    if (!detail.trim()) {
      setError('Précisez le problème (choisissez un motif ou saisissez-le).');
      return;
    }
    try {
      await raise.mutateAsync({
        input: { workstationId, type, detail, urgency: type === 'safety' ? 'critical' : urgency },
        user,
      });
      close();
    } catch {
      /* message affiché par la couche d'opération */
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Déclencher un Andon"
      size="lg"
      footer={
        <>
          <Button onClick={close}>Annuler</Button>
          <Button variant="danger" size="lg" loading={raise.isPending} onClick={submit}>
            Déclencher
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className={styles.form}
      >
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>1. Poste</legend>
          {lines.map((line) => (
            <div key={line.id} className={styles.lineGroup}>
              <span className={styles.lineName}>{line.name}</span>
              <div className={styles.choices}>
                {workstations
                  .filter((w) => w.lineId === line.id && w.active)
                  .map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      aria-pressed={workstationId === w.id}
                      className={cx(styles.choice, workstationId === w.id && styles.selected)}
                      onClick={() => setWorkstationId(w.id)}
                    >
                      <strong>{w.code}</strong>
                      <span>{w.process}</span>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>2. Type de problème</legend>
          <div className={styles.choices}>
            {(Object.keys(ANDON_TYPE) as AndonType[]).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={type === t}
                className={cx(styles.choice, styles.typeChoice, styles[`type-${t}`], type === t && styles.selected)}
                onClick={() => {
                  setType(t);
                  setDetail('');
                  setUrgency(ANDON_TYPE[t].defaultUrgency);
                }}
              >
                <strong>{ANDON_TYPE[t].label}</strong>
              </button>
            ))}
          </div>
        </fieldset>

        {type && (
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>3. Description</legend>
            <div className={styles.presets}>
              {ANDON_PRESETS[type].map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={detail === p}
                  className={cx(styles.preset, detail === p && styles.presetSelected)}
                  onClick={() => setDetail(p)}
                >
                  {p}
                </button>
              ))}
            </div>
            <TextAreaField
              label="Description du problème"
              rows={2}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Choisissez un motif ou décrivez le problème"
            />
          </fieldset>
        )}

        {type && (
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>4. Urgence</legend>
            {type === 'safety' ? (
              <p className={styles.note}>Un Andon sécurité est toujours traité comme critique.</p>
            ) : (
              <div className={styles.choices} role="radiogroup" aria-label="Urgence">
                {(['low', 'medium', 'critical'] as AndonUrgency[]).map((u) => (
                  <button
                    key={u}
                    type="button"
                    role="radio"
                    aria-checked={urgency === u}
                    className={cx(styles.choice, urgency === u && styles.selected)}
                    onClick={() => setUrgency(u)}
                  >
                    <strong>{ANDON_URGENCY[u].label}</strong>
                    <span>{URGENCY_HINT[u]}</span>
                  </button>
                ))}
              </div>
            )}
          </fieldset>
        )}

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
