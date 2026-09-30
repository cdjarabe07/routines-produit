# Routines atelier

Application métier de digitalisation des routines de travail d’un atelier de câblage. Elle suit la chaîne :

```text
ADMINISTRATION (configure) → PLANIFICATION (affecte) → MON TRAVAIL (exécute, signale) → SUPERVISION (suit, corrige) → REPORTING
```

Modules : routines et tâches, checklists typées, planification, séquences guidées, réunions et agenda, actions correctives, anomalies, Andon, production et kanban, plan de l’atelier, Gemba Walk, contrôles LQC, passations, centre de connaissances, reporting.

> **Deux modes, deux niveaux de sécurité.**
>
> - **Mode Supabase** (`VITE_DATA_MODE=supabase`) : comptes serveur (Supabase Auth), droits et périmètres appliqués **par la base** (RLS, triggers), journal d’audit serveur. Projet actuel : **démonstration**, région UE, aucune donnée réelle. Voir [`docs/SECURITY_ARCHITECTURE.md`](docs/SECURITY_ARCHITECTURE.md).
> - **Mode démo local** (défaut) : données dans le navigateur, comptes **simulés** dont le mot de passe est dans le code. **Aucune sécurité** : réservé au développement et aux tests hors ligne.
>
> Ce n’est pas une application « sécurisée pour la production » : ce qui manque avant des données réelles est listé dans [`docs/SECURITY_ARCHITECTURE.md` §11](docs/SECURITY_ARCHITECTURE.md).

Le prototype d’origine (`LL-App-LL.html`) est conservé dans [`legacy/`](legacy/) comme référence fonctionnelle ; il n’est pas utilisé par l’application.

## Démarrage rapide

Prérequis : Node.js ≥ 20 (testé avec Node 25) et npm.

```bash
npm install
npm run dev          # http://localhost:5173
```

### Comptes de test

**Mode démo local** — mot de passe de tous les comptes simulés : `Routines2026` (défini dans `src/services/auth/mock/accounts.ts`, donc public ; ne jamais le réutiliser ailleurs).

**Mode Supabase** — mêmes personnes, identifiées par leur email ; mots de passe aléatoires générés par le serveur, transmis hors dépôt, à changer à la première connexion (menu du compte). `Routines2026` y est refusé.

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

| Commande                 | Rôle                                                                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`            | Serveur de développement                                                                                                                                          |
| `npm run dev:supabase`   | Serveur de développement relié au projet Supabase (`.env.supabase.local`)                                                                                         |
| `npm run build:supabase` | Build de production en mode Supabase                                                                                                                              |
| `npm run test:security`  | Tests de sécurité **contre le serveur** : AUTH, RBAC, périmètre, IDOR, validation, audit, débit, CORS ([`docs/SECURITY_TESTS.md`](docs/SECURITY_TESTS.md))        |
| `npm run db:permissions` | Régénère la matrice de permissions de la base et [`docs/PERMISSIONS.md`](docs/PERMISSIONS.md) depuis `permissions.ts`                                             |
| `npm run build`          | Vérification TypeScript (application et tests) puis build de production dans `dist/`                                                                              |
| `npm run preview`        | Sert le build de production                                                                                                                                       |
| `npm test`               | Tests unitaires et d’intégration (Vitest, 71 tests)                                                                                                               |
| `npm run e2e`            | Tests de bout en bout dans Edge (Playwright) : scénarios administration → exécution → Andon → reporting, 49 routes × 4 profils, 4 largeurs, audit axe WCAG 2.1 AA |
| `npm run lint`           | ESLint (dont interdiction de `console.*` hors logger)                                                                                                             |
| `npm run screens`        | Captures d’écran pour l’audit visuel (`npm run screens -- <url> <dossier> <profil> <routes…>`)                                                                    |
| `npm run format`         | Prettier                                                                                                                                                          |

## Configuration

Copier `.env.example` en `.env.local` et ajuster :

| Variable                        | Valeurs                        | Défaut        | Rôle                                                                                                           |
| ------------------------------- | ------------------------------ | ------------- | -------------------------------------------------------------------------------------------------------------- |
| `VITE_DATA_MODE`                | `demo` \| `supabase` \| `api`  | `demo`        | Source des données                                                                                             |
| `VITE_API_BASE_URL`             | URL                            | —             | Backend REST (obligatoire si `api`)                                                                            |
| `VITE_AUTH_MODE`                | `demo` \| `supabase` \| `oidc` | `demo`        | `supabase` va avec `VITE_DATA_MODE=supabase` ; `oidc` bloque l’accès tant que le fournisseur n’est pas branché |
| `VITE_SUPABASE_URL`             | `https://<projet>.supabase.co` | —             | Projet Supabase (mode `supabase`)                                                                              |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | clé publique                   | —             | Clé **publique** ; une clé secrète bloque le démarrage                                                         |
| `VITE_AUTH_EMAIL_DOMAIN`        | domaine                        | —             | Permet de saisir un identifiant court à la connexion                                                           |
| `VITE_BI_EMBED_URL`             | URL https                      | —             | Rapport BI intégré (sinon « non connecté »)                                                                    |
| `VITE_BI_ALLOWED_ORIGIN`        | origine https                  | —             | Contrôle de l’origine du rapport                                                                               |
| `VITE_LOG_LEVEL`                | `debug` … `error`              | `warn` (prod) | Seuil de journalisation                                                                                        |

