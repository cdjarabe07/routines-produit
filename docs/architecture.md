# Architecture

## 1. Stack

| Besoin                      | Choix                                               | Pourquoi                                                                                                                                              |
| --------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI                          | **React 19 + TypeScript (strict)**                  | Standard du marché, typage du modèle métier, recrutement facile                                                                                       |
| Build                       | **Vite**                                            | Démarrage instantané, build statique déployable sur n'importe quel serveur web                                                                        |
| Routing                     | **React Router 7** (routeur hash)                   | Routes paresseuses par module ; le routeur hash fonctionne sur un simple hébergement statique d'intranet et dans les QR codes sans réécriture serveur |
| Données serveur             | **TanStack Query 5**                                | Cache, invalidation, états loading/error uniformes ; indépendant de la source de données                                                              |
| Styles                      | **CSS Modules + tokens CSS**                        | Pas de framework CSS : un fichier de styles par composant, des variables de design centralisées                                                       |
| Icônes                      | **lucide-react**                                    | Icônes vectorielles sobres, importées une par une (tree-shaking)                                                                                      |
| Police                      | **IBM Plex Sans** (auto-hébergée via `@fontsource`) | Lisible, industrielle, chiffres tabulaires ; fonctionne sans accès Internet                                                                           |
| QR codes                    | **qrcode**                                          | Génération à la volée depuis la liste des postes                                                                                                      |
| Graphiques                  | **SVG maison** (barres, courbes)                    | Besoins simples ; évite 100+ Ko de bibliothèque                                                                                                       |
| Tests unitaires/intégration | **Vitest + Testing Library**                        | Même configuration que Vite                                                                                                                           |
| Tests de bout en bout       | **Playwright** (canal `msedge`)                     | Parcours critiques et vérification responsive dans un vrai navigateur                                                                                 |

Aucune bibliothèque de composants : le design system est interne (`src/components`) pour garder la maîtrise du rendu industriel et éviter le « look SaaS ».

## 2. Structure

```text
src/
├── main.tsx                 Point d'entrée
├── app/
│   ├── App.tsx              Assemblage des providers
│   ├── router.tsx           Table des routes (lazy + garde de permission)
│   ├── navigation.ts        Menu : groupes, entrées, permission requise, compteur
│   ├── config/env.ts        Lecture et validation des variables d'environnement
│   └── providers/           QueryProvider, DataSourceProvider, AuthProvider
├── components/
│   ├── ui/                  Button, Field, Input, Select, Textarea, Checkbox, Badge, StatusPill,
│   │                        Panel, Tabs, SegmentedControl, Modal, Drawer, ConfirmDialog,
│   │                        Menu, Tooltip, Progress, Kpi, Toast
│   ├── layout/              AppShell, Sidebar, TopBar, PageHeader, Section
│   ├── feedback/            LoadingState, EmptyState, ErrorState, AccessDenied,
│   │                        DemoBanner, OfflineBanner, QueryBoundary
│   └── data-display/        DataTable (tri, recherche, pagination, rendu carte sur mobile),
│                            BarChart, LineChart, KeyValueList, Timeline
├── features/                Un dossier par module métier
│   └── <module>/
│       ├── model.ts         Règles métier pures (calculs, statuts) — testées unitairement
│       ├── api.ts           Hooks TanStack Query + opérations multi-entités
│       ├── components/      Composants propres au module
│       └── pages/           Pages routées (chargées à la demande)
├── services/
│   ├── data/                Contrat DataSource, implémentations DÉMO (localStorage) et API (HTTP)
│   ├── auth/                AuthService, fournisseur simulé (mock/), annuaire, permissions, policies
│   ├── logger.ts            Journalisation par niveaux
│   └── errors.ts            Erreurs typées + message utilisateur
├── data/demo/               Jeu de données de démonstration (généré, daté par rapport à « aujourd'hui »)
├── types/                   Entités du modèle de données
├── hooks/                   Hooks transverses (useNow, useMediaQuery, useOnlineStatus…)
├── utils/                   Dates locales, formatage, validation, identifiants
├── styles/                  tokens.css, base.css
└── test/                    Configuration et utilitaires de test
```

Règles de dépendance :

```text
pages → components (ui/layout/feedback/data-display) → styles
pages → features/*/api → services/data → types
features/*/model → types, utils        (jamais React, jamais de stockage)
services → types, utils                (jamais React)
```

Un module peut utiliser le `model.ts` ou les hooks `api.ts` d'un autre module (par exemple l'accueil agrège tout), jamais ses composants internes.

## 3. Couche de données

```text
 Composant ─▶ hook (features/x/api.ts) ─▶ DataSource ─▶ Repository<T> ─┬─▶ LocalStorageDriver (DÉMO)
                     │                                                    └─▶ HttpDriver (API)
                     └─ TanStack Query (cache, invalidation)
```

