import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/Button';
import { FormActions, FormGrid, SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { useForm } from '@/hooks/useForm';
import type { KnowledgeItem, SequenceStep, SequenceTemplate } from '@/types/domain';
import { createId } from '@/utils/id';
import { required } from '@/utils/validation';
import { useSaveSequenceTemplate } from '../api';
import styles from './SequenceEditor.module.css';

interface Values {
  name: string;
  description: string;
  steps: SequenceStep[];
}

const blankStep = (): SequenceStep => ({ id: createId(), title: '', durationMin: 5 });

export function SequenceEditor({ template, knowledge, onDone }: { template?: SequenceTemplate; knowledge: KnowledgeItem[]; onDone: () => void }) {
  const save = useSaveSequenceTemplate();
  const form = useForm<Values>({
    initial: { name: template?.name ?? '', description: template?.description ?? '', steps: template ? structuredClone(template.steps) : [blankStep()] },
    rules: {
      name: [required('Nommez la séquence')],
      steps: [(steps) => (steps.filter((s) => s.title.trim()).length === 0 ? 'Ajoutez au moins une étape' : steps.some((s) => s.title.trim() && !(s.durationMin > 0)) ? 'Chaque étape doit avoir une durée positive' : null)],
    },
    onSubmit: async (v) => {
      await save.mutateAsync({
        id: template?.id,
        input: {
          name: v.name.trim(),
          description: v.description.trim() || undefined,
          active: template?.active ?? true,
          steps: v.steps.filter((s) => s.title.trim()).map((s) => ({ ...s, title: s.title.trim(), instruction: s.instruction?.trim() || undefined, plannedTime: s.plannedTime || undefined })),
        },
      });
      onDone();
    },
  });
  const { values, set, errors } = form;
  const updateStep = (i: number, patch: Partial<SequenceStep>) => set('steps', values.steps.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const move = (i: number, delta: number) => {
    const next = [...values.steps];
    const [item] = next.splice(i, 1);
    next.splice(i + delta, 0, item!);
    set('steps', next);
  };
  const kbOptions = knowledge.filter((k) => k.kind === 'standard').map((k) => ({ value: k.id, label: `${k.code} — ${k.title}` }));

  return (
    <form onSubmit={form.handleSubmit} noValidate>
      <FormGrid columns={1}>
        <TextField label="Nom" required value={values.name} onChange={(e) => set('name', e.target.value)} error={errors.name} />
        <TextAreaField label="Description" rows={2} value={values.description} onChange={(e) => set('description', e.target.value)} />
      </FormGrid>
      <ol className={styles.steps}>
        {values.steps.map((step, i) => (
          <li key={step.id} className={styles.step}>
            <div className={styles.stepHead}>
              <strong>Étape {i + 1}</strong>
              <div className={styles.stepTools}>
                <IconButton size="sm" label={`Monter l’étape ${i + 1}`} icon={<ArrowUp size={15} />} disabled={i === 0} onClick={() => move(i, -1)} />
                <IconButton size="sm" label={`Descendre l’étape ${i + 1}`} icon={<ArrowDown size={15} />} disabled={i === values.steps.length - 1} onClick={() => move(i, 1)} />
                <IconButton size="sm" variant="danger" label={`Supprimer l’étape ${i + 1}`} icon={<Trash2 size={15} />} disabled={values.steps.length === 1} onClick={() => set('steps', values.steps.filter((_, k) => k !== i))} />
              </div>
            </div>
            <FormGrid columns={3}>
              <TextField className="full" label="Intitulé" value={step.title} onChange={(e) => updateStep(i, { title: e.target.value })} />
              <TextField label="Durée cible (min)" type="number" min={1} value={String(step.durationMin)} onChange={(e) => updateStep(i, { durationMin: Number(e.target.value) })} />
              <TextField label="Heure indicative" type="time" value={step.plannedTime ?? ''} onChange={(e) => updateStep(i, { plannedTime: e.target.value })} />
              <SelectField label="Standard associé" placeholder="Aucun" options={kbOptions} value={step.knowledgeId ?? ''} onChange={(e) => updateStep(i, { knowledgeId: e.target.value || undefined })} />
              <TextAreaField className="full" label="Consigne" rows={2} value={step.instruction ?? ''} onChange={(e) => updateStep(i, { instruction: e.target.value })} />
            </FormGrid>
          </li>
        ))}
      </ol>
      {errors.steps && <p className={styles.error} role="alert">{errors.steps}</p>}
      <Button size="sm" icon={<Plus size={15} aria-hidden />} onClick={() => set('steps', [...values.steps, blankStep()])}>Ajouter une étape</Button>
      <FormActions>
        <Button onClick={onDone}>Annuler</Button>
        <Button type="submit" variant="primary" loading={form.submitting}>Enregistrer</Button>
      </FormActions>
    </form>
  );
}