**Fuseau horaire de l’atelier** : `settings.timezone` en base (actuellement `Africa/Dakar`). « Aujourd’hui », les heures des routines et le jour des événements sont calculés dans ce fuseau, quel que soit celui du poste (décision D-033). Pour un autre atelier, modifier cette seule valeur.

Une configuration invalide affiche un écran d’erreur explicite au démarrage au lieu de lancer une application à moitié fonctionnelle. **Toute variable `VITE_*` est publique** (intégrée au code du navigateur) : aucun secret n’y a sa place.

## Architecture en bref

React 19 + TypeScript strict + Vite, React Router (routes chargées à la demande), TanStack Query, CSS Modules + design tokens, aucune bibliothèque de composants.

```
UI (pages) → hooks métier (features/*/api.ts) → DataSource → Repository → localStorage (simulé) | Supabase (RLS) | HTTP (API)
                  └── règles pures (features/*/model.ts), testées unitairement
```

- Permissions : source unique `src/services/auth/permissions.ts` (rôle → permissions) et `policies.ts` (`can(user, permission, ressource)`), jamais de test de rôle dans les composants.
- Authentification : `AuthService` → `MockAuthProvider` (démo locale) ou `SupabaseAuthProvider` (comptes serveur). Le code du mode non utilisé est éliminé du build.
- Serveur : `supabase/migrations` (schéma, RLS, triggers, audit), `supabase/functions` (`admin-users`, `demo-seed`).
- Indicateurs : toujours **calculés** à partir des enregistrements, jamais stockés ni simulés.
- Détails : [`docs/architecture.md`](docs/architecture.md).

## Environnement simulé

- L’interface ne montre aucun mécanisme de démonstration : connexion par identifiant et mot de passe, aucun bandeau. Le caractère simulé est indiqué à l’administrateur seulement (_Administration → Paramètres_ : « Stockage local du navigateur », « Comptes locaux — non sécurisé ») et dans cette documentation.
- Jeu initial généré relativement à la date du jour, reproductible : 12 personnes fictives, 4 équipes, 12 routines avec leurs tâches et checklists, 13 planifications, 30 jours d’exécutions **générées** (elles alimentent le reporting comme des saisies), réunions, Andon, actions.
- Les standards du centre de connaissances sont des contenus génériques marqués « À valider » (visible dans l’administration).
- Réinitialisation : _Administration → Paramètres → Réinitialiser l’environnement_.

