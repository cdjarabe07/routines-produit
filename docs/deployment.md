# Déploiement

## 1. Build statique

```bash
npm ci
npm run build        # génère dist/
```

`dist/` est un site statique (routeur hash, chemins relatifs) : il se sert depuis n’importe quel serveur web d’intranet (IIS, nginx, Apache, Azure Static Web Apps, SharePoint n’est **pas** recommandé). Aucune réécriture d’URL n’est nécessaire. Les QR codes pointent vers `<adresse>/#/signaler?poste=<CODE>` : l’adresse de publication doit être stable.

Recommandations serveur : HTTPS obligatoire, en-têtes `Content-Security-Policy` (`default-src 'self'; img-src 'self' data:; frame-src <origine BI>`), `X-Content-Type-Options: nosniff`, cache long sur `assets/`, pas de cache sur `index.html`.

## 2. Niveaux d’environnement

| Niveau        | Données                                | Authentification                       | Usage                            |
| ------------- | -------------------------------------- | -------------------------------------- | -------------------------------- |
| DÉMO          | localStorage du navigateur, jeu fictif | Choix de profil, **aucune sécurité**   | Présentation, tests utilisateurs |
| DÉVELOPPEMENT | Backend local + données d’amorçage     | Fournisseur de test                    | Intégration                      |
| PRODUCTION    | Backend + base de données              | Fournisseur d’identité de l’entreprise | Exploitation                     |

Le niveau DÉMO ne doit jamais contenir de données réelles.

## 3. Contrat de l’API (mode `api`)

`src/services/data/httpDataSource.ts` consomme une API REST générique :

| Méthode | Chemin                       | Corps / réponse                       |
| ------- | ---------------------------- | ------------------------------------- |
| GET     | `/{collection}?champ=valeur` | Liste (filtres d’égalité optionnels)  |
| GET     | `/{collection}/{id}`         | Entité                                |
| POST    | `/{collection}`              | Entité sans `id`/dates → entité créée |
| PATCH   | `/{collection}/{id}`         | Champs modifiés → entité à jour       |
| DELETE  | `/{collection}/{id}`         | 204                                   |

Collections (kebab-case) : `users`, `lines`, `workstations`, `presence`, `leaves`, `routine-templates`, `routine-runs`, `actions`, `comments`, `anomalies`, `andon-alerts`, `sequence-templates`, `sequence-runs`, `production-orders`, `material-stocks`, `stock-movements`, `gemba-walks`, `quality-checks`, `knowledge-items`, `favorites`, `meetings`, `handovers`, `announcements`, `notifications`, `settings`. Schémas : `docs/data-model.md`.

Le jeton est transmis en `Authorization: Bearer`. Codes d’erreur interprétés : 401 (session expirée), 403, 404, 5xx, erreur réseau — messages utilisateur dans `src/services/errors.ts`.

À prévoir côté backend :

- **Contrôle des permissions côté serveur** avec la même matrice que `permissions.ts` (le frontend ne fait que masquer).
- Opérations transactionnelles pour les écritures multiples (validation Gemba + actions, résolution Andon + anomalie, mouvement de stock) : les hooks de `features/*/api.ts` pourront appeler un endpoint dédié sans changer leur signature.
- Pagination et filtres de période pour les collections volumineuses (`routine-runs`, `quality-checks`, `andon-alerts`).
- Stockage des photos en fichiers (URL dans le champ `photo`) plutôt qu’en data URL.
- Notifications email/Teams : connecteur à brancher côté serveur (aujourd’hui : notifications internes uniquement).

## 4. Authentification

`src/services/auth/authService.ts` définit l’interface `AuthService` (`getSession`, `signIn`, `signOut`, `getAccessToken`).

Cible présumée (écosystème Power Platform du prototype) : **Microsoft Entra ID** via `@azure/msal-browser`.

1. Enregistrer l’application dans Entra ID (SPA, URI de redirection = adresse de publication).
2. Implémenter `createOidcAuthService()` : connexion par redirection, `getAccessToken()` via `acquireTokenSilent`, `userId` = identifiant de l’utilisateur côté backend.
3. Dans `src/app/App.tsx`, utiliser ce service lorsque `VITE_AUTH_MODE=oidc`.
4. Le rôle provient du backend (ou des rôles d’application Entra), jamais d’un choix côté client.

Tant que ce service n’est pas implémenté, `VITE_AUTH_MODE=oidc` affiche « Authentification non configurée » et bloque l’accès.

## 5. Tableaux BI

Renseigner `VITE_BI_EMBED_URL` (https) et `VITE_BI_ALLOWED_ORIGIN`, puis reconstruire. Pour Power BI, utiliser une URL d’intégration sécurisée (« Incorporer un rapport » avec authentification Entra ID) ; ne jamais utiliser « Publier sur le web » pour des données internes. Ajouter l’origine au `frame-src` de la CSP.

## 6. Données machine

Aucune source n’est branchée. Pour alimenter le plan atelier (états automates, cadences) : exposer depuis le MES ou un collecteur OPC UA une ressource `machine-states` et l’ajouter comme nouvelle source de signal dans `features/plant/model.ts`, en ajoutant une valeur `machine` au type `DataOrigin` (la provenance de chaque signal est déjà affichée à l’écran).

## 7. Vérifications avant mise en production

```bash
npm run lint && npm test && npm run build && npm run e2e
```
