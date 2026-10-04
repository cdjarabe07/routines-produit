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
    chef: 'u-yann',
  } as Record<string, string>,
  /** Durée de session */
  sessionTtlMs: 12 * 60 * 60 * 1000,
};

/** Accès rapide de la démo publique : un profil par grand rôle (comptes fictifs, données dans le navigateur). */
export const DEMO_PROFILES = [
  {
    alias: 'operateur',
    role: 'Opérateur',
    person: 'Nadia Roussel',
    description: 'Ses routines du jour, l’Andon, le signalement d’anomalies.',
  },
  {
    alias: 'chef',
    role: 'Chef d’équipe',
    person: 'Yann Duclos',
    description: 'Son équipe, les alertes à prendre en charge, la passation.',
  },
  {
    alias: 'manager',
    role: 'Manager',
    person: 'Xavier Dupont',
    description: 'Le pilotage de l’atelier, les actions correctives, le reporting.',
  },
  {
    alias: 'admin',
    role: 'Administrateur',
    person: 'Claire Fontaine',
    description: 'La configuration : routines, planification, utilisateurs, modules.',
  },
] as const;

export const demoCredentials = (alias: string) => ({ identifier: alias, password: MOCK_AUTH.password });
