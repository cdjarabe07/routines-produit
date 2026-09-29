import { Fragment } from 'react';
import { Check } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Panel } from '@/components/ui/Panel';
import {
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  PROFILE_LABELS,
  ROLE_LABELS,
  ROLE_ORDER,
  ROLE_PROFILE,
  roleCan,
} from '@/services/auth/permissions';
import styles from './RolesPage.module.css';

/** Matrice des droits, lue directement depuis la source unique (services/auth/permissions.ts). */
export function RolesPage() {
  return (
    <>
      <PageHeader
        title="Rôles et droits"
        description="Permissions de chaque rôle. Les règles propres à une ressource (routine affectée, action confiée, réunion dont on est responsable) s’ajoutent à cette matrice."
      />
      <Panel flush>
        <div className={styles.scroller}>
          <table className={styles.table}>
            <caption className="visually-hidden">Permissions par rôle</caption>
            <thead>
              <tr>
                <th scope="col">Permission</th>
                {ROLE_ORDER.map((r) => (
                  <th key={r} scope="col">
                    {ROLE_LABELS[r]}
                    <span className={styles.profile}>{PROFILE_LABELS[ROLE_PROFILE[r]]}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_GROUPS.map((group) => (
                <Fragment key={group.label}>
                  <tr className={styles.group}>
                    <th scope="colgroup" colSpan={ROLE_ORDER.length + 1}>
                      {group.label}
                    </th>
                  </tr>
                  {group.permissions.map((p) => (
                    <tr key={p}>
                      <th scope="row">
                        {PERMISSION_LABELS[p]}
                        <code>{p}</code>
                      </th>
                      {ROLE_ORDER.map((r) => (
                        <td key={r}>
                          {roleCan(r, p) ? (
                            <Check size={18} aria-label="Autorisé" className={styles.yes} />
                          ) : (
                            <span className="visually-hidden">Non autorisé</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
