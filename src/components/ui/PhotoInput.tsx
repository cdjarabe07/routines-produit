import { useId, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { toUserMessage } from '@/services/errors';
import { compressImage } from '@/utils/image';
import { Button } from './Button';
import styles from './PhotoInput.module.css';

/** Photo optionnelle : prise de vue sur mobile/tablette, réduite avant stockage. */
export function PhotoInput({ value, onChange, label = 'Photo (facultative)' }: { value?: string; onChange: (dataUrl: string | undefined) => void; label?: string }) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className={styles.field}>
      <span className={styles.label} id={`${id}-label`}>{label}</span>
      {value ? (
        <div className={styles.preview}>
          <img src={value} alt="Aperçu de la photo jointe" />
          <Button size="sm" variant="ghost" icon={<X size={16} aria-hidden />} onClick={() => onChange(undefined)}>Retirer</Button>
        </div>
      ) : (
        <Button size="md" icon={<Camera size={18} aria-hidden />} loading={busy} onClick={() => inputRef.current?.click()} aria-describedby={`${id}-label`}>
          Ajouter une photo
        </Button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setError(null);
          setBusy(true);
          try {
            onChange(await compressImage(file));
          } catch (err) {
            setError(toUserMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      />
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>
  );
}
