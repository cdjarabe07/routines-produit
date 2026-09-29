# Architecture de sécurité

> Décision : backend **Supabase** (Postgres managé, Supabase Auth, fonctions Edge), région UE. Voir `docs/decisions.md` D-031.
> Ce document décrit l'architecture cible **et** ce qui est effectivement en place (§11).

## 1. Principe

Le navigateur n'est pas fiable. **Toute** décision d'accès est prise par la base de données ou par une fonction serveur. Le frontend garde ses contrôles (`can()`, gardes de route) pour l'ergonomie uniquement.

```text
Utilisateur
   ↓  email + mot de passe (Supabase Auth, bcrypt, limites de tentatives)
Session  — JWT court (1 h) + jeton de rafraîchissement à rotation
   ↓
PostgREST (API générée)            Fonction Edge admin-users (clé de service, jamais dans le navigateur)
   ↓                                   ↓
RLS : rôle (permissions) + périmètre (équipe, ligne, site) + règles de ressource
   ↓
Triggers : validation, transitions autorisées, colonnes non modifiables, limites de débit
   ↓
Tables Postgres (contraintes CHECK : types, énumérations, longueurs, formats)
   ↓
Journal d'audit (écrit par triggers SECURITY DEFINER, non modifiable par les clients)
```

Pour une future IA : authentification → autorisation → requêtes exécutées **avec le jeton de l'utilisateur** (donc filtrées par RLS) → contexte autorisé uniquement → modèle. Aucun accès « service » global.

## 2. Identité et comptes

