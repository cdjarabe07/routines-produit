# État actuel de l'application (avant la finalisation « administration / exécution »)

> Audit réalisé le 29/09/2026 sur le dépôt `routines-app` (commit `a4a07a7` + `.gitignore`), et sur `legacy/LL-App-LL.html`.
> Objet : décrire précisément ce qui existe, ce qui fonctionne, ce qui est simulé, avant toute modification.

## 1. Synthèse

L'application est une SPA React/TypeScript structurée par modules métier (`src/features/*`), avec une couche de données abstraite (`DataSource` → `Repository`) et une matrice de permissions centralisée. Tous les modules du prototype `LL-App-LL.html` ont été reconstruits (voir `docs/legacy-audit.md` §9).

**Limite principale** : l'application est construite autour d'**un seul espace**, celui du Line Leader. Il n'existe aucune séparation entre :

- ce que l'on **configure et planifie** : routines, affectations, réunions, séquences ;
- ce que l'on **exécute** : la journée d'un utilisateur ;
- ce que l'on **supervise** : équipe, KPI, Andon, actions.

Concrètement :

| Constat                                                                                                                                                         | Conséquence                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Une routine est un **modèle rattaché à un rôle** (`RoutineTemplate.role`) avec une heure fixe. Elle est implicitement due **chaque jour** pour **tout le rôle** | Pas de planification, pas d'affectation à une personne ou à une équipe, pas de récurrence, pas de date                                                                            |
| L'exécution est **partagée** par toutes les personnes du rôle (`RoutineRun` par modèle et par jour)                                                             | Impossible de savoir qui devait faire quoi ; le reporting ne peut pas mesurer « programmé / réalisé » par personne                                                                |
| Une routine = sections de points de contrôle OK/KO/N.A.                                                                                                         | Pas de tâches (ordre, durée, obligatoire, instructions, priorité), pas de checklist typée (valeur, texte, sélection), pas de chronomètre, pas de fin explicite ni de durée réelle |
| Les réunions sont créées par le Line Leader depuis l'agenda (titre, date, heure, durée)                                                                         | Pas de lieu, de responsable distinct, de participants invités (le champ `participantIds` sert aux **présences**), de type d'événement, de duplication ni de suppression           |
| Aucune notion d'équipe (entité)                                                                                                                                 | « Équipe » désigne seulement le quart (matin / après-midi / nuit)                                                                                                                 |
| Un seul tableau de bord (cockpit Line Leader) pour tous                                                                                                         | Un opérateur voit un cockpit de supervision au lieu de « ce que je dois faire maintenant »                                                                                        |
| Connexion par **choix de profil** avec bandeau « MODE DÉMO »                                                                                                    | Pas de parcours de connexion crédible ; le mécanisme de démonstration est visible partout                                                                                         |
| L'opérateur n'a **pas** le droit `routine.execute`                                                                                                              | Le rôle le plus nombreux ne peut pas recevoir de routine                                                                                                                          |

## 2. Pile et organisation

| Élément     | Détail                                                                                                                                                                                                                                                                             |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pile        | React 19, TypeScript strict, Vite 8, react-router 8 (routeur hash), TanStack Query 5, CSS Modules + tokens                                                                                                                                                                         |
| Code        | `src/app` (routeur, gardes, navigation, providers), `src/components` (UI, layout, feedback, data-display), `src/features/<module>` (`model.ts` = règles pures, `api.ts` = opérations, `pages/`, `components/`), `src/services` (data, auth, errors, logger), `src/types/domain.ts` |
| Tests       | 56 tests Vitest (règles, couche de données, parcours intégrés), 9 tests Playwright (routes × 3 rôles, débordement × 4 tailles, parcours Andon, audit axe WCAG 2.1 AA sur 31 routes)                                                                                                |
| Déploiement | GitHub privé `cdjarabe07/routines-app`, Vercel `routines-app-mu.vercel.app` (redéploiement à chaque push)                                                                                                                                                                          |

