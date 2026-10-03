import { Link } from 'react-router';
import { Workflow } from 'lucide-react';
import { GLOSSARY, type HelpTopic } from '@/app/help';
import styles from './HelpPanel.module.css';

/** Contenu du panneau d'aide : rubrique de l'écran, liens utiles, lexique. */
export function HelpPanel({ topic, onNavigate }: { topic: HelpTopic; onNavigate: () => void }) {
  return (
    <div className={styles.panel}>
      <section aria-labelledby="help-purpose">
        <h3 id="help-purpose" className={styles.heading}>
          À quoi sert cet écran
        </h3>
        <p>{topic.purpose}</p>
      </section>

      <section aria-labelledby="help-steps">
        <h3 id="help-steps" className={styles.heading}>
          Comment faire
        </h3>
        <ol className={styles.steps}>
          {topic.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </section>

      {topic.tips && topic.tips.length > 0 && (
        <section aria-labelledby="help-tips">
          <h3 id="help-tips" className={styles.heading}>
            Bon à savoir
          </h3>
          <ul className={styles.tips}>
            {topic.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      )}

      {topic.related && topic.related.length > 0 && (
        <section aria-labelledby="help-related">
          <h3 id="help-related" className={styles.heading}>
            Voir aussi
          </h3>
          <ul className={styles.links}>
            {topic.related.map((r) => (
              <li key={r.to}>
                <Link to={r.to} onClick={onNavigate}>
                  {r.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link to="/processus" className={styles.process} onClick={onNavigate}>
        <Workflow size={16} aria-hidden />
        Comprendre l’enchaînement du travail : carte du processus
      </Link>

      <details className={styles.glossary}>
        <summary>Lexique de l’atelier</summary>
        <dl>
          {GLOSSARY.map((g) => (
            <div key={g.term} className={styles.entry}>
              <dt>{g.term}</dt>
              <dd>{g.definition}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
