import { useMemo, useState } from 'react';
import { useCurrentUser } from '@/app/providers/AuthProvider';
import { EmptyState, QueryBoundary } from '@/components/feedback/States';
import { Button } from '@/components/ui/Button';
import { TextAreaField } from '@/components/ui/Field';
import { useAddComment, useEditComment } from '@/features/actions/api';
import { useCollection } from '@/hooks/useData';
import type { Comment, CommentTarget, ID } from '@/types/domain';
import { formatDateTime } from '@/utils/date';
import { initials } from '@/utils/format';
import styles from './CommentThread.module.css';

interface Props {
  targetType: CommentTarget;
  targetId: ID;
  /** Personnes notifiées à chaque nouveau commentaire (hors auteur) */
  notifyUserIds: (ID | undefined)[];
  title: string;
  link: string;
  userName: (id?: string) => string;
}

/** Fil de commentaires horodatés, du plus ancien au plus récent. L'auteur peut modifier son commentaire. */
export function CommentThread({ targetType, targetId, notifyUserIds, title, link, userName }: Props) {
  const user = useCurrentUser();
  const comments = useCollection('comments');
  const add = useAddComment();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const thread = useMemo(
    () =>
      (comments.data ?? [])
        .filter((c) => c.targetType === targetType && c.targetId === targetId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [comments.data, targetType, targetId],
  );

  const submit = async () => {
    if (!text.trim()) {
      setError('Écrivez un commentaire avant de publier.');
      return;
    }
    setError(null);
    await add.mutateAsync({ targetType, targetId, text, author: user, notifyUserIds, title, link });
    setText('');
  };

  return (
    <QueryBoundary queries={[comments]} compact>
      {() => (
        <div className={styles.thread}>
          {thread.length === 0 ? (
            <EmptyState compact title="Aucun commentaire pour l’instant." />
          ) : (
            <ol className={styles.list}>
              {thread.map((c) => (
                <CommentItem key={c.id} comment={c} authorName={userName(c.authorId)} mine={c.authorId === user.id} />
              ))}
            </ol>
          )}
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              void submit().catch(() => undefined);
            }}
          >
            <TextAreaField
              label="Ajouter un commentaire"
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              error={error ?? undefined}
            />
            <div>
              <Button type="submit" variant="primary" size="sm" loading={add.isPending}>
                Publier
              </Button>
            </div>
          </form>
        </div>
      )}
    </QueryBoundary>
  );
}

function CommentItem({ comment, authorName, mine }: { comment: Comment; authorName: string; mine: boolean }) {
  const edit = useEditComment();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.text);

  return (
    <li className={styles.item}>
      <span className={styles.avatar} aria-hidden>
        {initials(authorName)}
      </span>
      <div className={styles.body}>
        <div className={styles.head}>
          <strong>{authorName}</strong>
          <time dateTime={comment.createdAt}>{formatDateTime(comment.createdAt)}</time>
          {comment.editedAt && <span className={styles.edited}>modifié</span>}
        </div>
        {editing ? (
          <div className={styles.editForm}>
            <TextAreaField label="Modifier le commentaire" hideLabel rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} />
            <div className={styles.editActions}>
              <Button size="sm" onClick={() => setEditing(false)}>
                Annuler
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={!draft.trim()}
                loading={edit.isPending}
                onClick={async () => {
                  await edit.mutateAsync({ id: comment.id, text: draft });
                  setEditing(false);
                }}
              >
                Enregistrer
              </Button>
            </div>
          </div>
        ) : (
          <p className={styles.text}>{comment.text}</p>
        )}
        {mine && !editing && (
          <button type="button" className={styles.editLink} onClick={() => setEditing(true)}>
            Modifier
          </button>
        )}
      </div>
    </li>
  );
}
