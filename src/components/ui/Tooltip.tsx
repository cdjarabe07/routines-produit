import { cloneElement, useId, useState, type ReactElement } from 'react';
import styles from './Tooltip.module.css';

/** Info-bulle au survol et au focus clavier. Le déclencheur doit être focalisable. */
export function Tooltip({ content, children }: { content: string; children: ReactElement<Record<string, unknown>> }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span
      className={styles.wrap}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
    >
      {cloneElement(children, { 'aria-describedby': id })}
      <span role="tooltip" id={id} className={styles.tip} hidden={!open}>
        {content}
      </span>
    </span>
  );
}
