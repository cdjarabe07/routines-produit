import { useState } from 'react';
import { Gauge } from 'lucide-react';
import { LoadingState } from '@/components/feedback/States';
import type { BIConfig } from './biProvider';
import styles from './BIPage.module.css';

/** Intégration d'un rapport BI externe dans une iframe isolée. Placeholder explicite si non configuré. */
export function BIEmbed({ config, title }: { config: BIConfig; title: string }) {
  const [loaded, setLoaded] = useState(false);

  if (config.status !== 'configured') {
    return (
      <div className={styles.placeholder}>
        <Gauge size={32} aria-hidden />
        <p className={styles.placeholderTitle}>{config.status === 'invalid' ? 'Configuration BI invalide' : 'Tableau BI non connecté'}</p>
        {config.status === 'invalid' ? (
          <p>{config.reason}</p>
        ) : (
          <>
            <p>Aucun rapport Power BI (ou autre outil) n’est configuré pour cette installation. Rien n’est simulé ici.</p>
            <ol className={styles.steps}>
              <li>
                Publier le rapport et obtenir son URL d’intégration sécurisée (ex. Power BI « Incorporer » avec authentification Entra ID).
              </li>
              <li>
                Renseigner <code>VITE_BI_EMBED_URL</code> et <code>VITE_BI_ALLOWED_ORIGIN</code> dans la configuration.
              </li>
              <li>
                Reconstruire et redéployer l’application (voir <code>docs/deployment.md</code>).
              </li>
            </ol>
          </>
        )}
      </div>
    );
  }

  return (
    <div className={styles.frameWrap}>
      {!loaded && <LoadingState label="Chargement du rapport…" />}
      <iframe
        src={config.url}
        title={title}
        className={styles.frame}
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        referrerPolicy="no-referrer"
        allow="fullscreen"
        onLoad={() => setLoaded(true)}
        style={{ visibility: loaded ? 'visible' : 'hidden' }}
      />
    </div>
  );
}
