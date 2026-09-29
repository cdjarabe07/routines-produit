import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { QueryBoundary } from '@/components/feedback/States';
import { useCollection } from '@/hooks/useData';
import { ROLE_LABELS, ROLE_ORDER } from '@/services/auth/permissions';
import { initials } from '@/utils/format';
import styles from './LoginPage.module.css';

/** Retour après connexion : chemin interne uniquement (pas de redirection ouverte). */
function safeReturn(value: string | null) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

export function LoginPage() {
  const { status, service, signIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const target = safeReturn(params.get('retour'));
  const users = useCollection('users');

  if (status === 'signedIn') return <Navigate to={target} replace />;

  if (!service.available) {
    return (
      <main className={styles.screen}>
        <div className={styles.card}>
          <ShieldAlert size={28} className={styles.alertIcon} aria-hidden />
          <h1 className={styles.title}>Authentification non configurée</h1>
          <p className={styles.text}>
            Le mode d’authentification « {service.mode} » est demandé mais aucun fournisseur n’est branché. L’accès est
            bloqué par sécurité. Consultez <code>docs/deployment.md</code>, section « Authentification ».
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.screen}>
      <div className={styles.card}>
        <header className={styles.header}>
          <span className={styles.mark} aria-hidden>RA</span>
          <div>
            <h1 className={styles.title}>Routines atelier</h1>
            <p className={styles.subtitle}>Digitalisation des routines — atelier de câblage</p>
          </div>
        </header>

        <div className={styles.demoNotice} role="note">
          <strong>Mode démonstration.</strong> Aucune authentification : choisissez un profil pour découvrir l’application
          avec ses droits. Les données sont fictives et restent dans ce navigateur.
        </div>

        <QueryBoundary queries={[users]}>
          {() => (
            <div className={styles.roles}>
              {ROLE_ORDER.map((role) => {
                const members = (users.data ?? []).filter((u) => u.active && u.role === role);
                if (members.length === 0) return null;
                return (
                  <section key={role} aria-labelledby={`role-${role}`}>
                    <h2 id={`role-${role}`} className={styles.roleTitle}>{ROLE_LABELS[role]}</h2>
                    <ul className={styles.profiles}>
                      {members.map((u) => (
                        <li key={u.id}>
                          <button
                            type="button"
                            className={styles.profile}
                            onClick={async () => {
                              await signIn(u.id);
                              navigate(target, { replace: true });
                            }}
                          >
                            <span className={styles.avatar} aria-hidden>{initials(u.name)}</span>
                            <span className={styles.profileText}>
                              <span className={styles.name}>{u.name}</span>
                              <span className={styles.zone}>{u.zoneLabel ?? ROLE_LABELS[u.role]}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </QueryBoundary>
      </div>
    </main>
  );
}
