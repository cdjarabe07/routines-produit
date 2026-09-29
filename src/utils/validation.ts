/* Validation de formulaires — règles déclaratives, messages en français. */

/** Règle de champ ; reçoit aussi toutes les valeurs du formulaire (comparaison entre champs). */
export type Rule<V, T = unknown> = (value: V, all: T) => string | null;
export type Rules<T> = { [K in keyof T]?: Rule<T[K], T>[] };
export type FieldErrors<T> = Partial<Record<keyof T, string>>;

export const required =
  (message = 'Champ obligatoire'): Rule<unknown> =>
  (v) =>
    v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0) ? message : null;

export const minLength =
  (n: number): Rule<string | undefined> =>
  (v) =>
    v && v.trim().length > 0 && v.trim().length < n ? `${n} caractères minimum` : null;

export const maxLength =
  (n: number): Rule<string | undefined> =>
  (v) =>
    v && v.length > n ? `${n} caractères maximum` : null;

export const numberRange =
  (min?: number, max?: number): Rule<number | string | undefined> =>
  (v) => {
    if (v === undefined || v === '') return null;
    const n = Number(v);
    if (Number.isNaN(n)) return 'Nombre invalide';
    if (min !== undefined && n < min) return `Minimum ${min}`;
    if (max !== undefined && n > max) return `Maximum ${max}`;
    return null;
  };

export const httpsUrl = (): Rule<string | undefined> => (v) => {
  if (!v) return null;
  try {
    return new URL(v).protocol === 'https:' ? null : 'L’adresse doit commencer par https://';
  } catch {
    return 'Adresse web invalide';
  }
};

export function validate<T extends object>(values: T, rules: Rules<T>): FieldErrors<T> {
  const errors: FieldErrors<T> = {};
  for (const key of Object.keys(rules) as (keyof T)[]) {
    for (const rule of rules[key] ?? []) {
      const message = rule(values[key], values);
      if (message) {
        errors[key] = message;
        break;
      }
    }
  }
  return errors;
}

export const hasErrors = (errors: object) => Object.keys(errors).length > 0;

/** Seules les URL http(s) sont rendues cliquables (protection contre javascript:). */
export function safeExternalUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}
