# Routines atelier

Application métier de digitalisation des routines de travail d’un atelier de câblage. Elle suit la chaîne :

```text
ADMINISTRATION (configure) → PLANIFICATION (affecte) → MON TRAVAIL (exécute, signale) → SUPERVISION (suit, corrige) → REPORTING
```

Modules : routines et tâches, checklists typées, planification, séquences guidées, réunions et agenda, actions correctives, anomalies, Andon, production et kanban, plan de l’atelier, Gemba Walk, contrôles LQC, passations, centre de connaissances, reporting.

> **État actuel : environnement simulé, non sécurisé.** Les données sont stockées dans le navigateur de chaque poste. La connexion passe par un fournisseur d’authentification **simulé** : les identifiants sont dans le code livré au navigateur et les droits ne sont appliqués que côté client. Ce n’est pas une sécurité. Le passage à un backend et à une authentification réels est décrit dans [`docs/deployment.md`](docs/deployment.md).

Le prototype d’origine (`LL-App-LL.html`) est conservé dans [`legacy/`](legacy/) comme référence fonctionnelle ; il n’est pas utilisé par l’application.

## Démarrage rapide

Prérequis : Node.js ≥ 20 (testé avec Node 25) et npm.

```bash
npm install
npm run dev          # http://localhost:5173
```

### Comptes de test

Mot de passe de tous les comptes : `Routines2026` (défini dans `src/services/auth/mock/accounts.ts`).

| Identifiant | Personne        | Profil         | Arrive sur         |
| ----------- | --------------- | -------------- | ------------------ |
| `admin`     | Claire Fontaine | Administrateur | `/admin/dashboard` |
| `manager`   | Xavier Dupont   | Responsable    | `/manager`         |
| `operateur` | Nadia Roussel   | Utilisateur    | `/app`             |

Tout utilisateur actif peut aussi se connecter avec son email (`karim.benali@atelier.local` pour le Line Leader, `yann.duclos@atelier.local` pour le Hancho, `aicha.camara@atelier.local` pour la LQC…). Voir [`docs/role-model.md`](docs/role-model.md).

### Espaces

| Espace             | Pour qui                           | Contenu                                                                                                            |
| ------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Mon travail**    | tout le monde                      | tableau de bord « maintenant », mon planning, mes routines (exécution chronométrée), mes actions, mes réunions     |
| **Supervision**    | Line Leader, manager, Hancho, LQC  | vue d’ensemble, équipe, suivi des routines par personne, Andon, production, anomalies, actions, qualité, reporting |
| **Administration** | administrateur (manager : partiel) | utilisateurs, équipes, routines et tâches, checklists, séquences, planification, réunions, agenda, connaissances   |

## Scripts

| Commande          | Rôle                                                                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`     | Serveur de développement                                                                                                                                          |
| `npm run build`   | Vérification TypeScript (application et tests) puis build de production dans `dist/`                                                                              |
| `npm run preview` | Sert le build de production                                                                                                                                       |
| `npm test`        | Tests unitaires et d’intégration (Vitest, 71 tests)                                                                                                               |
| `npm run e2e`     | Tests de bout en bout dans Edge (Playwright) : scénarios administration → exécution → Andon → reporting, 49 routes × 4 profils, 4 largeurs, audit axe WCAG 2.1 AA |
| `npm run lint`    | ESLint (dont interdiction de `console.*` hors logger)                                                                                                             |
| `npm run screens` | Captures d’écran pour l’audit visuel (`npm run screens -- <url> <dossier> <profil> <routes…>`)                                                                    |
| `npm run format`  | Prettier                                                                                                                                                          |

## Configuration

Copier `.env.example` en `.env.local` et ajuster :

| Variable                 | Valeurs           | Défaut        | Rôle                                                            |
| ------------------------ | ----------------- | ------------- | --------------------------------------------------------------- |
| `VITE_DATA_MODE`         | `demo` \| `api`   | `demo`        | Source des données                                              |
| `VITE_API_BASE_URL`      | URL               | —             | Backend REST (obligatoire si `api`)                             |
| `VITE_AUTH_MODE`         | `demo` \| `oidc`  | `demo`        | `oidc` bloque l’accès tant que le fournisseur n’est pas branché |
| `VITE_BI_EMBED_URL`      | URL https         | —             | Rapport BI intégré (sinon « non connecté »)                     |
| `VITE_BI_ALLOWED_ORIGIN` | origine https     | —             | Contrôle de l’origine du rapport                                |
| `VITE_LOG_LEVEL`         | `debug` … `error` | `warn` (prod) | Seuil de journalisation                                         |

Une configuration invalide affiche un écran d’erreur explicite au démarrage au lieu de lancer une application à moitié fonctionnelle.

## Architecture en bref

React 19 + TypeScript strict + Vite, React Router (routes chargées à la demande), TanStack Query, CSS Modules + design tokens, aucune bibliothèque de composants.

```
UI (pages) → hooks métier (features/*/api.ts) → DataSource → Repository → localStorage (simulé) | HTTP (API)
                  └── règles pures (features/*/model.ts), testées unitairement
