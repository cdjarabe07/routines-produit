import { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/Button';
import { Checkbox, FormActions, FormGrid, SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { ChecklistItemsEditor, checksError, cleanChecks, move } from '@/features/checklists/components/ChecklistItemsEditor';
import { lineOptions, workstationOptions, type Lookups } from '@/features/shared/api';
import { PRIORITY, options } from '@/features/shared/labels';
import { useForm } from '@/hooks/useForm';
import { ROLE_LABELS, ROLE_ORDER } from '@/services/auth/permissions';
import type { Checklist, KnowledgeItem, Priority, Role, RoutineTask, RoutineTemplate } from '@/types/domain';
import { createId } from '@/utils/id';
import { numberRange, required } from '@/utils/validation';
import { useSaveRoutineTemplate } from '../api';
import styles from './TemplateEditor.module.css';

interface Values {
  title: string;
  description: string;
  durationMin: string;
  defaultTime: string;
  lineId: string;
  workstationId: string;
  tasks: RoutineTask[];
}

const blankTask = (): RoutineTask => ({ id: createId(), title: '', priority: 'medium', required: true, checks: [] });

interface Props {
  template?: RoutineTemplate;
  knowledge: KnowledgeItem[];
  checklists: Checklist[];
  lookups: Lookups;
  /** Le modèle fourni est une copie : l'enregistrement crée une nouvelle routine */
  isCopy?: boolean;
  onDone: () => void;
}

/** Création et modification d'une routine : informations générales et tâches ordonnées. */
export function TemplateEditor({ template, knowledge, checklists, lookups, isCopy, onDone }: Props) {
  const save = useSaveRoutineTemplate();
  const [openTask, setOpenTask] = useState<string | null>(template ? null : 'first');
  const form = useForm<Values>({
    initial: {
      title: template?.title ?? '',
      description: template?.description ?? '',
      durationMin: String(template?.durationMin ?? 20),
      defaultTime: template?.defaultTime ?? '08:00',
      lineId: template?.lineId ?? '',
      workstationId: template?.workstationId ?? '',
      tasks: template ? structuredClone(template.tasks) : [blankTask()],
    },
    rules: {
      title: [required('Donnez un titre à la routine')],
      durationMin: [required('Indiquez la durée prévue'), numberRange(1, 480)],
      defaultTime: [required('Indiquez l’heure prévue')],
      tasks: [
        (tasks) => (tasks.some((t) => t.title.trim()) ? null : 'Ajoutez au moins une tâche'),
        (tasks) => tasks.map((t) => checksError(t.checks)).find(Boolean) ?? null,
      ],
    },
    onSubmit: async (v) => {
      const tasks = v.tasks
        .filter((t) => t.title.trim())
        .map((t): RoutineTask => ({
          id: t.id,
          title: t.title.trim(),
          description: t.description?.trim() || undefined,
          instructions: t.instructions?.trim() || undefined,
          estimatedMin: t.estimatedMin && t.estimatedMin > 0 ? t.estimatedMin : undefined,
          priority: t.priority,
          required: t.required,
          responsibleRole: t.responsibleRole,
          knowledgeId: t.knowledgeId,
          checklistId: t.checklistId,
          checks: cleanChecks(t.checks),
          sampleSize: t.sampleSize && t.sampleSize > 0 ? Math.floor(t.sampleSize) : undefined,
        }));
      await save.mutateAsync({
        id: isCopy ? undefined : template?.id,
        input: {
          title: v.title.trim(),
          description: v.description.trim() || undefined,
          durationMin: Number(v.durationMin),
          defaultTime: v.defaultTime,
          lineId: v.lineId || undefined,
          workstationId: v.workstationId || undefined,
          tasks,
          active: isCopy ? true : (template?.active ?? true),
        },
      });
      onDone();
    },
  });
  const { values, set, errors } = form;
  const updateTask = (index: number, patch: Partial<RoutineTask>) =>
    set(
      'tasks',
      values.tasks.map((t, i) => (i === index ? { ...t, ...patch } : t)),
    );
  const estimated = values.tasks.reduce((s, t) => s + (t.estimatedMin ?? 0), 0);

  const knowledgeOptions = knowledge
    .filter((k) => k.kind === 'standard' && k.status !== 'archived')
    .map((k) => ({ value: k.id, label: `${k.code} — ${k.title}` }));
  const checklistOptions = checklists
    .filter((c) => c.active)
    .map((c) => ({ value: c.id, label: `${c.name} (${c.items.length} contrôles)` }));
  const stations = values.lineId ? lookups.workstations.filter((w) => w.lineId === values.lineId) : lookups.workstations;

  return (
    <form onSubmit={form.handleSubmit} noValidate>
      <FormGrid>
        <TextField
          className="full"
          label="Titre"
          required
          value={values.title}
          onChange={(e) => set('title', e.target.value)}
          error={errors.title}
        />
        <TextAreaField
          className="full"
          label="Description (facultative)"
          rows={2}
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
        />
        <TextField
          label="Durée prévue (minutes)"
          type="number"
          min={1}
          required
          value={values.durationMin}
          onChange={(e) => set('durationMin', e.target.value)}
          error={errors.durationMin}
          hint={estimated > 0 ? `Somme des tâches : ${estimated} min` : undefined}
        />
        <TextField
          label="Heure proposée"
          type="time"
          required
          value={values.defaultTime}
          onChange={(e) => set('defaultTime', e.target.value)}
          error={errors.defaultTime}
          hint="Reprise par défaut lors de la planification"
        />
        <SelectField
          label="Zone (ligne)"
          placeholder="Toutes les zones"
          options={lineOptions(lookups.lines)}
          value={values.lineId}
          onChange={(e) => {
            set('lineId', e.target.value);
            set('workstationId', '');
          }}
        />
        <SelectField
          label="Poste"
          placeholder="Aucun poste précis"
          options={workstationOptions(stations)}
          value={values.workstationId}
          onChange={(e) => set('workstationId', e.target.value)}
        />
      </FormGrid>

      <h3 className={styles.sectionTitle}>Tâches</h3>
      <p className={styles.sectionHint}>
        L’ordre des tâches est l’ordre d’exécution. Une tâche sans contrôle se valide en un geste (conforme, non conforme, non applicable).
      </p>
      <ol className={styles.tasks}>
        {values.tasks.map((task, i) => {
          const open = openTask === task.id || (openTask === 'first' && i === 0);
          return (
            <li key={task.id} className={styles.task}>
              <div className={styles.taskHead}>
                <button type="button" className={styles.toggle} aria-expanded={open} onClick={() => setOpenTask(open ? null : task.id)}>
                  {open ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
                  <span className={styles.taskNumber}>{i + 1}</span>
                  <span className={styles.taskName}>{task.title.trim() || 'Nouvelle tâche'}</span>
                  <span className={styles.taskMeta}>
                    {[
                      task.required ? 'obligatoire' : 'facultative',
                      task.estimatedMin ? `${task.estimatedMin} min` : null,
                      task.checks.length || task.checklistId ? 'avec contrôles' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </button>
                <div className={styles.taskTools}>
                  <IconButton
                    label={`Monter la tâche ${i + 1}`}
                    size="sm"
                    icon={<ArrowUp size={15} />}
                    disabled={i === 0}
                    onClick={() => set('tasks', move(values.tasks, i, -1))}
                  />
                  <IconButton
                    label={`Descendre la tâche ${i + 1}`}
                    size="sm"
                    icon={<ArrowDown size={15} />}
                    disabled={i === values.tasks.length - 1}
                    onClick={() => set('tasks', move(values.tasks, i, 1))}
                  />
                  <IconButton
                    label={`Supprimer la tâche ${i + 1}`}
                    size="sm"
                    variant="danger"
                    icon={<Trash2 size={15} />}
                    disabled={values.tasks.length === 1}
                    onClick={() =>
                      set(
                        'tasks',
                        values.tasks.filter((_, k) => k !== i),
                      )
                    }
                  />
                </div>
              </div>
              {open && (
                <div className={styles.taskBody}>
                  <FormGrid>
                    <TextField
                      className="full"
                      label="Titre de la tâche"
                      required
                      value={task.title}
                      onChange={(e) => updateTask(i, { title: e.target.value })}
                    />
                    <TextField
                      label="Durée estimée (minutes)"
                      type="number"
                      min={0}
                      value={task.estimatedMin ?? ''}
                      onChange={(e) => updateTask(i, { estimatedMin: e.target.value ? Number(e.target.value) : undefined })}
                    />
                    <SelectField
                      label="Priorité"
                      options={options(PRIORITY)}
                      value={task.priority}
                      onChange={(e) => updateTask(i, { priority: e.target.value as Priority })}
                    />
                    <SelectField
                      label="Responsable (fonction)"
                      placeholder="La personne qui exécute la routine"
                      options={ROLE_ORDER.filter((r) => r !== 'admin').map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
                      value={task.responsibleRole ?? ''}
                      onChange={(e) => updateTask(i, { responsibleRole: (e.target.value || undefined) as Role | undefined })}
                    />
                    <SelectField
                      label="Standard associé"
                      placeholder="Aucun standard"
                      options={knowledgeOptions}
                      value={task.knowledgeId ?? ''}
                      onChange={(e) => updateTask(i, { knowledgeId: e.target.value || undefined })}
                    />
                    <div className="full">
                      <Checkbox
                        label="Tâche obligatoire"
                        description="La routine ne peut pas être terminée tant qu’une tâche obligatoire n’est pas faite."
                        checked={task.required}
                        onChange={(e) => updateTask(i, { required: e.target.checked })}
                      />
                    </div>
                    <TextAreaField
                      className="full"
                      label="Description"
                      rows={2}
                      value={task.description ?? ''}
                      onChange={(e) => updateTask(i, { description: e.target.value })}
                    />
                    <TextAreaField
                      className="full"
                      label="Instructions"
                      rows={2}
                      value={task.instructions ?? ''}
                      onChange={(e) => updateTask(i, { instructions: e.target.value })}
                      hint="Affichées à l’opérateur pendant l’exécution"
                    />
                    <SelectField
                      className="full"
                      label="Checklist jointe"
                      placeholder="Aucune checklist"
                      options={checklistOptions}
                      value={task.checklistId ?? ''}
                      onChange={(e) => updateTask(i, { checklistId: e.target.value || undefined })}
                      hint="Les modifications de la checklist s’appliquent à toutes les routines qui l’utilisent."
                    />
                  </FormGrid>
                  <FormGrid>
                    <TextField
                      label="Questions tournantes (facultatif)"
                      type="number"
                      min={0}
                      max={50}
                      value={task.sampleSize ?? ''}
                      onChange={(e) => updateTask(i, { sampleSize: e.target.value ? Number(e.target.value) : undefined })}
                      hint="Nombre de contrôles posés à chaque exécution, à tour de rôle (audits par couches). Vide : tous les contrôles."
                    />
                  </FormGrid>
                  <p className={styles.checksTitle}>Contrôles propres à la tâche</p>
                  <ChecklistItemsEditor items={task.checks} onChange={(checks) => updateTask(i, { checks })} context={`Tâche ${i + 1}`} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {errors.tasks && (
        <p className={styles.error} role="alert">
          {errors.tasks}
        </p>
      )}
      <Button
        size="sm"
        icon={<Plus size={15} aria-hidden />}
        onClick={() => {
          const t = blankTask();
          set('tasks', [...values.tasks, t]);
          setOpenTask(t.id);
        }}
      >
        Ajouter une tâche
      </Button>

      <FormActions>
        <Button onClick={onDone}>Annuler</Button>
        <Button type="submit" variant="primary" loading={form.submitting}>
          Enregistrer la routine
        </Button>
      </FormActions>
    </form>
  );
}
