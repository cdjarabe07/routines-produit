/* Génère, depuis src/services/auth/permissions.ts :
   - supabase/migrations/0005_role_permissions.sql : matrice appliquée par la base (RLS, fonctions serveur) ;
   - docs/PERMISSIONS.md : la même matrice, lisible.
   Source unique : le serveur applique exactement la matrice affichée dans l'application.
   Usage : npm run db:permissions */
import fs from 'node:fs';
import { createServer } from 'vite';

const SCOPES = {
  operator: 'Lui-même (et les routines affectées à son équipe)',
  hancho: 'Son équipe',
  line_leader: 'Sa ligne (équipes et personnes de la ligne)',
  quality: 'Site',
  manager: 'Site',
  admin: 'Site',
};

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { PERMISSION_GROUPS, PERMISSION_LABELS, ROLE_LABELS, ROLE_ORDER, roleCan } =
    await server.ssrLoadModule('/src/services/auth/permissions.ts');
  const rows = [];
  for (const role of ROLE_ORDER)
    for (const g of PERMISSION_GROUPS) for (const p of g.permissions) if (roleCan(role, p)) rows.push(`  ('${role}', '${p}')`);
  const sql = `-- GÉNÉRÉ par scripts/gen-permissions-sql.mjs depuis src/services/auth/permissions.ts — ne pas modifier à la main.
begin;
delete from app.role_permissions where true;
insert into app.role_permissions (role, permission) values
${rows.join(',\n')};
commit;
`;
  fs.writeFileSync('supabase/migrations/0005_role_permissions.sql', sql);

  const header = `| Permission | ${ROLE_ORDER.map((r) => ROLE_LABELS[r]).join(' | ')} |\n| --- | ${ROLE_ORDER.map(() => ':---:').join(' | ')} |`;
  const groups = PERMISSION_GROUPS.map(
    (g) =>
      `### ${g.label}\n\n${header}\n${g.permissions
        .map((p) => `| ${PERMISSION_LABELS[p]} (\`${p}\`) | ${ROLE_ORDER.map((r) => (roleCan(r, p) ? '✓' : '')).join(' | ')} |`)
        .join('\n')}`,
  ).join('\n\n');
  const md = `# Rôles, permissions et périmètres

> GÉNÉRÉ par \`npm run db:permissions\` depuis \`src/services/auth/permissions.ts\` — ne pas modifier à la main.
> La même matrice alimente l'interface (écran « Rôles et droits ») et la base (\`app.role_permissions\`, migration 0005).
> En mode Supabase, c'est **la base** qui l'applique ; l'interface ne fait que masquer ce qui serait refusé.

## Périmètre des données par rôle

Une permission dit **quoi** ; le périmètre dit **sur qui**. Il est calculé par \`app.scope_level()\` à chaque requête.

| Rôle | Périmètre de supervision |
| --- | --- |
${ROLE_ORDER.map((r) => `| ${ROLE_LABELS[r]} | ${SCOPES[r]} |`).join('\n')}

Règles de ressource appliquées en plus par la base (\`docs/SECURITY_ARCHITECTURE.md\` §5) : on n'agit qu'en son propre nom (déclarant, auteur, exécutant), une routine terminée n'est plus modifiable, personne ne change son propre rôle ni ne se désactive, les notifications et le journal d'audit ne sont écrits que par le serveur.

## Matrice

${groups}
`;
  fs.writeFileSync('docs/PERMISSIONS.md', md);
  console.log(`${rows.length} permissions écrites (SQL et documentation)`);
} finally {
  await server.close();
}