## 3. Routes existantes

Toutes les routes sont chargées à la demande et protégées par `RequireAuth` et, si besoin, par `RequirePermission`.

| Route                                                                       | Écran                                                                                         | Permission                                       |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `/connexion`                                                                | Choix de profil (DÉMO)                                                                        | —                                                |
| `/`                                                                         | Accueil / cockpit (priorités, état des lignes, KPI du jour, agenda, annonce, rapport du jour) | —                                                |
| `/routines`                                                                 | Routines du jour pour mon rôle ou tous les rôles, navigation par date                         | `routine.execute`                                |
| `/routines/modeles`                                                         | Gestion des modèles de routines                                                               | `routine.manage`                                 |
| `/routines/:templateId/:date`                                               | Saisie d'une routine (OK/KO/N.A., commentaire, anomalie liée)                                 | `routine.execute`                                |
| `/actions`, `/actions/:id`                                                  | Plan d'actions unifié, détail et commentaires                                                 | —                                                |
| `/agenda`, `/reunions/:id`                                                  | Agenda du jour (routines + réunions), animation d'une réunion                                 | — (édition : `meeting.manage`)                   |
| `/passation`                                                                | Passations entre équipes, accusé de lecture                                                   | — (rédaction : `handover.write`)                 |
| `/equipe`                                                                   | Présences, congés                                                                             | — (saisie : `team.updateStatus`, `leave.manage`) |
| `/andon`                                                                    | Tableau Andon, déclenchement, prise en charge, résolution, historique                         | — (actions : `andon.raise`, `andon.respond`)     |
| `/production`                                                               | Ordres de fabrication par étape, stocks matières (kanban)                                     | — (édition : `production.update`)                |
| `/atelier`                                                                  | Plan de l'atelier (jumeau numérique)                                                          | —                                                |
| `/sequences`, `/sequences/execution/:runId`                                 | Séquences guidées chronométrées                                                               | `sequence.run`                                   |
| `/anomalies`, `/anomalies/:id`, `/signaler`                                 | Anomalies, qualification, déclaration par QR                                                  | — / `anomaly.create`                             |
| `/gemba`, `/gemba/nouvelle`, `/gemba/:id`                                   | Gemba Walk                                                                                    | — / `gemba.conduct`                              |
| `/qualite`                                                                  | Mesures LQC                                                                                   | — (saisie : `quality.record`)                    |
| `/reporting`, `/bi`                                                         | Analyse par période, tableaux BI                                                              | `reporting.view`                                 |
| `/connaissances`, `/connaissances/:id`                                      | Centre de connaissances                                                                       | — (gestion : `knowledge.manage`)                 |
| `/admin/utilisateurs`, `/admin/roles`, `/admin/postes`, `/admin/parametres` | Administration                                                                                | `admin.access`                                   |

Menu : un seul menu latéral groupé (Ma journée, Opérations, Qualité, Analyse, Ressources, Administration), filtré par permission.

## 4. Données

- **Collections** (25) : `users`, `lines`, `workstations`, `presence`, `leaves`, `routineTemplates`, `routineRuns`, `actions`, `comments`, `anomalies`, `andonAlerts`, `sequenceTemplates`, `sequenceRuns`, `productionOrders`, `materialStocks`, `stockMovements`, `gembaWalks`, `qualityChecks`, `knowledgeItems`, `favorites`, `meetings`, `handovers`, `announcements`, `notifications`, `settings`.
- **Persistance** :
  - le **stockage local est déjà centralisé**. Seul `services/data/storeDataSource.ts` écrit dans le magasin clé/valeur (clés `ra:v1:<collection>`) ; seul `services/auth/authService.ts` écrit la session (`sessionStorage`, clé `ra:session`) ;
  - aucun composant n'appelle `localStorage` directement ;
  - en mode API, `httpDataSource` implémente le même contrat REST.
