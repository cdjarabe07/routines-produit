import { useState } from 'react';
import { useParams } from 'react-router';
import { ExternalLink, Pencil, Star } from 'lucide-react';
import { useAuth, useCurrentUser } from '@/app/providers/AuthProvider';
import { ItemList, KeyValueList } from '@/components/data-display/ItemList';
import { EmptyState, QueryBoundary } from '@/components/feedback/States';
import { Columns, PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Overlay';
import { Panel } from '@/components/ui/Panel';
import { KNOWLEDGE_CATEGORY } from '@/features/shared/labels';
import { useCollection } from '@/hooks/useData';
import { formatDate } from '@/utils/date';
import { safeExternalUrl } from '@/utils/validation';
import { useToggleFavorite } from '../api';
import { KnowledgeForm } from '../components/KnowledgeForm';

export function KnowledgeDetailPage() {
  const { id } = useParams();
  const user = useCurrentUser();
  const { can } = useAuth();
  const items = useCollection('knowledgeItems');
  const favorites = useCollection('favorites');
  const templates = useCollection('routineTemplates');
  const sequences = useCollection('sequenceTemplates');
  const toggle = useToggleFavorite();
  const [editing, setEditing] = useState(false);

  return (
    <QueryBoundary queries={[items, favorites, templates, sequences]}>
      {() => {
        const item = items.data!.find((k) => k.id === id);
        if (!item || (item.status === 'draft' && !can('knowledge.manage'))) {
          return (
            <EmptyState
              title="Document introuvable"
              action={<ButtonLink to="/app/connaissances">Retour au centre de connaissances</ButtonLink>}
            />
          );
        }
        const fav = favorites.data!.find((f) => f.userId === user.id && f.knowledgeId === item.id);
        const url = safeExternalUrl(item.url);
        const usedInRoutines = templates.data!.filter(
          (t) => t.active && t.tasks.some((task) => task.knowledgeId === item.id || task.checks.some((c) => c.knowledgeId === item.id)),
        );
        const usedInSequences = sequences.data!.filter((s) => s.active && s.steps.some((st) => st.knowledgeId === item.id));
        return (
          <>
            <PageHeader
              back={{ to: '/app/connaissances', label: 'Centre de connaissances' }}
              title={`${item.code} · ${item.title}`}
              meta={
                <>
                  <Badge>{KNOWLEDGE_CATEGORY[item.category]}</Badge>
                  <Badge tone="info">Version {item.version}</Badge>
                  {item.status === 'draft' && <Badge>Brouillon</Badge>}
                  {item.toReview && can('knowledge.manage') && <Badge tone="warning">À valider</Badge>}
                </>
              }
              actions={
                <>
                  <Button
                    icon={<Star size={16} fill={fav ? 'currentColor' : 'none'} aria-hidden />}
                    aria-pressed={Boolean(fav)}
                    onClick={() => toggle.mutate({ userId: user.id, knowledgeId: item.id, existing: fav })}
                  >
                    {fav ? 'Favori' : 'Ajouter aux favoris'}
                  </Button>
                  {can('knowledge.manage') && (
                    <Button icon={<Pencil size={16} aria-hidden />} onClick={() => setEditing(true)}>
                      Modifier
                    </Button>
                  )}
                </>
              }
            />
            <Columns sideFirstOnMobile>
              <Stack>
                <Panel title="Résumé">
                  <p>{item.summary}</p>
                  {url && (
                    <p style={{ marginTop: 'var(--space-4)' }}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 500 }}
                      >
                        Ouvrir le document externe <ExternalLink size={15} aria-hidden />
                      </a>
                    </p>
                  )}
                </Panel>
                {item.keyPoints.length > 0 && (
                  <Panel title="Points clés">
                    <ol
                      style={{
                        listStyle: 'decimal',
                        paddingLeft: 'var(--space-5)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--space-2)',
                      }}
                    >
                      {item.keyPoints.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ol>
                  </Panel>
                )}
                <Panel title="Utilisé dans" flush>
                  {usedInRoutines.length + usedInSequences.length === 0 ? (
                    <EmptyState compact title="Ce document n’est rattaché à aucune routine ni séquence." />
                  ) : (
                    <ItemList
                      items={[
                        ...usedInRoutines.map((t) => ({
                          id: t.id,
                          title: t.title,
                          meta: `Routine · ${t.tasks.length} tâche(s) · ${t.durationMin} min`,
                          to: can('routine.manage') ? '/admin/routines' : undefined,
                        })),
                        ...usedInSequences.map((s) => ({ id: s.id, title: s.name, meta: 'Séquence guidée', to: '/app/sequences' })),
                      ]}
                    />
                  )}
                </Panel>
              </Stack>
              <Panel title="Métadonnées">
                <KeyValueList
                  items={[
                    { label: 'Type', value: item.kind === 'link' ? 'Lien externe' : 'Standard interne' },
                    { label: 'Propriétaire', value: item.owner },
                    { label: 'Version', value: item.version },
                    { label: 'Mis à jour le', value: formatDate(item.updatedAt) },
                    { label: 'Créé le', value: formatDate(item.createdAt) },
                  ]}
                />
              </Panel>
            </Columns>
            <Drawer
              open={editing}
              onClose={() => setEditing(false)}
              title="Modifier le document"
              description="Pensez à incrémenter la version si le contenu change."
              size="lg"
            >
              {editing && <KnowledgeForm item={item} onDone={() => setEditing(false)} />}
            </Drawer>
          </>
        );
      }}
    </QueryBoundary>
  );
}
