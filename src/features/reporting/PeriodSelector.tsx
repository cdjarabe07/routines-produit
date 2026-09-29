import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { Tabs } from '@/components/ui/Tabs';
import type { PeriodPreset } from './model';
import styles from './ReportingPage.module.css';

interface Props {
  preset: PeriodPreset;
  from?: string | null;
  to?: string | null;
  max: string;
  onChange: (next: { preset: PeriodPreset; from?: string; to?: string }) => void;
}

/** Choix de période : raccourcis ou dates libres (validées avant application). */
export function PeriodSelector({ preset, from, to, max, onChange }: Props) {
  const [draftFrom, setDraftFrom] = useState(from ?? '');
  const [draftTo, setDraftTo] = useState(to ?? max);
  const invalid = !draftFrom || !draftTo || draftFrom > draftTo;

  return (
    <div className={styles.period}>
      <Tabs
        variant="segmented"
        label="Période"
        value={preset}
        onChange={(p) => onChange(p === 'custom' ? { preset: p, from: draftFrom || undefined, to: draftTo || undefined } : { preset: p })}
        items={[
          { value: '7d', label: '7 jours' },
          { value: '30d', label: '30 jours' },
          { value: 'month', label: 'Mois en cours' },
          { value: 'custom', label: 'Personnalisée' },
        ]}
      />
      {preset === 'custom' && (
        <form
          className={styles.custom}
          onSubmit={(e) => {
            e.preventDefault();
            if (!invalid) onChange({ preset: 'custom', from: draftFrom, to: draftTo });
          }}
        >
          <TextField label="Du" type="date" max={max} value={draftFrom} onChange={(e) => setDraftFrom(e.target.value)} />
          <TextField label="Au" type="date" max={max} value={draftTo} onChange={(e) => setDraftTo(e.target.value)} error={draftFrom && draftTo && draftFrom > draftTo ? 'Doit être après la date de début' : undefined} />
          <Button type="submit" variant="primary" disabled={invalid}>Appliquer</Button>
        </form>
      )}
    </div>
  );
}
