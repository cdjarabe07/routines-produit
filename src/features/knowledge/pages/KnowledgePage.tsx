import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ExternalLink, FileText, Plus, Search, Star } from 'lucide-react';
import { Can, useAuth, useCurrentUser } from '@/app/providers/AuthProvider';
import { EmptyState, QueryBoundary } from '@/components/feedback/States';
import { PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Overlay';
import { Panel } from '@/components/ui/Panel';
import { Tabs } from '@/components/ui/Tabs';
import { KNOWLEDGE_CATEGORY } from '@/features/shared/labels';
import { useCollection } from '@/hooks/useData';
import type { KnowledgeCategory } from '@/types/domain';
import { formatDate } from '@/utils/date';
import { normalize } from '@/utils/format';
import { useToggleFavorite } from '../api';
import { KnowledgeForm } from '../components/KnowledgeForm';
import styles from './KnowledgePage.module.css';

type Filter = 'all' | 'favorites' | KnowledgeCategory;

export function KnowledgePage() {
  const user = useCurrentUser();
  const { can } = useAuth();
  const navigate = useNavigate();
  const items = useCollection('knowledgeItems');
  const favorites = useCollection('favorites');
  const toggle = useToggleFavorite();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [creating, setCreating] = useState(false);

  const myFavorites = useMemo(
    () => new Map((favorites.data ?? []).filter((f) => f.userId === user.id).map((f) => [f.knowledgeId, f])),
    [favorites.data, user.id],
  );

  const visible = useMemo(() => {
    const q = normalize(query.trim());
    return (items.data ?? [])
      .filter((k) => k.status === 'published' || can('knowledge.manage'))
      .filter((k) => (filter === 'all' ? true : filter === 'favorites' ? myFavorites.has(k.id) : k.category === filter))
      .filter((k) => !q || normalize(`${k.code} ${k.title} ${k.summary} ${k.keyPoints.join(' ')}`).includes(q))
      .sort((a, b) => a.code.localeCompare(b.code, 'fr', { numeric: true }));
  }, [items.data, query, filter, myFavorites, can]);

  const categories = Array.from(new Set((items.data ?? []).map((k) => k.category)));
  const toReview = can('knowledge.manage') ? (items.data ?? []).filter((k) => k.toReview).length : 0;

  return (
    <>
      <PageHeader
        title="Centre de connaissances"
        description="Standards, modes opératoires et documents de référence, consultables pendant les routines et les audits."
        actions={
          <Can permission="knowledge.manage">
            <Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setCreating(true)}>
              Nouveau document
            </Button>
          </Can>
        }
      />
      <QueryBoundary queries={[items, favorites]}>
        {() => (
          <Stack gap={4}>
            {toReview > 0 && (
              <p className={styles.notice} role="note">
                {toReview} document(s) <strong>à valider</strong> par leur propriétaire avant diffusion définitive.
              </p>
            )}
            <label className={styles.search}>
              <Search size={18} aria-hidden className={styles.searchIcon} />
              <span className="visually-hidden">Rechercher dans les documents</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher un code, un titre, un point de contrôle…"
              />
            </label>
            <Tabs
              variant="segmented"
              label="Filtrer"
              value={filter}
              onChange={setFilter}
              items={[
                { value: 'all', label: 'Tous' },
                { value: 'favorites', label: `Mes favoris (${myFavorites.size})` },
                ...categories.map((c) => ({ value: c as Filter, label: KNOWLEDGE_CATEGORY[c] })),
              ]}
            />
            <Panel flush>
              {visible.length === 0 ? (
                <EmptyState
                  compact
                  title={
                    query
                      ? `Aucun document ne correspond à « ${query} ».`
                      : filter === 'favorites'
                        ? 'Aucun favori : utilisez l’étoile pour garder vos documents à portée.'
                        : 'Aucun document dans cette catégorie.'
                  }
                />
              ) : (
                <ul className={styles.list}>
                  {visible.map((k) => {
                    const fav = myFavorites.get(k.id);
                    return (
                      <li key={k.id} className={styles.row}>
                        <span className={styles.icon} aria-hidden>
                          {k.kind === 'link' ? <ExternalLink size={18} /> : <FileText size={18} />}
                        </span>
                        <div className={styles.main}>
                          <Link to={`/connaissances/${k.id}`} className={styles.title}>
                            <span className={styles.code}>{k.code}</span> {k.title}
                          </Link>
                          <p className={styles.summary}>{k.summary}</p>
                          <p className={styles.meta}>
                            {KNOWLEDGE_CATEGORY[k.category]} · v{k.version} · mis à jour le {formatDate(k.updatedAt)} · {k.owner}
                          </p>
                        </div>
                        <div className={styles.aside}>
                          {k.toReview && can('knowledge.manage') && <Badge tone="warning">À valider</Badge>}
                          {k.status === 'draft' && <Badge>Brouillon</Badge>}
                          <IconButton
                            label={fav ? `Retirer ${k.code} des favoris` : `Ajouter ${k.code} aux favoris`}
                            icon={<Star size={18} fill={fav ? 'currentColor' : 'none'} />}
                            className={fav ? styles.favOn : undefined}
                            aria-pressed={Boolean(fav)}
                            onClick={() => toggle.mutate({ userId: user.id, knowledgeId: k.id, existing: fav })}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </Stack>
        )}
      </QueryBoundary>
      <Drawer open={creating} onClose={() => setCreating(false)} title="Nouveau document" size="lg">
        {creating && (
          <KnowledgeForm
            onDone={(saved) => {
              setCreating(false);
              if (saved) navigate(`/connaissances/${saved.id}`);
            }}
          />
        )}
      </Drawer>
    </>
  );
}
