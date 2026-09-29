import { useState } from 'react';
import { Plus } from 'lucide-react';
import { DataTable, type Column } from '@/components/data-display/DataTable';
import { QueryBoundary } from '@/components/feedback/States';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { Drawer } from '@/components/ui/Overlay';
import { Panel } from '@/components/ui/Panel';
import { useCollection } from '@/hooks/useData';
import { ROLE_LABELS } from '@/services/auth/permissions';
import type { RoutineTemplate } from '@/types/domain';
import { useSetTemplateActive } from '../api';
import { TemplateEditor } from '../components/TemplateEditor';
import { templateItems } from '../model';

export function RoutineTemplatesPage() {
  const templates = useCollection('routineTemplates');
  const knowledge = useCollection('knowledgeItems');
  const setActive = useSetTemplateActive();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<RoutineTemplate | 'new' | null>(null);

  const columns: Column<RoutineTemplate>[] = [
    { id: 'time', header: 'Heure', width: '80px', cell: (t) => t.scheduledTime, sortValue: (t) => t.scheduledTime, mobile: 'meta' },
    { id: 'title', header: 'Modèle', cell: (t) => t.title, sortValue: (t) => t.title, mobile: 'title' },
    { id: 'role', header: 'Rôle', cell: (t) => ROLE_LABELS[t.role], sortValue: (t) => ROLE_LABELS[t.role], mobile: 'meta' },
    {
      id: 'items',
      header: 'Points',
      align: 'center',
      cell: (t) => templateItems(t).length,
      sortValue: (t) => templateItems(t).length,
      mobile: 'meta',
    },
    {
      id: 'status',
      header: 'Statut',
      mobile: 'aside',
      cell: (t) => (t.active ? <Badge tone="success">Actif</Badge> : <Badge>Archivé</Badge>),
      sortValue: (t) => (t.active ? 0 : 1),
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      mobile: 'meta',
      cell: (t) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
          <Button size="sm" onClick={() => setEditing(t)}>
            Modifier
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              if (
                t.active &&
                !(await confirm({
                  title: 'Archiver ce modèle ?',
                  message: 'La routine ne sera plus planifiée. L’historique des exécutions est conservé.',
                  confirmLabel: 'Archiver',
                }))
              )
                return;
              setActive.mutate({ id: t.id, active: !t.active });
            }}
          >
            {t.active ? 'Archiver' : 'Réactiver'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        back={{ to: '/routines', label: 'Routines' }}
        title="Modèles de routines"
        description="Chaque modèle actif génère une routine à exécuter chaque jour, à l’heure prévue, par le rôle choisi."
        actions={
          <Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setEditing('new')}>
            Nouveau modèle
          </Button>
        }
      />
      <QueryBoundary queries={[templates, knowledge]}>
        {() => (
          <Panel flush>
            <DataTable
              caption="Modèles de routines"
              rows={templates.data!}
              columns={columns}
              rowKey={(t) => t.id}
              initialSort={{ id: 'time', direction: 'asc' }}
              search={{ placeholder: 'Rechercher un modèle', text: (t) => `${t.title} ${ROLE_LABELS[t.role]}` }}
              empty={{
                title: 'Aucun modèle de routine.',
                action: (
                  <Button variant="primary" onClick={() => setEditing('new')}>
                    Créer le premier modèle
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
        title={editing === 'new' ? 'Nouveau modèle de routine' : 'Modifier le modèle'}
        size="lg"
      >
        {editing !== null && knowledge.data && (
          <TemplateEditor template={editing === 'new' ? undefined : editing} knowledge={knowledge.data} onDone={() => setEditing(null)} />
        )}
      </Drawer>
    </>
  );
}