| Élément                    | Choix                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fournisseur                | Supabase Auth (`auth.users`) : mots de passe hachés (bcrypt), jamais stockés ni transmis en clair par l'application                                                                                                                                                                                                                                                                                                |
| Lien au profil métier      | `public.users."authId"` = `auth.users.id` (unique). Le **rôle**, l'équipe, la ligne et le statut vivent dans `public.users`, modifiables seulement par un administrateur (RLS + trigger)                                                                                                                                                                                                                           |
| Compte désactivé           | `users.active = false` : `app.current_user_id()` renvoie `NULL`, donc **toutes** les politiques échouent immédiatement, même avec un jeton encore valide. Le trigger `app.user_rules` bannit aussi le compte dans Supabase Auth et supprime ses sessions (plus de renouvellement)                                                                                                                                  |
| Création de compte         | Uniquement via la fonction Edge `admin-users` (vérifie que l'appelant a `user.manage`, crée le compte Auth et le profil, renvoie un mot de passe provisoire une seule fois). Inscription publique **désactivée**                                                                                                                                                                                                   |
| Mot de passe oublié        | Aucun email n'est configuré : la RPC `request_access_help` prévient les administrateurs (réponse identique que le compte existe ou non ; 3 demandes / h par identifiant, 30 / h au total). L'administrateur génère un mot de passe provisoire (`admin-users`, action `reset-password`), ce qui ferme toutes les sessions du compte. Un lien de réinitialisation par email (PKCE) suppose un SMTP d'entreprise (P2) |
| Changement de mot de passe | Menu du compte → mot de passe actuel revérifié, puis `auth.updateUser` (12 caractères minimum côté interface ; **le minimum côté serveur reste à régler dans Supabase Auth**, voir §11)                                                                                                                                                                                                                            |
| MFA                        | Supabase Auth TOTP disponible ; à rendre obligatoire pour les administrateurs (P3, décision produit)                                                                                                                                                                                                                                                                                                               |
| SSO                        | Entra ID via Supabase SAML/OIDC, sans changer l'application (P3)                                                                                                                                                                                                                                                                                                                                                   |

## 3. Sessions

- Jeton d'accès JWT de 1 h, rafraîchi automatiquement ; rotation des jetons de rafraîchissement (réutilisation détectée = session révoquée).
- Stockage : `sessionStorage` (fermé avec l'onglet), pas `localStorage`. **Limite assumée** : dans une SPA sans serveur intermédiaire, le jeton reste lisible par le JavaScript de la page ; la parade est l'absence de XSS (React, pas de HTML brut) et une CSP stricte. Des cookies HttpOnly supposent un « backend-for-frontend » (P3).
- Déconnexion : `record_sign_out` (audit) puis `auth.signOut()` qui révoque le jeton de rafraîchissement de la session côté serveur ; le cache de données est vidé. Le jeton d'accès déjà émis reste techniquement valide jusqu'à son expiration (≤ 1 h) : c'est la limite des JWT sans état ; un compte **désactivé** perd en revanche l'accès immédiatement (RLS).
- Expiration : une requête avec un jeton expiré est refusée par l'API ; l'application renvoie à la connexion.

## 4. Modèle d'organisation et périmètre

```text
Entreprise (installation unique)
  └── Site (paramètres : settings.plantName)
       └── Atelier (workshops)
            ├── Ligne = zone (lines."workshopId")
            │    └── Postes (workstations."lineId")
            └── Équipes (teams : "lineId" facultatif)
       └── Utilisateurs (users : "teamId", "lineId", "workstationId")
```

Niveau de périmètre par rôle (fonction `app.scope_level()`) :

| Rôle                                   | Périmètre de supervision                |
| -------------------------------------- | --------------------------------------- |
| Administrateur, Manager, Qualité (LQC) | Site                                    |
| Line Leader                            | Sa ligne                                |
| Hancho                                 | Son équipe                              |
| Opérateur                              | Lui-même (et ses affectations d'équipe) |

## 5. Autorisation (RLS)

Deux fonctions forment le socle, toutes deux `SECURITY DEFINER`, `search_path` vide :

- `app.has_perm(p)` : permission du rôle, lue dans `app.role_permissions`. La table est générée depuis `src/services/auth/permissions.ts` (`npm run db:permissions`) : une seule source de vérité.
- `app.current_user_id()`, `app.current_team()`, `app.current_line()` : profil de l'appelant (actif uniquement).

Politiques principales :

| Table                                                  | Lecture                                                                               | Écriture                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`                                                | annuaire interne des comptes actifs ; comptes désactivés visibles de l'administration | création : fonction `admin-users` uniquement ; modification : `user.manage` / `team.manage` ; `authId`, `email`, `lastSignInAt`, `createdAt` figés ; personne ne change son propre rôle ni ne se désactive                                                                                                                                               |
| `teams`, `lines`, `workstations`, `workshops`          | tout compte actif                                                                     | `team.manage` / `workstation.manage`                                                                                                                                                                                                                                                                                                                     |
| `routineTemplates`, `checklists`, `sequenceTemplates`  | tout compte actif                                                                     | `routine.manage` / `checklist.manage` / `sequence.manage`                                                                                                                                                                                                                                                                                                |
| `schedules`                                            | affectées à moi ou à mon équipe ; supervision dans mon périmètre ; `schedule.manage`  | `schedule.manage`                                                                                                                                                                                                                                                                                                                                        |
| `routineRuns`                                          | exécution d'une planification que je peux lire                                        | insertion : planification affectée à moi, date du jour (heure de l'atelier), exécutant = moi ; résultats : **uniquement** par `record_run_result` (fusion atomique d'une saisie, auteur et heure imposés par le serveur) ; clôture : exécutant = moi, tâches obligatoires vérifiées par le serveur ; colonnes d'identité figées ; **pas de suppression** |
| `actions`                                              | responsable, suppléant, créateur ; `action.manage`                                    | création : `action.create`, créateur = moi ; modification : personne concernée (statut et notes seulement) ou `action.manage` ; **pas de suppression**                                                                                                                                                                                                   |
| `andonAlerts`                                          | tout compte actif (tableau d'atelier)                                                 | déclenchement : `andon.raise`, déclarant = moi, statut « Nouveau » ; transitions : `andon.respond`, ordre imposé par trigger                                                                                                                                                                                                                             |
| `anomalies`                                            | déclarant ; `anomaly.manage`                                                          | déclaration : `anomaly.create`, déclarant = moi ; traitement : `anomaly.manage`                                                                                                                                                                                                                                                                          |
| `meetings`                                             | invités (directs ou via équipe), responsable, supervision, `meeting.manage`           | `meeting.manage` ; le responsable n'édite que présences, ordre du jour coché, compte-rendu, statut                                                                                                                                                                                                                                                       |
| `comments`                                             | si la cible est lisible (la sous-requête applique la RLS de la cible)                 | auteur = moi, cible lisible ; modification du texte par l'auteur seul                                                                                                                                                                                                                                                                                    |
| `notifications`                                        | les miennes                                                                           | lecture seule (marquer lu) ; créées **uniquement par triggers**                                                                                                                                                                                                                                                                                          |
| `productionOrders`, `materialStocks`, `stockMovements` | `production.view`                                                                     | `production.update`                                                                                                                                                                                                                                                                                                                                      |
| `qualityChecks`                                        | `quality.record`, `reporting.view`                                                    | `quality.record`, mesureur = moi                                                                                                                                                                                                                                                                                                                         |
| `settings`                                             | tout compte actif                                                                     | `settings.manage` ; `environment` (demo / production) **figé** : il ne change que par migration                                                                                                                                                                                                                                                          |
| `auditLog`                                             | `settings.manage`                                                                     | **aucune** (triggers uniquement)                                                                                                                                                                                                                                                                                                                         |

Protection IDOR/BOLA : une ressource hors périmètre n'est **pas renvoyée** (lecture) ou la requête **échoue** (écriture), quel que soit l'identifiant fourni dans l'URL ou le corps.

## 6. Validation

Toute donnée entrante est contrôlée par la base :

- contraintes `CHECK` : énumérations, longueurs (titre ≤ 160, texte ≤ 4 000), format HH:mm, cohérence des dates, bornes numériques, photo = image JPEG en data URL ≤ 2 Mo ;
- triggers `BEFORE` : colonnes non modifiables, transitions de statut autorisées, auteur imposé (`auth` → `users.id`), structure JSON des tâches et contrôles ;
- clés étrangères entre entités.

TypeScript ne sert qu'au développeur. La validation des formulaires reste côté client, pour l'ergonomie.

## 7. Journal d'audit

Table `auditLog` : `at`, `actorId`, `event`, `resource`, `resourceId`, `detail` (JSON). Elle est alimentée par des triggers `SECURITY DEFINER` sur les tables sensibles et par la fonction `admin-users`. Événements : USER_CREATED, USER_UPDATED, USER_ROLE_CHANGED, USER_DEACTIVATED, ROUTINE_CREATED/UPDATED/ARCHIVED, SCHEDULE_CREATED/UPDATED/CANCELLED, ROUTINE_STARTED, ROUTINE_COMPLETED, ANDON_CREATED/ACKNOWLEDGED/IN_PROGRESS/RESOLVED, CORRECTIVE_ACTION_CREATED/UPDATED, ANOMALY_CREATED/UPDATED, MEETING_CREATED/UPDATED/DELETED, SETTINGS_CHANGED, PERMISSION_DENIED (fonction serveur).

Connexions et déconnexions : journal d'authentification de Supabase (côté serveur), plus USER_LOGIN / USER_LOGOUT écrits par les RPC `record_sign_in` / `record_sign_out` (appelées par l'application : valeur indicative, un client hostile peut s'abstenir de les appeler). Réinitialisations d'environnement : DEMO_ENVIRONMENT_RESET. Création de compte, mot de passe provisoire, refus d'accès aux fonctions serveur : USER_CREATED, USER_PASSWORD_RESET, PERMISSION_DENIED.

Consultation : écran **Administration → Journal d'audit** (lecture seule).

Personne ne peut modifier ni supprimer une ligne du journal via l'API.

## 8. Limitation de débit

- Connexion, réinitialisation : limites intégrées de Supabase Auth.
- Créations : trigger `app.rate_limit()` par utilisateur (Andon : 10 / 10 min ; anomalies : 20 / 10 min ; commentaires : 30 / 5 min ; actions : 60 / h).
- Demandes « mot de passe oublié » : 3 / h par identifiant, 30 / h au total.
- Lecture : pas de limite applicative (limites globales de la plateforme Supabase).

## 9. Frontend

- Aucun secret : l'URL Supabase et la **clé publishable** sont publiques par conception, car la RLS protège les données. La clé de service n'existe que dans les secrets de la fonction Edge.
- Le code du fournisseur simulé (mot de passe de démonstration) est **éliminé du bundle** en mode Supabase (constante de build).
- En-têtes (`vercel.json`) : CSP stricte (`default-src 'self'`, `script-src 'self'`, styles d'attribut seulement en ligne, `connect-src` limité au projet Supabase, `frame-src 'none'` tant qu'aucun tableau BI n'est configuré — ajouter son origine le jour où il l'est —, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`), HSTS, nosniff, Referrer-Policy, COOP, Permissions-Policy, `X-Robots-Tag: noindex`.
- Une clé **secrète** placée par erreur dans `VITE_SUPABASE_PUBLISHABLE_KEY` bloque le démarrage (`isSecretSupabaseKey`).

## 10. Environnements

| Environnement                                | Données                                        | Authentification                                  | Remarques                                                                      |
| -------------------------------------------- | ---------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------ |
| Développement / tests automatisés            | `localStorage` ou mémoire, jeu généré          | Fournisseur simulé, **non sécurisé**              | Jamais déployé en production                                                   |
| Démonstration (Supabase `routines-app-demo`) | Jeu de démonstration, **aucune donnée réelle** | Supabase Auth, RLS                                | Comptes de démonstration aux mots de passe aléatoires (hors dépôt)             |
| Production                                   | Projet Supabase **distinct**                   | Supabase Auth ou SSO Entra ID, MFA administrateur | Aucun compte de démonstration ; réinitialisation impossible depuis l'interface |

## 11. État réel (29 septembre 2026)

**Appliqué par le serveur** (projet `routines-app-demo`, eu-west-3, migrations `supabase/migrations/0001` à `0011`) :

- authentification Supabase Auth, inscription publique refusée, comptes de démonstration à mots de passe aléatoires (hors dépôt) ;
- RLS sur les 30 tables, accès `anon` révoqué ; rôle et périmètre relus en base à chaque requête ;
- triggers d'intégrité (colonnes figées, transitions, auteur imposé, horodatages serveur, date du jour à l'heure de l'atelier) ;
- notifications et journal d'audit écrits par le serveur ; journal non modifiable ;
- fonctions Edge `admin-users` et `demo-seed` : permission vérifiée côté serveur, CORS limité aux origines de l'application ;
- limitation de débit des créations et des demandes d'aide.

Vérifié par `npm run test:security` (44 tests contre le serveur) et `E2E_BACKEND=supabase npx playwright test` (voir `docs/SECURITY_TESTS.md`).

**Reste côté client (ergonomie, pas sécurité)** : masquage des menus et gardes de route ; validation des formulaires ; calculs d'indicateurs du reporting (sur les seules données que la RLS renvoie).

**Mode démonstration local** (`VITE_DATA_MODE=demo`) : inchangé, **aucune sécurité**, réservé au développement et aux tests hors ligne.

**À régler dans le tableau de bord Supabase** (non modifiable par migration) : longueur minimale des mots de passe (12), protection contre les mots de passe divulgués (offre payante), MFA TOTP pour les administrateurs, SMTP d'entreprise pour les emails de réinitialisation, durée de vie des jetons si la politique interne l'exige.

**Dépend d'une décision ou d'une infrastructure** : projet Supabase de production distinct (aucun compte de démonstration), SSO Entra ID, sauvegardes et PITR (offre payante), BFF à cookies HttpOnly si l'exposition du jeton à JavaScript n'est pas acceptable, hébergement dans l'infrastructure de l'entreprise.
