import { NavLink, useNavigate } from 'react-router';
import { accessibleSpaces, SPACES, visibleGroups, type SpaceId } from '@/app/navigation';
import { useAuth } from '@/app/providers/AuthProvider';
import { useNavCounts } from '@/app/useNavCounts';
import { cx } from '@/utils/cx';
import styles from './SideNav.module.css';

/** Sélecteur d'espace (si plusieurs) et menu de l'espace courant, filtré par permission. */
export function SideNav({ space, onNavigate }: { space: SpaceId; onNavigate?: () => void }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const counts = useNavCounts();
  const spaces = accessibleSpaces(can);
  const current = SPACES.find((s) => s.id === space) ?? SPACES[0]!;
  const groups = visibleGroups(current, can);

  return (
    <nav aria-label="Navigation principale" className={styles.nav}>
      {spaces.length > 1 && (
        <div className={styles.spaces} role="group" aria-label="Espaces">
          {spaces.map(({ space: s, entry }) => (
            <button
              key={s.id}
              type="button"
              className={cx(styles.space, s.id === current.id && styles.spaceActive)}
              aria-pressed={s.id === current.id}
              onClick={() => {
                navigate(entry);
                onNavigate?.();
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
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
                    end={item.end}
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
