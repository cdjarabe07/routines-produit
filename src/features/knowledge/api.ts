import { useOperation } from '@/hooks/useData';
import type { NewEntity } from '@/services/data/types';
import type { Favorite, ID, KnowledgeItem } from '@/types/domain';

export function useToggleFavorite() {
  return useOperation(
    async (ds, { userId, knowledgeId, existing }: { userId: ID; knowledgeId: ID; existing?: Favorite }) => {
      if (existing) {
        await ds.repo('favorites').remove(existing.id);
        return false;
      }
      await ds.repo('favorites').create({ userId, knowledgeId });
      return true;
    },
    { invalidates: ['favorites'], success: (added) => (added ? 'Ajouté aux favoris.' : 'Retiré des favoris.') },
  );
}

export function useSaveKnowledge() {
  return useOperation(
    (ds, { id, input }: { id?: ID; input: NewEntity<KnowledgeItem> }) => (id ? ds.repo('knowledgeItems').update(id, input) : ds.repo('knowledgeItems').create(input)),
    { invalidates: ['knowledgeItems'], success: 'Document enregistré.' },
  );
}
