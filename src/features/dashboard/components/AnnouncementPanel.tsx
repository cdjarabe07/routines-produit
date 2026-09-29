import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { useAuth, useCurrentUser } from '@/app/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { TextAreaField } from '@/components/ui/Field';
import { Panel } from '@/components/ui/Panel';
import type { Announcement } from '@/types/domain';
import { formatTime, todayKey } from '@/utils/date';
import { useSaveAnnouncement } from '../api';

export function AnnouncementPanel({ announcement, authorName }: { announcement?: Announcement; authorName: string }) {
  const user = useCurrentUser();
  const { can } = useAuth();
  const save = useSaveAnnouncement();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(announcement?.text ?? '');

  return (
    <Panel
      title="Annonce du jour"
      actions={
        can('announcement.write') && !editing && (
          <Button size="sm" variant="ghost" icon={<Pencil size={14} aria-hidden />} onClick={() => { setText(announcement?.text ?? ''); setEditing(true); }}>
            {announcement ? 'Modifier' : 'Publier'}
          </Button>
        )
      }
    >
      {editing ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await save.mutateAsync({ existing: announcement, text, date: todayKey(), authorId: user.id });
            setEditing(false);
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
        >
          <TextAreaField label="Texte de l’annonce" hideLabel rows={3} value={text} onChange={(e) => setText(e.target.value)} hint="Laisser vide pour retirer l’annonce." />
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button size="sm" onClick={() => setEditing(false)}>Annuler</Button>
            <Button size="sm" type="submit" variant="primary" loading={save.isPending}>Publier</Button>
          </div>
        </form>
      ) : announcement ? (
        <>
          <p>{announcement.text}</p>
          <p style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            {authorName} · {formatTime(announcement.updatedAt)}
          </p>
        </>
      ) : (
        <p style={{ color: 'var(--color-text-muted)' }}>Aucune annonce aujourd’hui.</p>
      )}
    </Panel>
  );
}
