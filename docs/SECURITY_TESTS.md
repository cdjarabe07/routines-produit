# Tests de sécurité

> Principe : chaque test se comporte comme un **client hostile**. Il appelle directement l'API avec la clé publique et le vrai jeton d'un compte, sans passer par l'interface. Un contrôle qui n'existe que dans React échoue donc ces tests.

## 1. Suites et commandes

| Suite                    | Commande                                   | Cible                                    | Contenu                                                                                                 |
| ------------------------ | ------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Serveur (API)            | `npm run test:security`                    | Projet Supabase de **démonstration**     | 44 tests : AUTH, RBAC, SCOPE, IDOR, DATA, API                                                           |
| Navigateur, serveur réel | `E2E_BACKEND=supabase npx playwright test` | Build Supabase + projet de démonstration | Parcours métier complets avec les vrais comptes, toutes les routes pour 4 rôles, `e2e/security.spec.ts` |
| Navigateur, mode démo    | `npx playwright test`                      | Build démo (stockage local)              | Non-régression fonctionnelle, accessibilité, mise en page                                               |
| Unitaires                | `npm test`                                 | jsdom                                    | Permissions, politiques, modèles métier                                                                 |

### Pré-requis (hors Git)

- `.env.supabase.local` : `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (clé **publique**), `VITE_AUTH_EMAIL_DOMAIN`.
- `SECURITY_ACCOUNTS_FILE` (tests serveur) et `E2E_ACCOUNTS_FILE` (e2e) : chemin d'un fichier JSON `{ "email": "mot de passe" }` des comptes de démonstration. Ce fichier n'est **jamais** versionné.

Sans ces éléments, `npm run test:security` n'exécute rien : la suite apparaît comme **ignorée** (« skipped »), jamais comme réussie.

- `PW_TIMEZONE` (facultatif) : fuseau simulé du navigateur de test. La date opérationnelle étant celle de l'atelier (D-033), les tests doivent réussir quel que soit ce fuseau ; ils ont été exécutés en `Asia/Shanghai` et en `America/New_York` pour un atelier en `Africa/Dakar`.

### Garde-fous

- Le premier test vérifie que `settings.environment = 'demo'`. Les tests n'utilisent **aucune donnée de production**.
- La suite serveur se termine par une réinitialisation du jeu de démonstration (alertes et anomalies de test effacées). La suite e2e Supabase le recharge avant de commencer (`e2e/global-setup.ts`).
- La réinitialisation est refusée par le serveur sur un environnement de production.

## 2. Couverture (tests serveur)

### AUTH — authentification

| Test                                                       | Attendu                                                                                                           |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Mot de passe incorrect (dont l'ancien mot de passe simulé) | Refus                                                                                                             |
| Inscription publique                                       | Refus **par la base** (erreur 500 « Database error saving new user »), et non par la simple limite d'emails (429) |
| Jeton JWT forgé (signature invalide)                       | 401                                                                                                               |
| Compte désactivé                                           | Connexion refusée ; la session déjà ouverte ne lit plus rien                                                      |
| Visiteur non connecté (6 tables)                           | Aucune ligne                                                                                                      |

### RBAC — rôles et permissions

| Test                                                                                                         | Attendu                               |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| Opérateur qui s'attribue le rôle admin                                                                       | Aucune ligne modifiée, rôle inchangé  |
| Administrateur qui change son propre rôle                                                                    | 42501                                 |
| Opérateur : paramètres, standards                                                                            | Refus                                 |
| Opérateur : création de compte, reset de mot de passe (`admin-users`)                                        | 403 et `PERMISSION_DENIED` journalisé |
| Manager ou opérateur : réinitialisation d'environnement                                                      | 400 / 403                             |
| Jeton d'amorçage inventé                                                                                     | 403                                   |
| Passage `demo` ↔ `production` par l'API, même admin                                                          | 42501                                 |
| Fonctions internes (`seed_demo`, `revoke_user_sessions`, `auth_user_has_perm`, `authorize_account_creation`) | Non appelables                        |

### SCOPE — périmètre

| Test                | Attendu                                                                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Opérateur ligne A   | Ne voit ni les exécutions de la ligne B, ni les notifications d'autrui, ni les actions qui ne le concernent pas, ni la production, ni l'audit |
| Line Leader ligne A | Ne voit que les planifications de sa ligne (ligne, équipes de la ligne, personnes de la ligne) ; le test vérifie qu'il en existe d'autres     |

### IDOR — accès direct par identifiant

| Méthode | Test                                                                               | Attendu                                           |
| ------- | ---------------------------------------------------------------------------------- | ------------------------------------------------- |
| GET     | Exécution d'un autre opérateur par son id                                          | Introuvable                                       |
| PATCH   | Exécution d'un autre ; action d'un autre                                           | 0 ligne modifiée                                  |
| DELETE  | Action, exécution, utilisateur                                                     | Rien supprimé (compté par l'admin avant et après) |
| POST    | Andon au nom d'un autre ; action « créée par » l'admin ; notification pour l'admin | Refus                                             |

### DATA — validation et intégrité

| Test                                             | Attendu                                                                                                                                                        |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lien `javascript:` dans la base de connaissances | 23514 (seul `https://` est accepté)                                                                                                                            |
| Photo SVG (vecteur XSS)                          | 23514 (seul le JPEG en data URL est accepté)                                                                                                                   |
| Texte de 2 001 caractères                        | 23514                                                                                                                                                          |
| `createdAt` falsifié                             | Remplacé par l'heure serveur ; HTML stocké tel quel, jamais interprété (React échappe)                                                                         |
| Saisie de routine                                | Écriture directe de `results` refusée ; `record_run_result` impose auteur et heure, et conserve les saisies existantes ; impossible sur l'exécution d'un autre |
| Email ou dernière connexion d'un compte          | 42501                                                                                                                                                          |

