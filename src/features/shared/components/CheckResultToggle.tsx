import { Check, Minus, X } from 'lucide-react';
import type { CheckResult } from '@/types/domain';
import { cx } from '@/utils/cx';
import styles from './CheckResultToggle.module.css';

const CHOICES: { value: CheckResult; label: string; short: string; icon: typeof Check }[] = [
  { value: 'ok', label: 'Conforme', short: 'OK', icon: Check },
  { value: 'ko', label: 'Non conforme', short: 'NC', icon: X },
  { value: 'na', label: 'Non applicable', short: 'N.A.', icon: Minus },
];

interface Props {
  value?: CheckResult;
  onChange: (value: CheckResult) => void;
  /** Libellé du point, pour l'accessibilité du groupe */
  itemLabel: string;
  disabled?: boolean;
}

/** Trois boutons larges, utilisables au doigt et avec des gants. aria-pressed indique le choix. */
export function CheckResultToggle({ value, onChange, itemLabel, disabled }: Props) {
  return (
    <div role="group" aria-label={`Résultat : ${itemLabel}`} className={styles.group}>
      {CHOICES.map((c) => {
        const Icon = c.icon;
        const selected = value === c.value;
        return (
          <button
            key={c.value}
            type="button"
            aria-pressed={selected}
            aria-label={c.label}
            title={c.label}
            disabled={disabled}
            className={cx(styles.choice, styles[c.value], selected && styles.selected)}
            onClick={() => onChange(c.value)}
          >
            <Icon size={16} aria-hidden />
            <span>{c.short}</span>
          </button>
        );
      })}
    </div>
  );
}
