import { useOperation } from '@/hooks/useData';
import type { Announcement, DateKey, ID } from '@/types/domain';

/** Publie (ou remplace) l'annonce du jour. Une annonce vide supprime celle du jour. */
export function useSaveAnnouncement() {
  return useOperation(
    async (ds, { existing, text, date, authorId }: { existing?: Announcement; text: string; date: DateKey; authorId: ID }) => {
      const trimmed = text.trim();
      if (!trimmed) {
        if (existing) await ds.repo('announcements').remove(existing.id);
        return null;
      }
      return existing
        ? ds.repo('announcements').update(existing.id, { text: trimmed, authorId })
        : ds.repo('announcements').create({ text: trimmed, date, authorId });
    },
    { invalidates: ['announcements'], success: (a) => (a ? 'Annonce publiée.' : 'Annonce retirée.') },
  );
}
