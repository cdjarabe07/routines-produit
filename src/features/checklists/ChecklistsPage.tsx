import { useState } from 'react';
import { Plus } from 'lucide-react';
import { DataTable, type Column } from '@/components/data-display/DataTable';
import { QueryBoundary } from '@/components/feedback/States';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { FormActions, FormGrid, TextAreaField, TextField } from '@/components/ui/Field';
import { Drawer } from '@/components/ui/Overlay';
import { Panel } from '@/components/ui/Panel';
import { CHECK_TYPE_LABELS } from '@/features/routines/model';
import { useCollection, useOperation } from '@/hooks/useData';
import { useForm } from '@/hooks/useForm';
import type { NewEntity } from '@/services/data/types';
import type { Checklist, ChecklistItem, ID } from '@/types/domain';
import { required } from '@/utils/validation';
import { ChecklistItemsEditor, blankCheck, checksError, cleanChecks } from './components/ChecklistItemsEditor';

function useSaveChecklist() {
  return useOperation(
    (ds, { id, input }: { id?: ID; input: NewEntity<Checklist> }) =>
      id ? ds.repo('checklists').update(id, input) : ds.repo('checklists').create(input),
    { invalidates: ['checklists'], success: 'Checklist enregistrée. Elle s’applique à toutes les routines qui l’utilisent.' },
  );
}

function useSetChecklistActive() {
  return useOperation((ds, { id, active }: { id: ID; active: boolean }) => ds.repo('checklists').update(id, { active }), {
    invalidates: ['checklists'],
    success: (c) => (c.active ? 'Checklist réactivée.' : 'Checklist archivée : elle ne peut plus être jointe à une nouvelle tâche.'),
  });
}

/** Bibliothèque de checklists réutilisables : une tâche de routine peut en joindre une. */
export function ChecklistsPage() {
  const checklists = useCollection('checklists');
  const routines = useCollection('routineTemplates');
  const setActive = useSetChecklistActive();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Checklist | 'new' | null>(null);

  const usage = (id: string) => (routines.data ?? []).filter((r) => r.active && r.tasks.some((t) => t.checklistId === id));

  const columns: Column<Checklist>[] = [
    { id: 'name', header: 'Checklist', mobile: 'title', cell: (c) => c.name, sortValue: (c) => c.name },
    { id: 'items', header: 'Contrôles', align: 'center', mobile: 'meta', cell: (c) => c.items.length, sortValue: (c) => c.items.length },
    {
      id: 'types',
      header: 'Types',
      mobile: 'meta',
      cell: (c) => Array.from(new Set(c.items.map((i) => CHECK_TYPE_LABELS[i.type].toLowerCase()))).join(', '),
    },
    {
      id: 'usage',
      header: 'Utilisée dans',
      mobile: 'meta',
      cell: (c) => {
        const list = usage(c.id);
        return list.length ? list.map((r) => r.title).join(', ') : 'Aucune routine';
      },
    },
    {
      id: 'status',
      header: 'Statut',
      mobile: 'aside',
      cell: (c) => (c.active ? <Badge tone="success">Active</Badge> : <Badge>Archivée</Badge>),
      sortValue: (c) => (c.active ? 0 : 1),
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      mobile: 'meta',
      cell: (c) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <Button size="sm" onClick={() => setEditing(c)}>
            Modifier
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              if (c.active && usage(c.id).length > 0) {
                const ok = await confirm({
                  title: 'Archiver cette checklist ?',
                  message: `Elle reste jointe aux ${usage(c.id).length} routine(s) qui l’utilisent, mais ne pourra plus être choisie pour une nouvelle tâche.`,
                  confirmLabel: 'Archiver',
                });
                if (!ok) return;
              }
              setActive.mutate({ id: c.id, active: !c.active });
            }}
          >
            {c.active ? 'Archiver' : 'Réactiver'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Checklists"
        description="Listes de contrôles réutilisables : conforme / non conforme, oui / non, valeur numérique avec tolérance, texte, choix, commentaire."
        actions={
          <Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setEditing('new')}>
            Nouvelle checklist
          </Button>
        }
      />
      <QueryBoundary queries={[checklists, routines]}>
        {() => (
          <Panel flush>
            <DataTable
              caption="Checklists"
              rows={checklists.data!}
              columns={columns}
              rowKey={(c) => c.id}
              initialSort={{ id: 'status', direction: 'asc' }}
              empty={{
                title: 'Aucune checklist.',
                action: (
                  <Button variant="primary" onClick={() => setEditing('new')}>
                    Créer la première checklist
                  </Button>
                ),
              }}
            />
          </Panel>
        )}
      </QueryBoundary>
      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Nouvelle checklist' : 'Modifier la checklist'}
        size="lg"
      >
        {editing !== null && (
          <ChecklistForm
            key={editing === 'new' ? 'new' : editing.id}
            checklist={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Drawer>
    </>
  );
}

function ChecklistForm({ checklist, onDone }: { checklist?: Checklist; onDone: () => void }) {
  const save = useSaveChecklist();
  const form = useForm<{ name: string; description: string; items: ChecklistItem[] }>({
    initial: {
      name: checklist?.name ?? '',
      description: checklist?.description ?? '',
      items: checklist ? structuredClone(checklist.items) : [blankCheck()],
    },
    rules: {
      name: [required('Donnez un nom à la checklist')],
      items: [(items) => (items.some((i) => i.label.trim()) ? null : 'Ajoutez au moins un contrôle'), (items) => checksError(items)],
    },
    onSubmit: async (v) => {
      await save.mutateAsync({
        id: checklist?.id,
        input: {
          name: v.name.trim(),
          description: v.description.trim() || undefined,
          items: cleanChecks(v.items),
          active: checklist?.active ?? true,
        },
      });
      onDone();
    },
  });
  const { values, set, errors } = form;
  return (
    <form onSubmit={form.handleSubmit} noValidate>
      <FormGrid>
        <TextField
          className="full"
          label="Nom"
          required
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
          error={errors.name}
        />
        <TextAreaField
          className="full"
          label="Description"
          rows={2}
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </FormGrid>
      <h3 style={{ margin: 'var(--space-5) 0 var(--space-2)', fontSize: 'var(--text-md)' }}>Contrôles</h3>
      <ChecklistItemsEditor items={values.items} onChange={(items) => set('items', items)} context="Checklist" />
      {errors.items && (
        <p role="alert" style={{ marginTop: 'var(--space-2)', color: 'var(--color-danger)', fontSize: 'var(--text-xs)', fontWeight: 500 }}>
          {errors.items}
        </p>
      )}
      <FormActions>
        <Button onClick={onDone}>Annuler</Button>
        <Button type="submit" variant="primary" loading={form.submitting}>
          Enregistrer la checklist
        </Button>
      </FormActions>
    </form>
  );
}
