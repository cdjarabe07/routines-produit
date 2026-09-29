import { Suspense, useState } from 'react';
import { Outlet } from 'react-router';
import { useDataSource } from '@/app/providers/DataSourceProvider';
import { LoadingState } from '@/components/feedback/States';
import { Drawer } from '@/components/ui/Overlay';
import { useSettings } from '@/features/shared/api';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { SideNav } from './SideNav';
import { TopBar } from './TopBar';
import styles from './AppShell.module.css';

export function AppShell() {
  const [navOpen, setNavOpen] = useState(false);
  const ds = useDataSource();
  const online = useOnlineStatus();
  const { settings } = useSettings();

  return (
    <div className={styles.shell}>
      <a href="#contenu" className={styles.skip}>
        Aller au contenu
      </a>

      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden>
            RA
          </span>
          <span className={styles.brandText}>
            <strong>Routines atelier</strong>
            <span>{settings.plantName}</span>
          </span>
        </div>
        <div className={styles.sidebarScroll}>
          <SideNav />
        </div>
      </aside>

      <Drawer open={navOpen} onClose={() => setNavOpen(false)} title="Menu" size="sm" side="left">
        <div className="nav-light">
          <SideNav onNavigate={() => setNavOpen(false)} />
        </div>
      </Drawer>

      <div className={styles.column}>
        <TopBar onOpenNav={() => setNavOpen(true)} />
        {!online && (
          <div className={styles.offline} role="status">
            Hors ligne.{' '}
            {ds.kind === 'demo'
              ? 'Vos saisies restent enregistrées sur cet appareil.'
              : 'Les modifications ne peuvent pas être enregistrées tant que la connexion n’est pas rétablie.'}
          </div>
        )}
        <main id="contenu" className={styles.main} tabIndex={-1}>
          <div className={styles.content}>
            <Suspense fallback={<LoadingState />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
