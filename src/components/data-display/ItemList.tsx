import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { cx } from '@/utils/cx';
import styles from './ItemList.module.css';

export interface ListItem {
  id: string;
  title: ReactNode;
  meta?: ReactNode;
  aside?: ReactNode;
  leading?: ReactNode;
  to?: string;
  tone?: 'danger' | 'warning' | 'info' | 'success';
}

/** Liste dense de lignes (cockpit, panneaux latéraux). Les lignes avec « to » sont des liens. */
export function ItemList({ items, label }: { items: ListItem[]; label?: string }) {
  return (
    <ul className={styles.list} aria-label={label}>
      {items.map((item) => {
        const inner = (
          <>
            {item.leading && <span className={styles.leading}>{item.leading}</span>}
            <span className={styles.main}>
              <span className={styles.title}>{item.title}</span>
              {item.meta && <span className={styles.meta}>{item.meta}</span>}
            </span>
            {item.aside && <span className={styles.aside}>{item.aside}</span>}
            {item.to && <ChevronRight size={16} aria-hidden className={styles.chevron} />}
          </>
        );
        return (
          <li key={item.id} className={cx(styles.item, item.tone && styles[item.tone])}>
            {item.to ? (
              <Link to={item.to} className={styles.row}>
                {inner}
              </Link>
            ) : (
              <div className={styles.row}>{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function KeyValueList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className={styles.kv}>
      {items.map((i) => (
        <div key={i.label} className={styles.kvRow}>
          <dt>{i.label}</dt>
          <dd>{i.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
