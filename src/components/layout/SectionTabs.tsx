import { Link, useLocation } from 'react-router';
import { PackageX } from 'lucide-react';
import { MODULES, useModules, type ModuleKey } from '@/app/modules';
import { sectionOf, visibleTabs } from '@/app/navigation';
import { useAuth } from '@/app/providers/AuthProvider';
import { EmptyState } from '@/components/feedback/States';
import { cx } from '@/utils/cx';
import styles from './SectionTabs.module.css';

/** Onglets des écrans regroupés sous une même entrée de menu (ex. Calendrier | Gestion des réunions). */
export function SectionTabs() {
  const { pathname } = useLocation();
  const { can } = useAuth();
  const { pathEnabled } = useModules();
  const section = sectionOf(pathname);
  const tabs = section ? visibleTabs(section, can, pathEnabled) : [];
  if (tabs.length < 2) return null;
  return (
    <nav aria-label="Sections" className={styles.tabs}>
      {tabs.map((t) => (
        <Link
          key={t.path}
          to={t.path}
          className={cx(styles.tab, t.path === pathname && styles.current)}
          aria-current={t.path === pathname ? 'page' : undefined}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** Écran d'un module désactivé dans les paramètres */
export function ModuleDisabled({ module }: { module: ModuleKey }) {
  const { can } = useAuth();
  return (
    <EmptyState
      icon={<PackageX size={28} />}
      title="Module désactivé"
      description={`« ${MODULES[module].label} » n’est pas utilisé sur ce site. Aucune donnée n’a été supprimée : un administrateur peut le réactiver dans les paramètres.`}
      action={can('settings.manage') ? <Link to="/admin/parametres">Ouvrir les paramètres</Link> : undefined}
    />
  );
}
