import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Overlay';
import { useToast } from '@/components/ui/Toast';
import { createLogger } from '@/services/logger';

const log = createLogger('dashboard:report');

export function DailyReportDrawer({ open, onClose, text }: { open: boolean; onClose: () => void; text: string }) {
  const toast = useToast();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Rapport copié dans le presse-papiers.');
    } catch (error) {
      log.warn('Copie impossible', error);
      toast.error('Copie automatique impossible sur ce navigateur : sélectionnez le texte et copiez-le manuellement.');
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Rapport du jour"
      description="Généré à partir des données saisies. À coller dans un email ou une messagerie d’équipe."
      size="md"
      footer={
        <>
          <Button onClick={onClose}>Fermer</Button>
          <Button variant="primary" icon={<Copy size={16} aria-hidden />} onClick={copy}>Copier le texte</Button>
        </>
      }
    >
      <pre
        tabIndex={0}
        style={{
          whiteSpace: 'pre-wrap',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-sm)',
          lineHeight: 1.6,
          padding: 'var(--space-4)',
          background: 'var(--color-surface-muted)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          userSelect: 'text',
        }}
      >
        {text}
      </pre>
    </Drawer>
  );
}