- **Valeurs dérivées jamais stockées** : retard d'une action, état d'une routine, conformité LQC, état d'un poste sur le plan, statut de présence.
- **Jeu initial** (`data/demo/seed.ts`) :
  - graine déterministe (mulberry32), 30 jours d'historique ;
  - 12 personnes, 2 lignes, 8 postes, 10 modèles de routines, 2 séquences, OF, stocks, Gemba, mesures LQC, 30 réunions ;
  - les contenus du centre de connaissances portent `isExample: true`.

## 5. Fonctionnalités : ce qui fonctionne réellement

| Fonctionnalité                          | État                                                                                                                                                                                                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routines                                | Saisie horodatée par point, commentaire, déclaration d'anomalie sur non-conformité, historique par jour, lien vers le standard, gestion des modèles (sections, points, standard associé, archivage)                                                                 |
| Tâches / actions                        | Entité `Action` unique avec source (manuelle, réunion, anomalie, Gemba, Andon…), responsable + suppléant, priorité, échéance, retard calculé, commentaires, notifications                                                                                           |
| Séquences guidées                       | Machine à états persistée ; chronomètre fondé sur l'horodatage (survit au rechargement) ; pause, étape suivante ou précédente, abandon ; création et modification des séquences                                                                                     |
| Commentaires                            | Entité `Comment` sur action, anomalie, Gemba et Andon, avec modification par l'auteur. **Pas** de commentaire sur une routine, une tâche de routine ou une réunion                                                                                                  |
| Andon                                   | Déclenchement par poste, type et urgence ; prise en charge ; résolution avec cause obligatoire ; escalade calculée ; historique et analyse ; notification des intervenants de la ligne. Statuts : en attente, pris en charge, résolu (pas d'état « en résolution ») |
| Jumeau numérique (plan atelier)         | Plan 2D des postes. État calculé depuis les données (Andon, stocks, OF) ; données machine affichées comme « non connectées »                                                                                                                                        |
| Production / Kanban                     | OF par étape (planifié, en cours, bloqué, terminé) ; stocks matières avec seuils, mouvements, création de références                                                                                                                                                |
| Gemba Walk                              | Checklist, observations, validation, actions liées                                                                                                                                                                                                                  |
| Qualité LQC                             | Mesures avec bornes ; conformité calculée ; anomalie sur mesure hors tolérance                                                                                                                                                                                      |
| Centre de connaissances                 | Standards et liens, recherche, filtres, favoris, gestion (brouillon / publié)                                                                                                                                                                                       |
| Reporting et analyse temporelle         | Périodes (7 j, 30 j, mois, personnalisée), comparaison avec la période précédente, filtre par ligne ; indicateurs calculés depuis les données ; définitions en info-bulle                                                                                           |
| Agenda et réunions                      | Agenda du jour ; réunion : présences, ordre du jour, compte-rendu enregistré automatiquement, actions décidées                                                                                                                                                      |
| Passation, équipe, annonce              | Opérationnels                                                                                                                                                                                                                                                       |
| Notifications                           | Centre de notifications interne (actions assignées, Andon, commentaires, anomalies)                                                                                                                                                                                 |
| Modales, tiroirs, toasts, confirmations | Composants accessibles (focus, Échap, rôle `dialog`)                                                                                                                                                                                                                |
| Responsive                              | Menu en tiroir sous 1024 px ; tableaux en cartes sous 900 px ; aucun débordement mesuré de 390 à 1920 px                                                                                                                                                            |
| Aide contextuelle                       | Panneau « Aide » par écran (texte statique)                                                                                                                                                                                                                         |

## 6. Ce qui est uniquement simulé

| Élément                          | Nature                                                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Authentification                 | `DemoAuthService` : choix d'un profil dans une liste, **aucune vérification d'identité** ; session en `sessionStorage` |
| Données                          | Stockage dans le navigateur (`localStorage`), propres à chaque appareil ; jeu initial généré                           |
| Historique de 30 jours           | Généré par le seed (graine fixe) ; les indicateurs sont calculés dessus comme sur des données saisies                  |
| Personnes, postes, OF, standards | Contenus d'illustration                                                                                                |
| Emails                           | Aucun envoi ; seulement des notifications internes                                                                     |
| BI                               | Aucun rapport connecté ; l'écran le dit explicitement                                                                  |
| Données machine                  | Aucune ; le plan de l'atelier le dit explicitement                                                                     |

## 7. Éléments visibles qui révèlent le mécanisme de démonstration

À supprimer de l'expérience visible (demande §4 et §40), sans supprimer le mécanisme technique :

1. `LoginPage` : encadré « Mode démonstration. Aucune authentification… données fictives » et choix de profil.
2. `AppShell` : bandeau « MODE DÉMO — données fictives… » sur toutes les pages ; message hors ligne « Le mode démo continue… ».
3. `TopBar` : « Session de démonstration — aucune authentification », entrée « Changer de profil », description des notifications « L'envoi d'emails n'est pas configuré ».
4. `SettingsPage` : panneau « Données de démonstration », badges « DÉMO — navigateur » et « DÉMO — aucune sécurité ».
5. Centre de connaissances : badges « Exemple à remplacer », bandeau « exemples repris du prototype », propriétaire « Exemple — prototype », liens vers `example.com` (liens morts).
6. Aide de l'accueil : « Le bandeau violet rappelle que l'application fonctionne en mode démonstration ».
7. Données : utilisateur « Administrateur démo », emails `@demo.local`, nom d'atelier « Atelier de câblage — démonstration », description de séquence « Exemple de séquence opératoire ».

Les mentions « Tableau BI non connecté » et « Données machine : non connectées » ne relèvent **pas** du mode démo : elles décrivent l'état réel d'une intégration. Elles sont conservées (§42 : ne pas fabriquer de chiffres).

## 8. Chatbot

**Aucun chatbot n'existe**, ni dans `legacy/LL-App-LL.html` ni dans l'application reconstruite. Une recherche de « chat », « bot », « assistant » et « IA » dans le prototype ne donne aucun résultat. Il n'y a donc rien à conserver.

La fonction qui s'en rapproche le plus est le **panneau « Aide »** de la barre supérieure : une aide statique propre à chaque écran (`src/app/help.ts`). Elle est conservée.

Conformément au §28, aucune fonctionnalité conversationnelle n'est ajoutée. Les usages futurs possibles sont notés dans `implementation-plan.md` (phase 13).

## 9. Correspondance avec la liste du §2 de la demande

| Élément demandé                    | Où il se trouve                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Routes, composants, pages          | §3 ; `src/app/router.tsx`                                                                             |
| Données, localStorage              | §4 ; `src/services/data`                                                                              |
| Logique de navigation              | `src/app/navigation.ts`, `SideNav`, `TopBar`                                                          |
| Routines, tâches, séquences, timer | `features/routines`, `features/actions`, `features/sequences` (chronomètre dans `sequences/model.ts`) |
| Commentaires                       | `features/shared/components/CommentThread.tsx`                                                        |
| Andon                              | `features/andon`                                                                                      |
| Digital Twin                       | `features/plant`                                                                                      |
| Production, Kanban                 | `features/production` (`OrderBoard`, `StockPanel`)                                                    |
| Gemba                              | `features/gemba`                                                                                      |
| Knowledge Center                   | `features/knowledge`                                                                                  |
| Reporting, analyse temporelle      | `features/reporting` (`PeriodSelector`, comparaison de périodes)                                      |
| Agenda, réunions                   | `features/meetings`                                                                                   |
| Chatbot                            | Inexistant (§8)                                                                                       |
| Authentification                   | `services/auth`, `app/providers/AuthProvider.tsx`, `features/auth/LoginPage.tsx`                      |
| Responsive                         | tokens et CSS Modules ; contrôlé par `e2e/app.spec.ts`                                                |
