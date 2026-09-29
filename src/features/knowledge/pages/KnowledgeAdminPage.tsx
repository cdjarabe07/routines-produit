import { useState } from 'react';
import { Plus } from 'lucide-react';
import { DataTable, type Column } from '@/components/data-display/DataTable';
import { QueryBoundary } from '@/components/feedback/States';
import { PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { Drawer } from '@/components/ui/Overlay';
import { Panel } from '@/components/ui/Panel';
import { Tabs } from '@/components/ui/Tabs';
import { KNOWLEDGE_CATEGORY } from '@/features/shared/labels';
import { useCollection } from '@/hooks/useData';
import type { KnowledgeItem, KnowledgeStatus } from '@/types/domain';
import { formatDate } from '@/utils/date';
import { useSetKnowledgeStatus } from '../api';
import { KnowledgeForm } from '../components/KnowledgeForm';

const STATUS: Record<KnowledgeStatus, { label: string; tone: 'success' | 'neutral' | 'warning' }> = {
  published: { label: 'Publié', tone: 'success' },
  draft: { label: 'Brouillon', tone: 'neutral' },
  archived: { label: 'Archivé', tone: 'neutral' },
};

type View = 'current' | 'review' | 'archived';

/** Gestion du centre de connaissances : créer, modifier, catégoriser, publier, archiver, valider les contenus initiaux. */
export function KnowledgeAdminPage() {
  const items = useCollection('knowledgeItems');
  const setStatus = useSetKnowledgeStatus();
  const confirm = useConfirm();
  const [view, setView] = useState<View>('current');
  const [editing, setEditing] = useState<KnowledgeItem | 'new' | null>(null);

  const columns: Column<KnowledgeItem>[] = [
    { id: 'code', header: 'Code', width: '90px', mobile: 'meta', cell: (k) => <strong>{k.code}</strong>, sortValue: (k) => k.code },
    { id: 'title', header: 'Document', mobile: 'title', cell: (k) => k.title, sortValue: (k) => k.title },
    {
      id: 'category',
      header: 'Catégorie',
      mobile: 'meta',
      cell: (k) => KNOWLEDGE_CATEGORY[k.category],
      sortValue: (k) => KNOWLEDGE_CATEGORY[k.category],
    },
    { id: 'kind', header: 'Type', mobile: 'meta', cell: (k) => (k.kind === 'link' ? 'Lien' : 'Standard') },
    { id: 'version', header: 'Version', align: 'center', mobile: 'meta', cell: (k) => k.version },
    { id: 'owner', header: 'Propriétaire', mobile: 'meta', cell: (k) => k.owner },
    { id: 'updated', header: 'Mis à jour', mobile: 'meta', cell: (k) => formatDate(k.updatedAt), sortValue: (k) => k.updatedAt },
    {
      id: 'status',
      header: 'Statut',
      mobile: 'aside',
      cell: (k) => (
        <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
          <Badge tone={STATUS[k.status].tone}>{STATUS[k.status].label}</Badge>
          {k.toReview && <Badge tone="warning">À valider</Badge>}
        </span>
      ),
      sortValue: (k) => k.status,
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      mobile: 'meta',
      cell: (k) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button size="sm" onClick={() => setEditing(k)}>
            Modifier
          </Button>
          {k.status === 'draft' && (
            <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: k.id, status: 'published' })}>
              Publier
            </Button>
          )}
          {k.status !== 'archived' ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                if (
                  await confirm({
                    title: 'Archiver ce document ?',
                    message: 'Il ne sera plus consultable. Les routines qui y font référence afficheront un lien inactif.',
                    confirmLabel: 'Archiver',
                  })
                )
                  setStatus.mutate({ id: k.id, status: 'archived' });
              }}
            >
              Archiver
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: k.id, status: 'draft' })}>
              Restaurer
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Centre de connaissances"
        description="Standards et liens de référence. Seuls les documents publiés sont visibles des utilisateurs."
        actions={
          <Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setEditing('new')}>
            Nouveau document
          </Button>
        }
      />
      <QueryBoundary queries={[items]}>
        {() => {
          const all = items.data!;
          const toReview = all.filter((k) => k.toReview && k.status !== 'archived');
          const rows =
            view === 'archived'
              ? all.filter((k) => k.status === 'archived')
              : view === 'review'
                ? toReview
                : all.filter((k) => k.status !== 'archived');
          return (
            <Stack>
              <Tabs
                label="Documents"
                value={view}
                onChange={setView}
                items={[
                  { value: 'current', label: 'Publiés et brouillons', count: all.filter((k) => k.status !== 'archived').length },
                  { value: 'review', label: 'À valider', count: toReview.length },
                  { value: 'archived', label: 'Archivés' },
                ]}
              />
              {view === 'review' && toReview.length > 0 && (
                <p role="note" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                  Contenus initiaux à vérifier avec leur propriétaire. Les enregistrer après vérification les marque comme validés.
                </p>
              )}
              <Panel flush>
                <DataTable
                  caption="Documents du centre de connaissances"
                  rows={rows}
                  columns={columns}
                  rowKey={(k) => k.id}
                  initialSort={{ id: 'code', direction: 'asc' }}
                  search={{ placeholder: 'Rechercher un document', text: (k) => `${k.code} ${k.title} ${k.owner}` }}
                  empty={{
                    title:
                      view === 'review' ? 'Aucun document à valider.' : view === 'archived' ? 'Aucun document archivé.' : 'Aucun document.',
                  }}
                />
              </Panel>
            </Stack>
          );
        }}
      </QueryBoundary>
      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Nouveau document' : 'Modifier le document'}
        size="lg"
      >
        {editing !== null && (
          <KnowledgeForm
            key={editing === 'new' ? 'new' : editing.id}
            item={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Drawer>
    </>
  );
}
