import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cx } from '@/utils/cx';
import styles from './Overlay.module.css';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface OverlayProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  kind: 'modal' | 'drawer';
  size?: 'sm' | 'md' | 'lg';
  /** Empêche la fermeture par Échap / clic extérieur (ex. pendant un enregistrement) */
  dismissible?: boolean;
  role?: 'dialog' | 'alertdialog';
}

/* Base commune Modal / Drawer : piège du focus, Échap, restauration du focus, blocage du défilement. */
function Overlay({ open, onClose, title, description, children, footer, kind, size = 'md', dismissible = true, role = 'dialog' }: OverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>('[data-autofocus]') ?? panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) {
        e.stopPropagation();
        onCloseRef.current();
      }
      if (e.key === 'Tab' && panel) {
        const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (nodes.length === 0) return;
        const firstNode = nodes[0]!;
        const lastNode = nodes[nodes.length - 1]!;
        if (e.shiftKey && document.activeElement === firstNode) {
          e.preventDefault();
          lastNode.focus();
        } else if (!e.shiftKey && document.activeElement === lastNode) {
          e.preventDefault();
          firstNode.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, dismissible]);

  if (!open) return null;

  return createPortal(
    <div className={cx(styles.backdrop, styles[`${kind}Backdrop`])} onMouseDown={(e) => { if (e.target === e.currentTarget && dismissible) onClose(); }}>
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cx(styles.panel, styles[kind], styles[size])}
      >
        <header className={styles.header}>
          <div>
            <h2 id={titleId} className={styles.title}>{title}</h2>
            {description && <p id={descId} className={styles.description}>{description}</p>}
          </div>
          {dismissible && (
            <button type="button" className={styles.close} onClick={onClose} aria-label="Fermer">
              <X size={18} aria-hidden />
            </button>
          )}
        </header>
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export type ModalProps = Omit<OverlayProps, 'kind'>;
export const Modal = (props: ModalProps) => <Overlay {...props} kind="modal" />;
export const Drawer = (props: ModalProps) => <Overlay {...props} kind="drawer" />;
