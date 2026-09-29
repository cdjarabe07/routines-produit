# Audit de sécurité — Routines atelier

> Date : 29/09/2026. Périmètre : dépôt `cdjarabe07/routines-app` (commit `8a90abb`), build de production, déploiement Vercel `routines-app-mu.vercel.app`.
> Méthode : lecture du code, recherche systématique de motifs sensibles, analyse de l'historique Git, `npm audit`, inspection des en-têtes HTTP de production, essais dans un navigateur.

## Verdict

**Le niveau de sécurité réel est nul.** L'application est un démonstrateur **100 % navigateur**, sans backend :

- toutes les données vivent dans le `localStorage` de chaque poste ;
- toutes les décisions d'accès sont prises par du JavaScript que l'utilisateur contrôle.

Les contrôles d'accès existants (permissions, gardes de route, règles par ressource) sont bien conçus et centralisés, mais ils relèvent de l'**ergonomie**, pas de la sécurité.

Aucune correction côté navigateur ne peut changer ce verdict. Une sécurité réelle **exige un backend** : authentification, API qui applique les droits, base de données, journal d'audit.

## Architecture actuelle

| Élément          | Constat                                                                                                                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack            | SPA React 19 + TypeScript 6 + Vite 8, react-router 8 (routeur hash), TanStack Query. 7 dépendances d'exécution, aucune de sécurité                                                                         |
| Hébergement      | Vercel, fichiers statiques uniquement. Aucune fonction serveur, aucune base                                                                                                                                |
| Données          | `DataSource` → `createStoreDataSource(localStorage)` (clés `ra:v2:*`). Une implémentation REST existe (`httpDataSource.ts`, jeton Bearer, 403 → `PermissionError`), mais **aucun backend** ne l'implémente |
| Authentification | `AuthService` → `MockAuthProvider` : identifiant ou email + mot de passe comparés dans le navigateur ; session `{ userId, startedAt }` en `sessionStorage` (`ra:session`), sans signature                  |
| Autorisation     | `permissions.ts` (rôle → permissions), `policies.ts` (`can(user, permission, ressource)`), `RequirePermission` sur chaque espace et chaque page. Exécuté uniquement dans le navigateur                     |
| Organisation     | Utilisateur → équipe, ligne (« zone »), poste. **Pas d'entités « Site » ni « Atelier »** ; pas de périmètre appliqué aux lectures                                                                          |
| Intégrations     | BI : iframe si `VITE_BI_EMBED_URL` (non configuré). Emails : aucun. Machine : aucune                                                                                                                       |
| Chatbot / IA     | **Inexistant** (docs/current-state.md §8)                                                                                                                                                                  |
| Uploads          | Photos d'anomalies et d'observations Gemba : image recompressée en JPEG dans le navigateur, stockée en data URL dans le `localStorage`                                                                     |

## A. Authentification

| Constat                                                                                                                                                                                                                                                                                                                              | Gravité                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| **Contournement total** : `getSession()` fait confiance à n'importe quel JSON placé dans `sessionStorage.ra:session`. `sessionStorage.setItem('ra:session', '{"userId":"u-admin","startedAt":"<maintenant>","mode":"demo"}')` donne l'accès administrateur sans mot de passe. Les tests e2e du dépôt utilisent exactement ce procédé | **P0**                                         |
| Mot de passe `Routines2026`, identique pour tous les comptes, écrit dans `src/services/auth/mock/accounts.ts` et **présent en clair dans le bundle publié** (`dist/assets/index-*.js`)                                                                                                                                               | **P0** en production, attendu en démonstration |
| Comptes à identifiants évidents (`admin`, `manager`, `operateur`) sur une URL publique                                                                                                                                                                                                                                               | **P0** en production                           |
| Aucune limitation des tentatives de connexion (la vérification se fait dans le navigateur de toute façon)                                                                                                                                                                                                                            | P1                                             |
| Pas de changement de mot de passe, de MFA, de révocation de session                                                                                                                                                                                                                                                                  | P1, à fournir par un fournisseur d'identité    |
| « Mot de passe oublié » : crée une notification pour les administrateurs, ne révèle pas si le compte existe                                                                                                                                                                                                                          | Correct pour une démonstration                 |
| `VITE_AUTH_MODE=oidc` sans fournisseur branché bloque l'accès (au lieu de le laisser ouvert)                                                                                                                                                                                                                                         | Correct                                        |

## B. Autorisation