```

- Permissions : source unique `src/services/auth/permissions.ts` (rôle → permissions) et `policies.ts` (`can(user, permission, ressource)`), jamais de test de rôle dans les composants.
- Authentification : `AuthService` → `MockAuthProvider` (actuel) ou fournisseur réel (à brancher).
- Indicateurs : toujours **calculés** à partir des enregistrements, jamais stockés ni simulés.
- Détails : [`docs/architecture.md`](docs/architecture.md).

## Environnement simulé

- L’interface ne montre aucun mécanisme de démonstration : connexion par identifiant et mot de passe, aucun bandeau. Le caractère simulé est indiqué à l’administrateur seulement (_Administration → Paramètres_ : « Stockage local du navigateur », « Comptes locaux — non sécurisé ») et dans cette documentation.
- Jeu initial généré relativement à la date du jour, reproductible : 12 personnes fictives, 4 équipes, 12 routines avec leurs tâches et checklists, 13 planifications, 30 jours d’exécutions **générées** (elles alimentent le reporting comme des saisies), réunions, Andon, actions.
- Les standards du centre de connaissances sont des contenus génériques marqués « À valider » (visible dans l’administration).
- Réinitialisation : _Administration → Paramètres → Réinitialiser l’environnement_.

## Passage au backend réel

1. Implémenter l’API REST décrite dans [`docs/deployment.md`](docs/deployment.md) (une ressource par collection).
2. `VITE_DATA_MODE=api` et `VITE_API_BASE_URL=…`.
3. Brancher le fournisseur d’identité derrière l’interface `AuthService` et passer `VITE_AUTH_MODE=oidc`.

Aucun composant d’écran n’est à modifier.

## Documentation

| Document                                                     | Contenu                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------ |
| [`docs/current-state.md`](docs/current-state.md)             | Audit avant la séparation administration / exécution               |
| [`docs/role-model.md`](docs/role-model.md)                   | Espaces, profils, rôles, routes d’entrée, comptes de test          |
| [`docs/permission-matrix.md`](docs/permission-matrix.md)     | Matrice des permissions et règles par ressource                    |
| [`docs/functional-gaps.md`](docs/functional-gaps.md)         | Écarts fonctionnels identifiés                                     |
| [`docs/implementation-plan.md`](docs/implementation-plan.md) | Plan d’implémentation par phase                                    |
| [`docs/legacy-audit.md`](docs/legacy-audit.md)               | Audit complet du prototype                                         |
| [`docs/functional-spec.md`](docs/functional-spec.md)         | Rôles, permissions, modules, parcours, définitions des indicateurs |
| [`docs/architecture.md`](docs/architecture.md)               | Stack, structure, couches, erreurs, tests                          |
| [`docs/data-model.md`](docs/data-model.md)                   | Entités et relations                                               |
| [`docs/design-system.md`](docs/design-system.md)             | Tokens, composants, règles d’usage                                 |
| [`docs/deployment.md`](docs/deployment.md)                   | Hébergement, API, authentification, BI                             |
| [`docs/decisions.md`](docs/decisions.md)                     | Décisions et hypothèses **à valider**                              |