### API — audit, débit, CORS

| Test                           | Attendu                                                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Journal d'audit                | Lisible par l'admin ; modification, suppression et insertion par un client : sans effet                    |
| Journalisation                 | `USER_LOGIN` et `PERMISSION_DENIED` présents                                                               |
| Rafale d'Andon                 | Refus (54000) au plus tard après 10 créations en 10 min                                                    |
| « Mot de passe oublié » répété | Au plus 3 notifications par identifiant et par heure                                                       |
| CORS                           | Aucun en-tête `Access-Control-Allow-Origin` pour une origine étrangère ; origine de l'application acceptée |

### ERP — intégration (Mock SAP), `tests/security/erp.security.test.ts`

| Test                                             | Attendu                                                                                                         |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Opérateur, manager, visiteur non connecté        | Aucune ligne des 5 tables d'intégration                                                                         |
| Administrateur                                   | Lecture ; écriture directe refusée (tables, réglage, outbox)                                                    |
| Opérateur, manager → fonction `erp-integration`  | 403 pour toutes les actions                                                                                     |
| `integration_claim_outbox` appelée par un client | Refusée                                                                                                         |
| Mode annoncé par le serveur                      | `mock`, scénarios listés                                                                                        |
| Synchronisations répétées                        | 0 création, 0 mise à jour, nombre d'enregistrements inchangé, tout marqué `simulated`                           |
| Jeu modifié puis retour                          | Mises à jour, nouveaux ordres présents une seule fois                                                           |
| SAP indisponible                                 | Échec journalisé, aucune donnée modifiée                                                                        |
| Erreur partielle                                 | 3 rejets journalisés, statut `partial`                                                                          |
| Journalisation                                   | Historique complet et `ERP_SYNC` dans le journal d'audit                                                        |
| Outbox                                           | Refus si envoi désactivé ; échec → nouvel essai programmé → relance → envoi ; un envoi réussi ne se relance pas |

Tests unitaires associés (moteur, Mock, outbox, séparation navigateur/serveur) : `tests/erp/erp.test.ts`, 24 tests, lancés par `npm test`.

## 3. Tests navigateur contre le serveur (`e2e/security.spec.ts`)

- Une session `ra:session` forgée dans `sessionStorage` (l'attaque P0-1 de l'audit) renvoie à la connexion.
- L'ancien mot de passe simulé est refusé.
- Aucun jeton dans `localStorage` (session en `sessionStorage` uniquement).
- Un opérateur qui force l'URL d'administration voit « Accès non autorisé », sans données d'administration.
- Changement de compte sans rafraîchissement.

## 4. Dernière exécution (30/09/2026, après la migration 0012)

| Suite                                               | Résultat                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------- |
| `npm run test:security`                             | 44 réussis                                                                      |
| `E2E_BACKEND=supabase npx playwright test`          | 13 réussis, 5 ignorés (accessibilité et mise en page : identiques au mode démo) |
| `npx playwright test` (démo)                        | 13 réussis, 5 ignorés (tests propres au serveur)                                |
| `npm test`                                          | 71 réussis                                                                      |
| CSP de `vercel.json` injectée sur le build Supabase | 0 violation sur les écrans parcourus                                            |
| Recherche dans `dist/` (build Supabase)             | Ni `Routines2026`, ni clé secrète, ni JWT                                       |

## 5. Hors du champ de ces tests

- **Poste dans un autre fuseau que l'atelier** : corrigé le 30/09/2026 (D-033). Tests : `src/utils/date.test.ts` (fuseau du poste simulé, passage de minuit, changement de fuseau en cours d'exécution, heure d'été) et e2e Supabase avec un navigateur en `Asia/Shanghai` et en `America/New_York`.

- Expiration réelle des jetons (1 h) et détection de réutilisation d'un jeton de rafraîchissement : comportement de Supabase Auth, non rejoué ici.
- Résistance à la charge et au déni de service (limites de la plateforme).
- MFA, SSO : non configurés.
- Test d'intrusion par un tiers : recommandé avant toute donnée réelle.
