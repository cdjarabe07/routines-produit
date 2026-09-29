import { useCallback, useState, type FormEvent } from 'react';
import { hasErrors, validate, type FieldErrors, type Rules } from '@/utils/validation';

interface UseFormOptions<T extends object> {
  initial: T;
  rules?: Rules<T>;
  onSubmit: (values: T) => Promise<unknown> | unknown;
  /** Remettre le formulaire à zéro après un envoi réussi */
  resetOnSuccess?: boolean;
}

/**
 * État de formulaire standard : valeurs, validation (à la soumission puis en direct),
 * état d'envoi, réinitialisation. Les erreurs serveur sont gérées par useOperation (toast).
 */
export function useForm<T extends object>({ initial, rules = {}, onSubmit, resetOnSuccess }: UseFormOptions<T>) {
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrors] = useState<FieldErrors<T>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const set = useCallback(
    <K extends keyof T>(key: K, value: T[K]) => {
      setValues((prev) => {
        const next = { ...prev, [key]: value };
        if (submitted) setErrors(validate(next, rules));
        return next;
      });
    },
    [submitted, rules],
  );

  const reset = useCallback(
    (next?: T) => {
      setValues(next ?? initial);
      setErrors({});
      setSubmitted(false);
    },
    [initial],
  );

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    setSubmitted(true);
    const found = validate(values, rules);
    setErrors(found);
    if (hasErrors(found)) return false;
    setSubmitting(true);
    try {
      await onSubmit(values);
      if (resetOnSuccess) reset();
      return true;
    } catch {
      return false; // message déjà affiché par la couche d'opération
    } finally {
      setSubmitting(false);
    }
  };

  return { values, set, setValues, errors, submitting, handleSubmit, reset };
}
