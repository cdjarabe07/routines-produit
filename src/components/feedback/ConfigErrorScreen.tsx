import styles from './ConfigErrorScreen.module.css';

/** Configuration invalide au démarrage : on refuse de lancer l'application plutôt que de fonctionner à moitié. */
export function ConfigErrorScreen({ errors }: { errors: string[] }) {
  return (
    <main className={styles.screen}>
      <div className={styles.box} role="alert">
        <h1>Configuration incomplète</h1>
        <p>L’application ne peut pas démarrer avec la configuration actuelle :</p>
        <ul>
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
        <p className={styles.hint}>
          Corrigez le fichier <code>.env</code> (voir <code>.env.example</code> et le README), puis relancez le build.
        </p>
      </div>
    </main>
  );
}
