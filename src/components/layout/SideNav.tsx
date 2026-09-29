import { NavLink } from 'react-router';
import { NAVIGATION } from '@/app/navigation';
import { useAuth } from '@/app/providers/AuthProvider';
import { useNavCounts } from '@/app/useNavCounts';
import { cx } from '@/utils/cx';
import styles from './SideNav.module.css';

/** Menu principal filtré par permission, avec compteurs d'attention. */
export function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const { can } = useAuth();
  const counts = useNavCounts();

  const groups = NAVIGATION.map((g) => ({ ...g, items: g.items.filter((i) => !i.permission || can(i.permission)) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <nav aria-label="Navigation principale" className={styles.nav}>
      {groups.map((group) => (
        <div key={group.label} className={styles.group}>
          <p className={styles.groupLabel}>{group.label}</p>
          <ul>
            {group.items.map((item) => {
              const count = item.count ? counts[item.count] : undefined;
              const Icon = item.icon;
              return (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    end={item.path === '/'}
                    className={({ isActive }) => cx(styles.link, isActive && styles.active)}
                    onClick={onNavigate}
                  >
                    <Icon size={18} aria-hidden className={styles.icon} />
                    <span className={styles.label}>{item.label}</span>
                    {count && count.value > 0 && (
                      <span className={cx(styles.count, count.urgent && styles.urgent)}>
                        {count.value}
                        <span className="visually-hidden"> {count.urgent ? 'dont en retard ou en attente' : 'à traiter'}</span>
                      </span>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
