/* Comptes du fournisseur d'authentification simulé (docs/role-model.md §5).
   SEUL endroit où figurent des identifiants : aucun composant d'interface ne les connaît.
   Ce mécanisme n'offre AUCUNE sécurité : il est livré dans le code du navigateur. */

export const MOCK_AUTH = {
  /** Mot de passe initial de tous les comptes simulés, y compris ceux créés par l'administrateur. */
  password: 'Routines2026',
  /** Identifiants courts des comptes de référence → utilisateur. Tout utilisateur actif peut aussi se connecter avec son email. */
  aliases: {
    admin: 'u-admin',
    manager: 'u-dupont',
    operateur: 'u-nadia',
  } as Record<string, string>,
  /** Durée de session */
  sessionTtlMs: 12 * 60 * 60 * 1000,
};
