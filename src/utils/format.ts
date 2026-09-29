export const formatPercent = (value: number | null, digits = 0) =>
  value === null || Number.isNaN(value) ? '—' : `${value.toFixed(digits).replace('.', ',')} %`;

export const formatNumber = (value: number, digits = 0) =>
  value.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Pourcentage, ou null si le dénominateur est nul (affiché « — », jamais 0 %). */
export const ratio = (part: number, total: number): number | null => (total > 0 ? (part / total) * 100 : null);

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';

export const plural = (n: number, singular: string, pluralForm = `${singular}s`) =>
  `${n} ${n > 1 ? pluralForm : singular}`;

export function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
