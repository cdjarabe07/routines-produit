import { Check } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { ALL_PERMISSIONS, PERMISSION_LABELS, ROLE_LABELS, ROLE_ORDER, roleCan } from '@/services/auth/permissions';
import styles from './RolesPage.module.css';

/** Matrice des droits, lue directement depuis la source unique (services/auth/permissions.ts). */
export function RolesPage() {
  return (
    <>
      <PageHeader
        title="Rôles & droits"
        description="Matrice de référence des permissions par rôle. Elle est définie dans le code (source unique) ; la rendre paramétrable nécessite un backend."
      />
      <Panel flush>
        <div className={styles.scroller}>
          <table className={styles.table}>
            <caption className="visually-hidden">Permissions par rôle</caption>
            <thead>
              <tr>
                <th scope="col">Permission</th>
                {ROLE_ORDER.map((r) => <th key={r} scope="col">{ROLE_LABELS[r]}</th>)}
              </tr>
            </thead>
            <tbody>
              {ALL_PERMISSIONS.map((p) => (
                <tr key={p}>
                  <th scope="row">
                    {PERMISSION_LABELS[p]}
                    <code>{p}</code>
                  </th>
                  {ROLE_ORDER.map((r) => (
                    <td key={r}>{roleCan(r, p) ? <Check size={18} aria-label="Autorisé" className={styles.yes} /> : <span className="visually-hidden">Non autorisé</span>}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
