import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Bell, CircleHelp, LogOut, Menu as MenuIcon, Siren, TriangleAlert, UserRound } from 'lucide-react';
import { helpFor } from '@/app/help';
import { Can, useAuth } from '@/app/providers/AuthProvider';
import { Button, IconButton } from '@/components/ui/Button';
import { Menu } from '@/components/ui/Menu';
import { Drawer } from '@/components/ui/Overlay';
import { useMarkNotificationsRead, useMyNotifications } from '@/features/notifications/api';
import { useSettings } from '@/features/shared/api';
import { useNow } from '@/hooks/useNow';
import { ROLE_LABELS } from '@/services/auth/permissions';
import { formatDateTime, formatLongDate, formatTime } from '@/utils/date';
import { initials } from '@/utils/format';
import { cx } from '@/utils/cx';
import styles from './TopBar.module.css';

export function TopBar({ onOpenNav }: { onOpenNav: () => void }) {
  const { user, signOut, service } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const now = useNow(30_000);
  const { settings } = useSettings();
  const [helpOpen, setHelpOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifications = useMyNotifications();
  const markRead = useMarkNotificationsRead();
  const help = helpFor(pathname);

  if (!user) return null;

  return (
    <header className={styles.bar}>
      <div className={styles.left}>
        <IconButton label="Ouvrir le menu" icon={<MenuIcon size={20} />} className={styles.menuButton} onClick={onOpenNav} />
        <div className={styles.context}>
          <span className={styles.plant}>{settings.plantName}</span>
          <span className={styles.clock}>
            <span className={styles.date}>{formatLongDate(now)} · </span>
            <time dateTime={now.toISOString()}>{formatTime(now)}</time>
          </span>
        </div>
      </div>

      <div className={styles.right}>
        <Can permission="anomaly.create">
          <Button size="sm" icon={<TriangleAlert size={16} aria-hidden />} onClick={() => navigate('/signaler')} className={styles.quick}>
            Signaler
          </Button>
        </Can>
        <Can permission="andon.raise">
          <Button
            size="sm"
            variant="danger"
            icon={<Siren size={16} aria-hidden />}
            onClick={() => navigate('/andon?declencher=1')}
            className={styles.quick}
          >
            Andon
          </Button>
        </Can>

        <IconButton
          label={notifications.unread ? `Notifications (${notifications.unread} non lues)` : 'Notifications'}
          icon={
            <span className={styles.bellWrap}>
              <Bell size={19} />
              {notifications.unread > 0 && <span className={styles.bellCount}>{notifications.unread}</span>}
            </span>
          }
          onClick={() => setNotifOpen(true)}
        />
        <IconButton label="Aide sur cet écran" icon={<CircleHelp size={19} />} onClick={() => setHelpOpen(true)} />

        <Menu
          header={
            <div>
              <strong>{user.name}</strong>
              <div className={styles.menuRole}>
                {ROLE_LABELS[user.role]}
                {user.zoneLabel ? ` · ${user.zoneLabel}` : ''}
              </div>
              {service.mode === 'demo' && <div className={styles.menuDemo}>Session de démonstration — aucune authentification</div>}
            </div>
          }
          items={[
            ...(service.mode === 'demo'
              ? [{ label: 'Changer de profil', icon: <UserRound size={16} aria-hidden />, onSelect: () => void signOut() }]
              : []),
            { label: 'Se déconnecter', icon: <LogOut size={16} aria-hidden />, onSelect: () => void signOut() },
          ]}
          trigger={(props) => (
            <button type="button" className={styles.user} {...props} aria-label={`Compte : ${user.name}`}>
              <span className={styles.avatar} aria-hidden>
                {initials(user.name)}
              </span>
              <span className={styles.userText}>
                <span className={styles.userName}>{user.name}</span>
                <span className={styles.userRole}>{ROLE_LABELS[user.role]}</span>
              </span>
            </button>
          )}
        />
      </div>

      <Drawer open={helpOpen} onClose={() => setHelpOpen(false)} title={`Aide — ${help.title}`} size="sm">
        <ul className={styles.helpList}>
          {help.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </Drawer>

      <Drawer
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        title="Notifications"
        description="Notifications internes. L’envoi d’emails n’est pas configuré."
        size="sm"
        footer={
          notifications.unread > 0 ? (
            <Button
              size="sm"
              loading={markRead.isPending}
              onClick={() => markRead.mutate(notifications.items.filter((n) => !n.readAt).map((n) => n.id))}
            >
              Tout marquer comme lu
            </Button>
          ) : undefined
        }
      >
        {notifications.items.length === 0 ? (
          <p className={styles.empty}>Aucune notification.</p>
        ) : (
          <ul className={styles.notifList}>
            {notifications.items.slice(0, 30).map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className={cx(styles.notif, !n.readAt && styles.unread)}
                  onClick={() => {
                    if (!n.readAt) markRead.mutate([n.id]);
                    setNotifOpen(false);
                    if (n.link) navigate(n.link);
                  }}
                >
                  <span className={styles.notifTitle}>{n.title}</span>
                  <span className={styles.notifDate}>{formatDateTime(n.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Drawer>
    </header>
  );
}
