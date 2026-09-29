import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/Button';
import { Checkbox, SelectField, TextField } from '@/components/ui/Field';
import { CHECK_TYPE_LABELS } from '@/features/routines/model';
import type { ChecklistItem, CheckType } from '@/types/domain';
import { createId } from '@/utils/id';
import styles from './ChecklistItemsEditor.module.css';

export const blankCheck = (): ChecklistItem => ({ id: createId(), label: '', type: 'conformity', required: true });

/** Déplace un élément d'une liste (réordonnancement au clavier ou au doigt, sans glisser-déposer). */
export function move<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/** Contrôles vides retirés ; bornes et options normalisées. */
export function cleanChecks(items: ChecklistItem[]): ChecklistItem[] {
  return items
    .filter((i) => i.label.trim())
    .map((i) => ({
      id: i.id,
      label: i.label.trim(),
      type: i.type,
      required: i.required,
      unit: i.type === 'number' ? i.unit?.trim() || undefined : undefined,
      min: i.type === 'number' && Number.isFinite(i.min) ? i.min : undefined,
      max: i.type === 'number' && Number.isFinite(i.max) ? i.max : undefined,
      options: i.type === 'select' ? (i.options ?? []).map((o) => o.trim()).filter(Boolean) : undefined,
      knowledgeId: i.knowledgeId,
    }));
}

/** Erreur de saisie éventuelle d'une liste de contrôles. */
export function checksError(items: ChecklistItem[]): string | null {
  for (const i of items.filter((x) => x.label.trim())) {
    if (i.type === 'number' && i.min !== undefined && i.max !== undefined && i.min > i.max)
      return `« ${i.label} » : le minimum dépasse le maximum.`;
    if (i.type === 'select' && (i.options ?? []).filter((o) => o.trim()).length < 2)
      return `« ${i.label} » : proposez au moins deux choix.`;
  }
  return null;
}

const numberOrUndefined = (v: string) => (v.trim() === '' ? undefined : Number(v.replace(',', '.')));

/** Éditeur de contrôles typés : conformité, oui/non, valeur numérique (bornes), texte, choix, commentaire. */
export function ChecklistItemsEditor({
  items,
  onChange,
  context,
}: {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
  context: string;
}) {
  const update = (index: number, patch: Partial<ChecklistItem>) => onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));

  return (
    <div className={styles.editor}>
      {items.length > 0 && (
        <ol className={styles.list}>
          {items.map((item, i) => (
            <li key={item.id} className={styles.item}>
              <div className={styles.row}>
                <TextField
                  label={`${context} — contrôle ${i + 1}`}
                  hideLabel
                  placeholder={`Contrôle ${i + 1}`}
                  value={item.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                  className={styles.label}
                />
                <SelectField
                  label={`Type du contrôle ${i + 1}`}
                  hideLabel
                  options={(Object.keys(CHECK_TYPE_LABELS) as CheckType[]).map((t) => ({ value: t, label: CHECK_TYPE_LABELS[t] }))}
                  value={item.type}
                  onChange={(e) => update(i, { type: e.target.value as CheckType })}
                  className={styles.type}
                />
                <div className={styles.tools}>
                  <IconButton
                    label={`Monter le contrôle ${i + 1}`}
                    size="sm"
                    icon={<ArrowUp size={15} />}
                    disabled={i === 0}
                    onClick={() => onChange(move(items, i, -1))}
                  />
                  <IconButton
                    label={`Descendre le contrôle ${i + 1}`}
                    size="sm"
                    icon={<ArrowDown size={15} />}
                    disabled={i === items.length - 1}
                    onClick={() => onChange(move(items, i, 1))}
                  />
                  <IconButton
                    label={`Supprimer le contrôle ${i + 1}`}
                    size="sm"
                    icon={<Trash2 size={15} />}
                    onClick={() => onChange(items.filter((_, k) => k !== i))}
                  />
                </div>
              </div>
              <div className={styles.options}>
                <Checkbox label="Obligatoire" checked={item.required} onChange={(e) => update(i, { required: e.target.checked })} />
                {item.type === 'number' && (
                  <>
                    <TextField
                      label="Unité"
                      value={item.unit ?? ''}
                      onChange={(e) => update(i, { unit: e.target.value })}
                      className={styles.small}
                    />
                    <TextField
                      label="Minimum"
                      inputMode="decimal"
                      value={item.min ?? ''}
                      onChange={(e) => update(i, { min: numberOrUndefined(e.target.value) })}
                      className={styles.small}
                    />
                    <TextField
                      label="Maximum"
                      inputMode="decimal"
                      value={item.max ?? ''}
                      onChange={(e) => update(i, { max: numberOrUndefined(e.target.value) })}
                      className={styles.small}
                    />
                  </>
                )}
                {item.type === 'select' && (
                  <TextField
                    label="Choix (séparés par des points-virgules)"
                    value={(item.options ?? []).join(' ; ')}
                    onChange={(e) => update(i, { options: e.target.value.split(';') })}
                    className={styles.choices}
                  />
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      <Button size="sm" variant="ghost" icon={<Plus size={15} aria-hidden />} onClick={() => onChange([...items, blankCheck()])}>
        Ajouter un contrôle
      </Button>
    </div>
  );
}