## Backend Supabase

1. Appliquer `supabase/migrations/0001` à `0012` sur un projet Supabase (région UE), dans l’ordre.
2. Déployer les fonctions `supabase/functions/admin-users`, `demo-seed` et `erp-integration` (vérification du JWT activée). La clé de service n’est lue que par ces fonctions, dans les secrets de Supabase.
3. Tableau de bord Supabase : désactiver l’inscription publique (déjà refusée par la base), longueur minimale des mots de passe 12, protection contre les mots de passe divulgués, MFA pour les administrateurs.
4. Build avec `VITE_DATA_MODE=supabase`, `VITE_AUTH_MODE=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` ; mettre à jour `connect-src` dans `vercel.json` si le projet change.
5. Démonstration : premier chargement du jeu par `demo-seed` avec le jeton d’amorçage (hors dépôt), puis _Administration → Paramètres → Réinitialiser l’environnement_. **Production** : projet distinct, `settings.environment = 'production'`, aucun compte de démonstration, comptes créés par l’administrateur (_Utilisateurs → Nouvel utilisateur_).

Aucun composant d’écran n’est à modifier.

## Intégration ERP (préparation SAP)

L’application est prête à recevoir un connecteur SAP, **sans être connectée à aucun SAP** : un **Mock SAP** (simulation, signalée comme telle) permet de tester la synchronisation, l’idempotence, les erreurs et l’outbox depuis _Administration → Intégration ERP_. Tout se passe côté serveur (fonction `erp-integration`, réglage serveur `SAP_INTEGRATION_MODE`, défaut `mock`). Détails, et informations à obtenir pour le vrai SAP : [`docs/ERP_INTEGRATION.md`](docs/ERP_INTEGRATION.md).

## Documentation

| Document                                                         | Contenu                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| [`docs/current-state.md`](docs/current-state.md)                 | Audit avant la séparation administration / exécution               |
| [`docs/role-model.md`](docs/role-model.md)                       | Espaces, profils, rôles, routes d’entrée, comptes de test          |
| [`docs/permission-matrix.md`](docs/permission-matrix.md)         | Matrice des permissions et règles par ressource                    |
| [`docs/functional-gaps.md`](docs/functional-gaps.md)             | Écarts fonctionnels identifiés                                     |
| [`docs/implementation-plan.md`](docs/implementation-plan.md)     | Plan d’implémentation par phase                                    |
| [`docs/legacy-audit.md`](docs/legacy-audit.md)                   | Audit complet du prototype                                         |
| [`docs/functional-spec.md`](docs/functional-spec.md)             | Rôles, permissions, modules, parcours, définitions des indicateurs |
| [`docs/architecture.md`](docs/architecture.md)                   | Stack, structure, couches, erreurs, tests                          |
| [`docs/data-model.md`](docs/data-model.md)                       | Entités et relations                                               |
| [`docs/design-system.md`](docs/design-system.md)                 | Tokens, composants, règles d’usage                                 |
| [`docs/deployment.md`](docs/deployment.md)                       | Hébergement, API, authentification, BI                             |
| [`docs/decisions.md`](docs/decisions.md)                         | Décisions et hypothèses **à valider**                              |
| [`docs/SECURITY_AUDIT.md`](docs/SECURITY_AUDIT.md)               | Audit de sécurité et suivi des corrections                         |
| [`docs/SECURITY_ARCHITECTURE.md`](docs/SECURITY_ARCHITECTURE.md) | Architecture de sécurité, état réel, ce qui reste à faire          |
| [`docs/SECURITY_TESTS.md`](docs/SECURITY_TESTS.md)               | Tests de sécurité : commandes, couverture, derniers résultats      |
| [`docs/PERMISSIONS.md`](docs/PERMISSIONS.md)                     | Matrice rôles × permissions et périmètres (générée)                |
