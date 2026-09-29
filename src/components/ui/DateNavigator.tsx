import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, IconButton } from './Button';
import type { DateKey } from '@/types/domain';
import { addDays, formatLongDate, todayKey } from '@/utils/date';
import styles from './DateNavigator.module.css';

/** Navigation jour par jour (historique ; dates futures seulement si allowFuture). */
export function DateNavigator({ value, onChange, allowFuture }: { value: DateKey; onChange: (d: DateKey) => void; allowFuture?: boolean }) {
  const today = todayKey();
  return (
    <div className={styles.nav}>
      <IconButton
        label="Jour précédent"
        variant="secondary"
        icon={<ChevronLeft size={18} />}
        onClick={() => onChange(addDays(value, -1))}
      />
      <label className={styles.picker}>
        <span className="visually-hidden">Choisir une date</span>
        <input
          type="date"
          value={value}
          max={allowFuture ? undefined : today}
          onChange={(e) => e.target.value && onChange(e.target.value)}
        />
      </label>
      <span className={styles.readable}>{value === today ? 'Aujourd’hui' : formatLongDate(value)}</span>
      <IconButton
        label="Jour suivant"
        variant="secondary"
        icon={<ChevronRight size={18} />}
        disabled={!allowFuture && value >= today}
        onClick={() => onChange(addDays(value, 1))}
      />
      {value !== today && (
        <Button size="sm" variant="ghost" onClick={() => onChange(today)}>
          Aujourd’hui
        </Button>
      )}
    </div>
  );
}