| Constat                                                                                                                                                                                                                    | Gravité                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Toutes les vérifications (`can`, `RequirePermission`, `isAssignedTo`) s'exécutent dans le navigateur ; les modifier dans les outils de développement suffit à les contourner                                               | **P0**                                 |
| Les opérations (`features/*/api.ts`) écrivent directement dans le `DataSource` sans contrôle : un opérateur peut appeler toute écriture depuis la console                                                                  | **P0**                                 |
| Le rôle est lu depuis l'enregistrement utilisateur du `localStorage`, modifiable par l'utilisateur lui-même                                                                                                                | **P0**                                 |
| **Périmètre (scope) non appliqué aux lectures** : chaque écran charge des collections entières (`useCollection('users')`, `'actions'`, `'routineRuns'`…). Un opérateur a, dans son navigateur, les données de tout le site | **P0** (en mode API, fuite de données) |
| Des règles de ressource existent pour les écritures (routine affectée, action confiée, réunion dont on est responsable) mais seulement côté client                                                                         | P1                                     |
| La matrice de droits est cohérente et documentée (docs/permission-matrix.md) : bonne base pour le serveur                                                                                                                  | Acquis                                 |

## C. Sessions

| Constat                                                                                                                          | Gravité |
| -------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Session non signée, non vérifiable, forgeable (voir A)                                                                           | **P0**  |
| Expiration : 12 h calculées dans le navigateur (contournable)                                                                    | P1      |
| Déconnexion : supprime la clé `sessionStorage` et vide le cache de requêtes ; aucune invalidation côté serveur (il n'y en a pas) | P1      |
| Pas de renouvellement, pas de liste de sessions, pas de révocation par l'administrateur                                          | P1      |
| Aucun jeton stocké (`getAccessToken()` renvoie `null`) : pas de fuite de jeton possible aujourd'hui                              | Acquis  |

## D. Données

| Constat                                                                                                                                                                     | Gravité                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Toutes les données métier sont en clair dans le `localStorage` : lisibles et modifiables par l'utilisateur ou par tout script de la page (dont une extension de navigateur) | **P0** pour des données réelles                         |
| Chaque poste a sa propre base : aucune donnée partagée entre utilisateurs, aucune intégrité                                                                                 | P0 pour un usage réel (fonctionnel autant que sécurité) |
| « Réinitialiser l'environnement » efface toutes les données (réservé à `settings.manage`, mais contrôle client)                                                             | P1 si des données réelles existaient                    |
| Suppressions physiques : réunions (`remove`), favoris ; le reste est archivé ou annulé (routines, planifications, actions, documents)                                       | P2, à formaliser (soft delete + audit)                  |
| Données de démonstration et d'usage mélangées dans la même base locale                                                                                                      | P1                                                      |

## E. API / backend

| Constat                                                                                                                                                                                                                                               | Gravité                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **Aucun backend.** Aucune validation serveur, aucune autorisation serveur, aucune protection IDOR/BOLA possible aujourd'hui                                                                                                                           | **P0** pour la production         |
| `httpDataSource` est générique (CRUD par collection) : si un backend l'implémentait tel quel, il exposerait `GET /users`, `PATCH /users/:id`, etc. Le contrat doit être remplacé par des opérations métier contrôlées (voir SECURITY_ARCHITECTURE.md) | **P0** de conception              |
| Filtres `?champ=valeur` transmis tels quels au backend                                                                                                                                                                                                | P1 (validation serveur à prévoir) |
| Messages d'erreur : `toUserMessage()` ne montre jamais le détail technique ; le détail part dans le logger                                                                                                                                            | Acquis                            |

## F. Secrets

| Constat                                                                                                                                                                     | Gravité          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Historique Git : **aucune clé, aucun jeton, aucune clé privée** trouvés. `.env.local` (qui contient un `VERCEL_OIDC_TOKEN` local) et `.vercel/` **n'ont jamais été suivis** | Acquis           |
| `.gitignore` couvre `.env*` sauf `.env.example` ; `.env.example` ne contient aucune valeur sensible                                                                         | Acquis           |
| Le mot de passe de démonstration est un « secret » publié par construction (voir A)                                                                                         | P0 en production |
| Variables `VITE_*` : toutes publiques par nature (intégrées au bundle). Aucune ne doit jamais contenir de secret — à rappeler dans `.env.example`                           | P2               |

## G. Frontend (XSS, redirections, en-têtes)

| Constat                                                                                                                                                                   | Gravité                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Aucun `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, `postMessage`, `document.cookie`                                                                    | Acquis                                         |
| Tout le texte utilisateur (commentaires, descriptions, notes) est rendu par React (échappé) ; pas de rich text                                                            | Acquis                                         |
| Liens externes du centre de connaissances : `https://` exigé à la saisie, filtrés par `safeExternalUrl` à l'affichage (bloque `javascript:`), `rel="noopener noreferrer"` | Acquis                                         |
| Paramètre `retour` après connexion : chemin interne uniquement (`/…`, pas `//`), puis navigation interne (routeur hash) : pas de redirection ouverte                      | Acquis                                         |
| **Pas de Content-Security-Policy**                                                                                                                                        | P2 (P1 dès qu'il y a un backend et des jetons) |
| En-têtes présents : HSTS (Vercel), `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy` (caméra coupée pour les pages)              | Acquis                                         |
| URL de production indexable (pas de `X-Robots-Tag`, pas de `robots.txt`)                                                                                                  | P2                                             |
| Export CSV du reporting : uniquement des dates et des nombres (pas d'injection de formule)                                                                                | Acquis                                         |

## H. Uploads

| Constat                                                                                                                                    | Gravité                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Photos : contrôle `image/*` et 15 Mo, puis **ré-encodage en JPEG par un canvas** (neutralise tout contenu non image), stockage en data URL | Acquis pour une démonstration                                           |
| Aucun stockage serveur : pas de contrôle d'accès aux fichiers, pas d'antivirus, pas de quotas                                              | P1 dès le backend                                                       |
| Le champ `photo` accepté tel quel s'il venait d'une API (URL arbitraire)                                                                   | P2 (validation serveur : data URL image ou stockage interne uniquement) |

## I. Intégrations

| Constat                                                                                                                                                                                      | Gravité                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| BI : URL publique d'intégration en variable `VITE_*`, `https` exigé, origine vérifiée, iframe `sandbox` + `referrerPolicy=no-referrer`. **Aucun jeton côté client.** Non configuré à ce jour | Acquis ; « Publier sur le web » Power BI serait public : à interdire |
| Pour un filtrage par périmètre (RLS Power BI), il faudra un jeton d'intégration généré **par le backend**                                                                                    | P1 le jour de l'intégration                                          |
| Aucun webhook, aucun email, aucun service externe appelé                                                                                                                                     | Acquis                                                               |

## J. Chatbot / IA

Aucun chatbot n'existe. **Aucune donnée n'est envoyée à un service d'IA.** Toute future fonctionnalité devra passer par le backend : authentification → autorisation → filtrage des données accessibles → contexte autorisé → modèle.

## K. Journalisation

| Constat                                                                                      | Gravité                   |
| -------------------------------------------------------------------------------------------- | ------------------------- |
| `logger.ts` : console uniquement, niveau `warn` en production ; aucun secret n'y est écrit   | Acquis                    |
| **Aucun journal d'audit** (connexions, changements de rôle, suppressions, refus d'accès)     | P1                        |
| Un journal d'audit dans le navigateur serait falsifiable : il doit être écrit par le serveur | Contrainte d'architecture |

## L. Dépendances

- `npm audit` : **0 vulnérabilité** (dépendances d'exécution et de développement).
- 7 dépendances d'exécution, toutes connues (React, react-router, TanStack Query, lucide-react, qrcode, polices IBM Plex).
- Aucune dépendance suspecte ou inutile identifiée.

## M. Déploiement (Vercel)

| Constat                                                                                             | Gravité                                                                                                      |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Production **publique** sans authentification réelle                                                | **P0** si des données réelles y étaient saisies ; acceptable pour une démonstration **sans données réelles** |
| Déploiements de prévisualisation protégés par l'authentification Vercel (redirection SSO constatée) | Acquis                                                                                                       |
| Aucune variable d'environnement sensible sur Vercel (aucune n'est nécessaire)                       | Acquis                                                                                                       |
| Dépôt GitHub privé                                                                                  | Acquis                                                                                                       |
| Pas de source maps publiées                                                                         | Acquis                                                                                                       |

## N. Risques critiques (P0)

1. Contournement de l'authentification par falsification de la session (`sessionStorage`).
2. Autorisation exclusivement côté client : toute permission et toute règle de périmètre se contournent.
3. Mot de passe commun publié dans le bundle et comptes aux identifiants évidents sur une URL publique.
4. Absence de backend : pas de validation, pas de contrôle IDOR, pas d'intégrité, données modifiables localement.
5. Le contrat d'API prévu (CRUD générique par collection) serait dangereux s'il était implémenté tel quel.
6. Lecture non cloisonnée : chaque écran charge l'intégralité des collections.

## O. Risques moyens (P1)

- Pas de limitation des tentatives de connexion ni des créations (Andon, anomalies, commentaires).
- Pas de journal d'audit ; pas de révocation de session.
- Modèle d'organisation incomplet pour le périmètre (pas de Site ni d'Atelier ; l'équipe et la ligne existent).
- Réinitialisation de l'environnement disponible dès qu'on a `settings.manage`.
- Suppression physique des réunions.

## P. Améliorations recommandées (P2, P3)

- **P2** : CSP stricte, `X-Robots-Tag: noindex` sur la démonstration, `frame-ancestors 'none'`, rappel « aucune variable `VITE_*` ne doit contenir de secret », soft delete formalisé, validation d'entrée partagée client/serveur.
- **P3** : SSO Entra ID / OIDC, MFA obligatoire pour les administrateurs, réauthentification pour les opérations critiques, SIEM, test d'intrusion externe.

## Ce qui était déjà correct

Architecture en couches (UI → hooks → DataSource), permissions centralisées et testées, règles de ressource isolées dans `policies.ts`, absence de HTML brut, filtrage des URL, redirection interne sûre, erreurs utilisateur sans détail technique, photos ré-encodées, iframe BI sandboxée, aucun secret dans Git, 0 vulnérabilité de dépendance, prévisualisations protégées.

## Suivi des corrections (29/09/2026)

Architecture retenue : Supabase, région UE (`docs/SECURITY_ARCHITECTURE.md`, décision D-031). L'état ci-dessous vaut pour le mode **Supabase** (`VITE_DATA_MODE=supabase`). Le mode démonstration local reste, par construction, sans sécurité.

| Constat                                                                                    | Statut                                                                       | Correction                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-1 Session falsifiable                                                                   | **Corrigé**                                                                  | Session Supabase Auth (JWT signé, vérifié par le serveur). Une valeur `ra:session` forgée n'ouvre rien (test e2e `security.spec.ts`)                                                                                                                  |
| P0-2 Autorisation côté client                                                              | **Corrigé**                                                                  | RLS sur les 30 tables + triggers ; l'interface ne sert plus qu'à l'ergonomie (44 tests serveur)                                                                                                                                                       |
| P0-3 Mot de passe dans le bundle                                                           | **Corrigé** en mode Supabase                                                 | Comptes serveur aux mots de passe aléatoires hors dépôt ; le code des comptes simulés est éliminé du bundle (vérifié par recherche dans `dist/`). Le mot de passe simulé reste dans le code source du mode démo local : **à considérer comme public** |
| P0-4 Pas de backend                                                                        | **Corrigé**                                                                  | Postgres + contraintes, triggers d'intégrité, fonctions serveur                                                                                                                                                                                       |
| P0-5 Contrat CRUD générique                                                                | **Corrigé**                                                                  | L'API générée n'agit qu'à travers la RLS ; opérations sensibles par fonctions dédiées (`admin-users`, `demo-seed`, `record_run_result`)                                                                                                               |
| P0-6 Lecture non cloisonnée                                                                | **Corrigé**                                                                  | Les requêtes « liste » ne renvoient que les lignes autorisées (périmètre site / ligne / équipe / soi)                                                                                                                                                 |
| Inscription publique ouverte (découvert pendant les tests)                                 | **Corrigé**                                                                  | Refus par la base (migration 0010) ; à désactiver aussi dans le tableau de bord                                                                                                                                                                       |
| P1 Limitation de débit                                                                     | Corrigé (créations, aide à la connexion) ; connexion : limites Supabase Auth |                                                                                                                                                                                                                                                       |
| P1 Journal d'audit, révocation                                                             | Corrigé                                                                      | `auditLog` non modifiable, écran de consultation ; désactivation ⇒ bannissement et suppression des sessions                                                                                                                                           |
| P1 Modèle d'organisation                                                                   | Corrigé                                                                      | Atelier (`workshops`), ligne, équipe, périmètre par rôle                                                                                                                                                                                              |
| P1 Réinitialisation d'environnement                                                        | Corrigé                                                                      | Administrateur uniquement, refusée si `environment = production` (valeur figée côté serveur) ; journal conservé                                                                                                                                       |
| P1 Suppression des réunions                                                                | Partiel                                                                      | Seulement `meeting.manage`, statut planifié ou annulé, journalisée (MEETING_DELETED) ; pas de corbeille                                                                                                                                               |
| Saisie de routine : perte de mise à jour, auteur falsifiable (découvert pendant les tests) | **Corrigé**                                                                  | Fusion atomique `record_run_result`, auteur et heure imposés par le serveur                                                                                                                                                                           |
| P2 En-têtes                                                                                | Corrigé                                                                      | CSP stricte, HSTS, COOP, `X-Robots-Tag` (`vercel.json`), vérifiés sans violation                                                                                                                                                                      |
| P3 SSO, MFA, SIEM, test d'intrusion                                                        | À faire                                                                      | Décisions et infrastructure de l'entreprise                                                                                                                                                                                                           |
