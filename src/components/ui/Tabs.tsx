import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from '@/utils/cx';
import styles from './Tabs.module.css';

export interface TabItem<V extends string> {
  value: V;
  label: string;
  count?: number;
}

interface TabsProps<V extends string> {
  items: TabItem<V>[];
  value: V;
  onChange: (value: V) => void;
  label: string;
  /** « tabs » = onglets soulignés ; « segmented » = bascule compacte */
  variant?: 'tabs' | 'segmented';
  /** id du panneau contrôlé (aria-controls) */
  panelId?: string;
}

/** Onglets accessibles : flèches gauche/droite, Début/Fin. */
export function Tabs<V extends string>({ items, value, onChange, label, variant = 'tabs', panelId }: TabsProps<V>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const last = items.length - 1;
    const target =
      e.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : e.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null;
    if (target === null) return;
    e.preventDefault();
    const item = items[target];
    if (item) {
      onChange(item.value);
      refs.current[target]?.focus();
    }
  };

  return (
    <div role="tablist" aria-label={label} className={cx(styles.list, styles[variant])}>
      {items.map((item, i) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            className={cx(styles.tab, selected && styles.selected)}
            onClick={() => onChange(item.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {item.label}
            {item.count !== undefined && <span className={styles.count}>{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div role="tabpanel" id={id} tabIndex={-1}>
      {children}
    </div>
  );
}
