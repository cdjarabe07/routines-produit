# Routines atelier

Application métier de digitalisation des routines de travail d’un atelier de câblage : routines horodatées, actions, anomalies, Andon, séquences guidées, production, Gemba Walk, contrôles LQC, réunions, passations, reporting.

> **État actuel : mode DÉMO.** Données fictives stockées dans le navigateur, connexion par choix de profil **sans aucune sécurité**. Le passage à un backend et à une authentification réels est décrit dans [`docs/deployment.md`](docs/deployment.md).

Le prototype d’origine (`LL-App-LL.html`) est conservé dans [`legacy/`](legacy/) comme référence fonctionnelle ; il n’est pas utilisé par l’application.

## Démarrage rapide

Prérequis : Node.js ≥ 20 (testé avec Node 25) et npm.

```bash
npm install
npm run dev          # http://localhost:5173
```

Ouvrir l’application, choisir un profil (opérateur, Hancho, Line Leader, qualité, manager, administrateur) : chaque profil voit les écrans et actions correspondant à ses droits.

## Scripts

| Commande          | Rôle                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `npm run dev`     | Serveur de développement                                                                                                 |
| `npm run build`   | Vérification TypeScript (application et tests) puis build de production dans `dist/`                                     |
| `npm run preview` | Sert le build de production                                                                                              |
| `npm test`        | Tests unitaires et d’intégration (Vitest, 53 tests)                                                                      |
| `npm run e2e`     | Tests de bout en bout dans Microsoft Edge (Playwright) : toutes les routes × 3 rôles, 4 largeurs d’écran, parcours Andon |
| `npm run lint`    | ESLint (dont interdiction de `console.*` hors logger)                                                                    |
| `npm run format`  | Prettier                                                                                                                 |

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
UI (pages) → hooks métier (features/*/api.ts) → DataSource → Repository → localStorage (DÉMO) | HTTP (API)
                  └── règles pures (features/*/model.ts), testées unitairement
```

- Permissions : source unique `src/services/auth/permissions.ts`, jamais de test de rôle dans les composants.
- Indicateurs : toujours **calculés** à partir des enregistrements, jamais stockés ni simulés.
- Détails : [`docs/architecture.md`](docs/architecture.md).

## Mode DÉMO

- Jeu de données fictif généré relativement à la date du jour (30 jours d’historique), reproductible, marqué comme tel.
- Bandeau violet permanent « MODE DÉMO ».
- Réinitialisation : _Administration → Paramètres → Réinitialiser les données_.
- Les contenus du centre de connaissances repris du prototype portent le badge « Exemple à remplacer ».

## Passage au backend réel

1. Implémenter l’API REST décrite dans [`docs/deployment.md`](docs/deployment.md) (une ressource par collection).
2. `VITE_DATA_MODE=api` et `VITE_API_BASE_URL=…`.
3. Brancher le fournisseur d’identité derrière l’interface `AuthService` et passer `VITE_AUTH_MODE=oidc`.

Aucun composant d’écran n’est à modifier.

## Documentation

| Document                                             | Contenu                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| [`docs/legacy-audit.md`](docs/legacy-audit.md)       | Audit complet du prototype                                         |
| [`docs/functional-spec.md`](docs/functional-spec.md) | Rôles, permissions, modules, parcours, définitions des indicateurs |
| [`docs/architecture.md`](docs/architecture.md)       | Stack, structure, couches, erreurs, tests                          |
| [`docs/data-model.md`](docs/data-model.md)           | Entités et relations                                               |
| [`docs/design-system.md`](docs/design-system.md)     | Tokens, composants, règles d’usage                                 |
| [`docs/deployment.md`](docs/deployment.md)           | Hébergement, API, authentification, BI                             |
| [`docs/decisions.md`](docs/decisions.md)             | Décisions et hypothèses **à valider**                              |
