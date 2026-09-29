import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { toUserMessage } from '@/services/errors';
import styles from './LoginPage.module.css';

/** Retour après connexion : chemin interne uniquement (pas de redirection ouverte). */
function safeReturn(value: string | null) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : null;
}

export function LoginPage() {
  const { status, service, user } = useAuth();
  const [params, setParams] = useSearchParams();
  const target = safeReturn(params.get('retour'));
  const view = params.get('vue') === 'mot-de-passe' ? 'reset' : 'signin';

  if (status === 'signedIn' && user) return <Navigate to={target ?? '/'} replace />;

  if (!service.available) {
    return (
      <main className={styles.screen}>
        <div className={styles.card}>
          <ShieldAlert size={28} className={styles.alertIcon} aria-hidden />
          <h1 className={styles.title}>Authentification non configurée</h1>
          <p className={styles.text}>
            Le mode d’authentification « {service.mode} » est demandé mais aucun fournisseur n’est branché. L’accès est bloqué par sécurité.
            Consultez <code>docs/deployment.md</code>, section « Authentification ».
          </p>
        </div>
      </main>
    );
  }

  const switchView = (next: 'signin' | 'reset') => {
    const p = new URLSearchParams(params);
    if (next === 'reset') p.set('vue', 'mot-de-passe');
    else p.delete('vue');
    setParams(p, { replace: true });
  };

  return (
    <main className={styles.screen}>
      <div className={styles.card}>
        <header className={styles.header}>
          <span className={styles.mark} aria-hidden>
            RA
          </span>
          <div>
            <p className={styles.product}>Routines atelier</p>
            <p className={styles.subtitle}>Digitalisation des routines de travail</p>
          </div>
        </header>
        {view === 'signin' ? (
          <SignInForm target={target} onForgot={() => switchView('reset')} />
        ) : (
          <ResetForm onBack={() => switchView('signin')} />
        )}
      </div>
    </main>
  );
}

function SignInForm({ target, onForgot }: { target: string | null; onForgot: () => void }) {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ identifier?: string; password?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = {
      identifier: identifier.trim() ? undefined : 'Saisissez votre identifiant ou votre email',
      password: password ? undefined : 'Saisissez votre mot de passe',
    };
    setFieldErrors(errors);
    setError(null);
    if (errors.identifier || errors.password) return;
    setSubmitting(true);
    try {
      await signIn({ identifier, password });
      navigate(target ?? '/', { replace: true });
    } catch (err) {
      setError(toUserMessage(err));
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className={styles.form} aria-labelledby="login-title">
      <h1 id="login-title" className={styles.title}>
        Connexion
      </h1>
      {error && (
        <p className={styles.formError} role="alert">
          {error}
        </p>
      )}
      <TextField
        label="Identifiant ou email"
        name="username"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        autoFocus
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        error={fieldErrors.identifier}
      />
      <div className={styles.passwordField}>
        <TextField
          label="Mot de passe"
          name="password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
        />
        <button
          type="button"
          className={styles.reveal}
          onClick={() => setShowPassword((v) => !v)}
          aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          aria-pressed={showPassword}
        >
          {showPassword ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
        </button>
      </div>
      <Button type="submit" variant="primary" loading={submitting} className={styles.submit}>
        Se connecter
      </Button>
      <button type="button" className={styles.link} onClick={onForgot}>
        Mot de passe oublié ?
      </button>
    </form>
  );
}

function ResetForm({ onBack }: { onBack: () => void }) {
  const { requestPasswordReset } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) {
      setError('Saisissez votre identifiant ou votre email');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await requestPasswordReset(identifier);
      setSent(true);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className={styles.form} aria-labelledby="reset-title">
      <h1 id="reset-title" className={styles.title}>
        Mot de passe oublié
      </h1>
      {sent ? (
        <p className={styles.formSuccess} role="status">
          Demande transmise. Si un compte correspond à cet identifiant, l’administrateur de l’application est prévenu et vous communiquera
          un nouveau mot de passe.
        </p>
      ) : (
        <>
          <p className={styles.text}>
            Les mots de passe sont gérés par l’administrateur de l’application. Indiquez votre identifiant : il sera prévenu.
          </p>
          <TextField
            label="Identifiant ou email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            autoFocus
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            error={error ?? undefined}
          />
          <Button type="submit" variant="primary" loading={submitting} className={styles.submit}>
            Transmettre la demande
          </Button>
        </>
      )}
      <button type="button" className={styles.link} onClick={onBack}>
        Retour à la connexion
      </button>
    </form>
  );
}
