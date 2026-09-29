import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { CheckResultToggle } from '@/features/shared/components/CheckResultToggle';
import type { ChecklistItem, CheckResult, CheckValue, ItemResult } from '@/types/domain';
import { cx } from '@/utils/cx';
import { evaluateCheck } from '../model';
import styles from './CheckInput.module.css';

interface Props {
  item: ChecklistItem;
  result?: ItemResult;
  disabled: boolean;
  onSave: (status: CheckResult, value?: CheckValue) => void;
}

const formatNumber = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 3 });

/** Saisie d'un contrôle selon son type. Chaque saisie est enregistrée et horodatée immédiatement. */
export function CheckInput({ item, result, disabled, onSave }: Props) {
  const [draft, setDraft] = useState(
    result?.value === undefined ? '' : typeof result.value === 'number' ? String(result.value).replace('.', ',') : String(result.value),
  );
  const save = (value: CheckValue) => onSave(evaluateCheck(item, value), value);

  switch (item.type) {
    case 'conformity':
      return <CheckResultToggle itemLabel={item.label} value={result?.status} disabled={disabled} onChange={(status) => onSave(status)} />;

    case 'yes_no':
      return (
        <div role="group" aria-label={`Réponse : ${item.label}`} className={styles.segmented}>
          {[
            { v: true, label: 'Oui' },
            { v: false, label: 'Non' },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              aria-pressed={result?.value === o.v}
              disabled={disabled}
              className={cx(styles.option, result?.value === o.v && (o.v ? styles.yes : styles.no))}
              onClick={() => save(o.v)}
            >
              {o.label}
            </button>
          ))}
        </div>
      );

    case 'select':
      return (
        <SelectField
          label={item.label}
          hideLabel
          placeholder="Choisir…"
          options={(item.options ?? []).map((o) => ({ value: o, label: o }))}
          value={typeof result?.value === 'string' ? result.value : ''}
          disabled={disabled}
          onChange={(e) => e.target.value && save(e.target.value)}
          className={styles.select}
        />
      );

    case 'number': {
      const bounds =
        item.min !== undefined && item.max !== undefined
          ? `Tolérance ${formatNumber(item.min)} – ${formatNumber(item.max)}`
          : item.min !== undefined
            ? `Minimum ${formatNumber(item.min)}`
            : item.max !== undefined
              ? `Maximum ${formatNumber(item.max)}`
              : undefined;
      const parsed = Number(draft.replace(',', '.'));
      const valid = draft.trim() !== '' && Number.isFinite(parsed);
      return (
        <form
          className={styles.inline}
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) save(parsed);
          }}
        >
          <TextField
            label={item.label}
            hideLabel
            inputMode="decimal"
            value={draft}
            disabled={disabled}
            onChange={(e) => setDraft(e.target.value)}
            className={styles.number}
            hint={[bounds, item.unit].filter(Boolean).join(' ') || undefined}
          />
          <Button type="submit" size="sm" disabled={disabled || !valid || result?.value === parsed}>
            Valider
          </Button>
        </form>
      );
    }

    default: {
      const long = item.type === 'comment';
      return (
        <form
          className={cx(styles.inline, long && styles.stack)}
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) save(draft.trim());
          }}
        >
          {long ? (
            <TextAreaField
              label={item.label}
              hideLabel
              rows={2}
              value={draft}
              disabled={disabled}
              onChange={(e) => setDraft(e.target.value)}
            />
          ) : (
            <TextField
              label={item.label}
              hideLabel
              value={draft}
              disabled={disabled}
              onChange={(e) => setDraft(e.target.value)}
              className={styles.text}
            />
          )}
          <Button type="submit" size="sm" disabled={disabled || !draft.trim() || draft.trim() === result?.value}>
            Valider
          </Button>
        </form>
      );
    }
  }
}
