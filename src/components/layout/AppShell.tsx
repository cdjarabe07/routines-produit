import { Suspense, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { moduleOfPath, useModules } from '@/app/modules';
import { useTelemetry } from '@/app/telemetry';
import { accessibleSpaces, homeSpace, spaceOfPath, type SpaceId } from '@/app/navigation';
import { useAuth, useCurrentUser } from '@/app/providers/AuthProvider';
import { useDataSource } from '@/app/providers/DataSourceProvider';
import { LoadingState } from '@/components/feedback/States';
import { Drawer } from '@/components/ui/Overlay';
import { useSettings } from '@/features/shared/api';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { ModuleDisabled, SectionTabs } from './SectionTabs';
import { SideNav } from './SideNav';
import { TopBar } from './TopBar';
import styles from './AppShell.module.css';

export function AppShell() {
  const [navOpen, setNavOpen] = useState(false);
  const ds = useDataSource();
  const online = useOnlineStatus();
  const { settings } = useSettings();
  const space = useCurrentSpace();
  const { pathname } = useLocation();
  const { pathEnabled } = useModules();
  const disabledModule = pathEnabled(pathname) ? null : moduleOfPath(pathname);
  useTelemetry();

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
          <SideNav space={space} />
        </div>
      </aside>

      <Drawer open={navOpen} onClose={() => setNavOpen(false)} title="Menu" size="sm" side="left">
        <div className="nav-light">
          <SideNav space={space} onNavigate={() => setNavOpen(false)} />
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
            <SectionTabs />
            <Suspense fallback={<LoadingState />}>{disabledModule ? <ModuleDisabled module={disabledModule} /> : <Outlet />}</Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}

/**
 * Espace affiché dans le menu : celui de l'adresse courante ; pour un écran de détail commun
 * (action, anomalie, Andon…), le dernier espace visité ; à défaut, l'espace d'accueil du profil.
 */
function useCurrentSpace(): SpaceId {
  const user = useCurrentUser();
  const { can } = useAuth();
  const { pathname } = useLocation();
  const fromPath = spaceOfPath(pathname);
  const [last, setLast] = useState<SpaceId>(() => fromPath ?? homeSpace(user.role));
  // Mémorise le dernier espace visité (mise à jour pendant le rendu, sans effet)
  if (fromPath && fromPath !== last) setLast(fromPath);
  const wanted = fromPath ?? last;
  const allowed = accessibleSpaces(can).map((s) => s.space.id);
  return allowed.includes(wanted) ? wanted : (allowed[0] ?? 'app');
}
