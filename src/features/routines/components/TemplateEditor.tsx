import { Plus, Trash2 } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/Button';
import { FormActions, FormGrid, SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { useForm } from '@/hooks/useForm';
import { ROLE_LABELS, ROLE_ORDER } from '@/services/auth/permissions';
import type { KnowledgeItem, Role, RoutineSection, RoutineTemplate } from '@/types/domain';
import { createId } from '@/utils/id';
import { required } from '@/utils/validation';
import { useSaveRoutineTemplate } from '../api';
import styles from './TemplateEditor.module.css';

interface Values {
  title: string;
  description: string;
  role: Role;
  scheduledTime: string;
  sections: RoutineSection[];
}

const EXECUTING_ROLES = ROLE_ORDER.filter((r) => r !== 'operator' && r !== 'admin');

const emptySection = (): RoutineSection => ({ id: createId(), title: 'Points de contrôle', items: [{ id: createId(), label: '' }] });

export function TemplateEditor({
  template,
  knowledge,
  onDone,
}: {
  template?: RoutineTemplate;
  knowledge: KnowledgeItem[];
  onDone: () => void;
}) {
  const save = useSaveRoutineTemplate();
  const form = useForm<Values>({
    initial: {
      title: template?.title ?? '',
      description: template?.description ?? '',
      role: template?.role ?? 'line_leader',
      scheduledTime: template?.scheduledTime ?? '08:00',
      sections: template ? structuredClone(template.sections) : [emptySection()],
    },
    rules: {
      title: [required('Donnez un titre à la routine')],
      scheduledTime: [required('Indiquez l’heure prévue')],
      sections: [(s) => (s.some((sec) => sec.items.some((i) => i.label.trim())) ? null : 'Ajoutez au moins un point de contrôle')],
    },
    onSubmit: async (v) => {
      const sections = v.sections
        .map((s) => ({
          ...s,
          title: s.title.trim() || 'Points de contrôle',
          items: s.items.filter((i) => i.label.trim()).map((i) => ({ ...i, label: i.label.trim() })),
        }))
        .filter((s) => s.items.length > 0);
      await save.mutateAsync({
        id: template?.id,
        input: {
          title: v.title.trim(),
          description: v.description.trim() || undefined,
          role: v.role,
          scheduledTime: v.scheduledTime,
          sections,
          active: template?.active ?? true,
        },
      });
      onDone();
    },
  });
  const { values, set, errors } = form;

  const updateSection = (index: number, patch: Partial<RoutineSection>) =>
    set(
      'sections',
      values.sections.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );

  const knowledgeOptions = knowledge.filter((k) => k.kind === 'standard').map((k) => ({ value: k.id, label: `${k.code} — ${k.title}` }));

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
        <SelectField
          label="Rôle qui l’exécute"
          options={EXECUTING_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
          value={values.role}
          onChange={(e) => set('role', e.target.value as Role)}
        />
        <TextField
          label="Heure prévue"
          type="time"
          required
          value={values.scheduledTime}
          onChange={(e) => set('scheduledTime', e.target.value)}
          error={errors.scheduledTime}
        />
        <TextAreaField
          className="full"
          label="Description (facultative)"
          rows={2}
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </FormGrid>

      <div className={styles.sections}>
        {values.sections.map((section, si) => (
          <fieldset key={section.id} className={styles.section}>
            <legend className="visually-hidden">Section {si + 1}</legend>
            <div className={styles.sectionHead}>
              <TextField label={`Section ${si + 1}`} value={section.title} onChange={(e) => updateSection(si, { title: e.target.value })} />
              {values.sections.length > 1 && (
                <IconButton
                  label={`Supprimer la section ${si + 1}`}
                  variant="danger"
                  size="sm"
                  icon={<Trash2 size={15} />}
                  onClick={() =>
                    set(
                      'sections',
                      values.sections.filter((_, i) => i !== si),
                    )
                  }
                />
              )}
            </div>
            <ol className={styles.items}>
              {section.items.map((item, ii) => (
                <li key={item.id} className={styles.item}>
                  <TextField
                    label={`Point ${ii + 1}`}
                    hideLabel
                    placeholder={`Point de contrôle ${ii + 1}`}
                    value={item.label}
                    onChange={(e) =>
                      updateSection(si, { items: section.items.map((it, k) => (k === ii ? { ...it, label: e.target.value } : it)) })
                    }
                  />
                  <SelectField
                    label={`Standard associé au point ${ii + 1}`}
                    hideLabel
                    placeholder="Aucun standard"
                    options={knowledgeOptions}
                    value={item.knowledgeId ?? ''}
                    onChange={(e) =>
                      updateSection(si, {
                        items: section.items.map((it, k) => (k === ii ? { ...it, knowledgeId: e.target.value || undefined } : it)),
                      })
                    }
                  />
                  <IconButton
                    label={`Supprimer le point ${ii + 1}`}
                    size="sm"
                    icon={<Trash2 size={15} />}
                    disabled={section.items.length === 1}
                    onClick={() => updateSection(si, { items: section.items.filter((_, k) => k !== ii) })}
                  />
                </li>
              ))}
            </ol>
            <Button
              size="sm"
              variant="ghost"
              icon={<Plus size={15} aria-hidden />}
              onClick={() => updateSection(si, { items: [...section.items, { id: createId(), label: '' }] })}
            >
              Ajouter un point
            </Button>
          </fieldset>
        ))}
        {errors.sections && (
          <p className={styles.error} role="alert">
            {errors.sections}
          </p>
        )}
        <Button size="sm" icon={<Plus size={15} aria-hidden />} onClick={() => set('sections', [...values.sections, emptySection()])}>
          Ajouter une section
        </Button>
      </div>

      <FormActions>
        <Button onClick={onDone}>Annuler</Button>
        <Button type="submit" variant="primary" loading={form.submitting}>
          Enregistrer le modèle
        </Button>
      </FormActions>
    </form>
  );
}
