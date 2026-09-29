import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/feedback/States';

/** TEMPORAIRE pendant le rebuild : remplacé module par module, supprimé avant la livraison. */
export function UnderConstruction({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState title="Module en cours de reconstruction" description="Cet écran sera livré dans une prochaine étape du rebuild." />
    </>
  );
}
