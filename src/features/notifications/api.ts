import { useMemo } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { useCollection, useOperation } from '@/hooks/useData';
import type { DataSource } from '@/services/data/types';
import type { AppNotification, ID, NotificationKind } from '@/types/domain';

/* Notifications internes à l'application. Aucun email n'est envoyé :
   le connecteur de messagerie n'est pas configuré (docs/decisions.md D-010). */

export async function notify(
  ds: DataSource,
  userIds: (ID | undefined)[],
  payload: { kind: NotificationKind; title: string; link?: string },
  exceptUserId?: ID,
) {
  const targets = Array.from(new Set(userIds.filter((id): id is ID => Boolean(id) && id !== exceptUserId)));
  await Promise.all(targets.map((userId) => ds.repo('notifications').create({ userId, ...payload })));
}

export function useMyNotifications() {
  const { user } = useAuth();
  const query = useCollection('notifications');
  const items = useMemo<AppNotification[]>(
    () => (query.data ?? []).filter((n) => n.userId === user?.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [query.data, user?.id],
  );
  return { ...query, items, unread: items.filter((n) => !n.readAt).length };
}

export function useMarkNotificationsRead() {
  return useOperation(
    async (ds, ids: ID[]) => {
      const at = new Date().toISOString();
      await Promise.all(ids.map((id) => ds.repo('notifications').update(id, { readAt: at })));
    },
    { invalidates: ['notifications'] },
  );
}