- `Repository<T>` : `list(filter?)`, `get(id)`, `create(input)`, `update(id, patch)`, `remove(id)`.
- `DataSource` : un repository par collection (`actions`, `anomalies`, `andonAlerts`…), plus `kind` (`demo` | `api`) et `resetDemoData()` (DÉMO uniquement).
- **DÉMO** : un driver `localStorage` (une clé par collection, préfixe versionné `ra:v2:`). Au premier lancement, le jeu de données de `src/data/demo` est chargé. Les photos sont réduites (max 1280 px, JPEG) avant stockage.
- **API** : driver HTTP REST générique (`GET/POST/PATCH/DELETE {VITE_API_BASE_URL}/{collection}`), jeton porté par l'`AuthService`. Contrat décrit dans `docs/deployment.md`.
- Les opérations qui touchent plusieurs entités (valider une Gemba Walk crée des actions et des notifications) sont écrites dans `features/*/api.ts` au-dessus du `DataSource`. Avec un vrai backend, elles pourront être déplacées dans des endpoints transactionnels sans toucher l'UI (même signature de hook).
- Les **valeurs calculées ne sont jamais stockées** (retard, conformité, état d'un poste) : elles sont dérivées dans `model.ts`.

## 4. Authentification et permissions

```text
AuthService (interface)        signIn({identifier, password}) / signOut / getSession / requestPasswordReset / getAccessToken
  ├── MockAuthProvider         services/auth/mock : identifiant ou email + mot de passe vérifiés contre l'annuaire local,
  │                            comptes dans mock/accounts.ts. NON sécurisé (code livré au navigateur).
  └── (à brancher) OidcAuthService   Microsoft Entra ID / MSAL — voir docs/deployment.md
UserDirectory                  services/auth/userDirectory.ts : annuaire adossé au DataSource (dernière activité, demandes d'accès)
AuthProvider (React)           expose { user, session, can(permission, ressource?), signIn, signOut, requestPasswordReset }
permissions.ts                 matrice rôle → permissions, profils, écran d'accueil (homePath)
policies.ts                    can(user, permission, ressource) : règles par ressource (action confiée, réunion dont on est responsable…)
<Can permission="…">           affichage conditionnel
RequirePermission              garde d'espace (space.*) et de page → écran « Accès non autorisé »
navigation.ts                  trois espaces, menus filtrés par permission, sélecteur d'espace
```

Aucune condition de rôle n'apparaît dans les composants : ils ne connaissent que des permissions.

Si `VITE_AUTH_MODE` vaut autre chose que `demo` sans implémentation branchée, l'application affiche un écran « Authentification non configurée » au lieu de laisser entrer.

## 5. Routing

- Routeur hash. Espaces : `/app` (Mon travail), `/manager` (Supervision), `/admin` (Administration) ; détails communs hors préfixe (`/andon/:id`, `/actions/:id`, `/reunions/:id`, `/signaler?poste=P4`…). Table complète : `docs/implementation-plan.md` §3.
- `/` redirige vers l'espace d'accueil du profil ; les anciennes adresses (`/routines`, `/agenda`…) sont redirigées.
- Chaque page est chargée à la demande (`lazy`), ce qui découpe le bundle par module.
- Chaque route déclare sa permission ; la garde affiche `AccessDenied`.
- Erreurs de rendu : `errorElement` au niveau de la coque avec un message compréhensible.

## 6. États UX

`QueryBoundary` normalise loading / erreur / vide pour toute requête. Chaque liste fournit un texte vide explicite (« Aucune routine prévue aujourd'hui »). Les boutons de soumission passent en état « en cours » et sont désactivés pendant la mutation. `OfflineBanner` s'affiche quand le navigateur est hors ligne (en DÉMO les données restent utilisables ; en API les mutations sont bloquées avec un message).

## 7. Erreurs et journalisation

- `AppError` et sous-types : `ValidationError`, `PermissionError`, `NotFoundError`, `NetworkError`, `ApiError(status)`.
- `toUserMessage(error)` produit le texte affiché (toast ou `ErrorState`). Le détail technique part dans le logger.
- `logger` : niveaux `debug < info < warn < error`, seuil fixé par `VITE_LOG_LEVEL` (défaut `warn` en production, `debug` en développement). Aucun `console.log` direct dans le code (règle ESLint `no-console`).

## 8. Variables d'environnement

| Variable                 | Valeurs                                | Défaut                   |
| ------------------------ | -------------------------------------- | ------------------------ |
| `VITE_DATA_MODE`         | `demo` \| `api`                        | `demo`                   |
| `VITE_API_BASE_URL`      | URL                                    | — (obligatoire si `api`) |
| `VITE_AUTH_MODE`         | `demo` \| `oidc`                       | `demo`                   |
| `VITE_BI_EMBED_URL`      | URL https                              | — (BI non connecté)      |
| `VITE_BI_ALLOWED_ORIGIN` | origine https                          | —                        |
| `VITE_LOG_LEVEL`         | `debug` \| `info` \| `warn` \| `error` | `warn`                   |

## 9. Performance

- Découpage par route ; l'accueil ne charge ni le reporting ni l'administration.
- Données agrégées via `useMemo` dans les pages ; calculs purs dans `model.ts`.
- Rafraîchissement des durées (Andon, séquences) via un seul hook `useNow()` par écran, pas de rendu global.

## 10. Tests

- `model.ts` de chaque module : tests unitaires (règles métier).
- Parcours critiques : tests d'intégration Testing Library sur une source de données en mémoire.
- Playwright : navigation de toutes les routes sans erreur, parcours Andon et anomalie, absence de débordement horizontal à 390 px, 768 px, 1280 px, 1920 px.

## 11. Ordre d'implémentation

1. Socle : projet, tokens, utilitaires, types, couche de données, auth, logger (phase 1).
2. Coque : connexion DÉMO, AppShell, navigation, toutes les routes (phase 2).
3. Design system (phase 3).
4. Modules : Accueil → Routines → Actions (+ commentaires) → Anomalies → Andon → Séquences → Production → Plan atelier → Gemba → LQC → Connaissances → Agenda/Réunions → Passation/Équipe → Reporting/Période → BI → Administration (phase 4).
5. Consolidation données (phase 5), tests (6), audit visuel (7), build final (8), documentation.
