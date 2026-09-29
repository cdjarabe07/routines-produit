import { Link } from 'react-router';
import { ExternalLink } from 'lucide-react';
import { EmptyState, QueryBoundary } from '@/components/feedback/States';
import { Badge } from '@/components/ui/Badge';
import { Drawer } from '@/components/ui/Overlay';
import { KNOWLEDGE_CATEGORY } from '@/features/shared/labels';
import { useCollection } from '@/hooks/useData';
import { formatDate } from '@/utils/date';
import { safeExternalUrl } from '@/utils/validation';
import styles from './KnowledgeQuickView.module.css';

/** Consultation rapide d'un standard sans quitter la routine ou la séquence en cours. */
export function KnowledgeQuickView({ knowledgeId, onClose }: { knowledgeId: string | null; onClose: () => void }) {
  const items = useCollection('knowledgeItems');
  const item = items.data?.find((k) => k.id === knowledgeId);

  return (
    <Drawer open={knowledgeId !== null} onClose={onClose} title={item ? `${item.code} · ${item.title}` : 'Standard'} size="md">
      <QueryBoundary queries={[items]}>
        {() =>
          !item ? (
            <EmptyState title="Standard introuvable" description="Il a peut-être été supprimé du centre de connaissances." />
          ) : (
            <div className={styles.body}>
              <div className={styles.meta}>
                <Badge>{KNOWLEDGE_CATEGORY[item.category]}</Badge>
                <span>Version {item.version}</span>
                <span>Mis à jour le {formatDate(item.updatedAt)}</span>
                {item.isExample && <Badge tone="demo">Exemple à remplacer</Badge>}
              </div>
              <p>{item.summary}</p>
              {item.keyPoints.length > 0 && (
                <>
                  <h3 className={styles.subtitle}>Points clés</h3>
                  <ol className={styles.points}>
                    {item.keyPoints.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ol>
                </>
              )}
              {item.kind === 'link' && safeExternalUrl(item.url) && (
                <a href={safeExternalUrl(item.url)!} target="_blank" rel="noopener noreferrer" className={styles.external}>
                  Ouvrir le document externe <ExternalLink size={14} aria-hidden />
                </a>
              )}
              <Link to={`/connaissances/${item.id}`} className={styles.full} onClick={onClose}>
                Voir la fiche complète
              </Link>
            </div>
          )
        }
      </QueryBoundary>
    </Drawer>
  );
}
