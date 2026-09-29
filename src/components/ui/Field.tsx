import {
  forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import { cx } from '@/utils/cx';
import styles from './Field.module.css';

interface ShellProps {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  hideLabel?: boolean;
  className?: string;
}

function FieldShell({ id, label, hint, error, required, hideLabel, className, children }: ShellProps & { id: string; children: ReactNode }) {
  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={id} className={cx(styles.label, hideLabel && 'visually-hidden')}>
        {label}
        {required && <span className={styles.required} aria-hidden> *</span>}
      </label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className={styles.hint}>{hint}</p>}
      {error && <p id={`${id}-error`} className={styles.error} role="alert">{error}</p>}
    </div>
  );
}

const describedBy = (id: string, hint?: ReactNode, error?: string) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

export type TextFieldProps = ShellProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'className'>;

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, required, hideLabel, className, id, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell id={fid} label={label} hint={hint} error={error} required={required} hideLabel={hideLabel} className={className}>
      <input
        ref={ref}
        id={fid}
        className={cx(styles.control, error && styles.invalid)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fid, hint, error)}
        required={required}
        {...rest}
      />
    </FieldShell>
  );
});

export type TextAreaFieldProps = ShellProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'>;

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(function TextAreaField(
  { label, hint, error, required, hideLabel, className, id, rows = 3, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell id={fid} label={label} hint={hint} error={error} required={required} hideLabel={hideLabel} className={className}>
      <textarea
        ref={ref}
        id={fid}
        rows={rows}
        className={cx(styles.control, styles.textarea, error && styles.invalid)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fid, hint, error)}
        required={required}
        {...rest}
      />
    </FieldShell>
  );
});

export interface Option<V extends string = string> {
  value: V;
  label: string;
  disabled?: boolean;
}

export type SelectFieldProps = ShellProps &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> & {
    options: Option[];
    placeholder?: string;
  };

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { label, hint, error, required, hideLabel, className, id, options, placeholder, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell id={fid} label={label} hint={hint} error={error} required={required} hideLabel={hideLabel} className={className}>
      <select
        ref={ref}
        id={fid}
        className={cx(styles.control, styles.select, error && styles.invalid)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fid, hint, error)}
        required={required}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
});

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'> {
  label: ReactNode;
  description?: ReactNode;
  className?: string;
}

export function Checkbox({ label, description, className, id, ...rest }: CheckboxProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className={cx(styles.checkbox, className)}>
      <input id={fid} type="checkbox" className={styles.checkboxInput} {...rest} />
      <label htmlFor={fid} className={styles.checkboxLabel}>
        {label}
        {description && <span className={styles.checkboxDescription}>{description}</span>}
      </label>
    </div>
  );
}

/** Mise en page de formulaire : grille responsive, les champs `full` occupent toute la ligne. */
export function FormGrid({ children, columns = 2 }: { children: ReactNode; columns?: 1 | 2 | 3 }) {
  return <div className={cx(styles.grid, styles[`cols${columns}`])}>{children}</div>;
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className={styles.actions}>{children}</div>;
}
