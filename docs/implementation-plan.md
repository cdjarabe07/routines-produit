# Plan d'implémentation

Ordre exact des modifications. Chaque phase se termine par un contrôle (`lint`, `typecheck`, tests) et un commit séparé.

## 1. Dépendances entre fonctionnalités

```text
Rôles & permissions ──► Authentification & gardes ──► Espaces & navigation
        │
        ▼
Équipes ──► Routines (tâches) ◄── Checklists
                 │
                 ▼
           Planification ──► Occurrences (calculées) ──► Espace utilisateur (planning, mes routines, exécution)
                                         │                               │
                                         ▼                               ▼
                             Supervision (routines par personne)   Exécutions (RoutineRun)
                                         │                               │
                                         └──────────► Reporting ◄────────┘

Réunions & agenda (participants, équipes) ──► Mon planning, Tableau de bord utilisateur
Andon ──► Action corrective ──► Résolution ──► Reporting
```

Conséquences :

- la **planification** dépend des équipes et du nouveau modèle de routine ;
- l'**espace utilisateur** dépend de la planification ;
- le **reporting** dépend des occurrences.

## 2. Modèle de données cible

Les valeurs dérivées restent calculées et ne sont jamais stockées.

| Entité                                       | Changement                                                                                                                                                                                                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `User`                                       | + `teamId`, `workstationId` (poste habituel), `lastSignInAt`                                                                                                                                                                                                             |
| **`Team`** (nouvelle)                        | `name`, `shift`, `lineId?`, `leaderId?`, `active`                                                                                                                                                                                                                        |
| `Line`                                       | Joue le rôle de **zone**. Aucune entité Zone ajoutée                                                                                                                                                                                                                     |
| `RoutineTemplate` (« Routine »)              | − `role`, − `scheduledTime`, − `sections` ; + `durationMin`, `defaultTime`, `lineId?`, `workstationId?`, `tasks: RoutineTask[]`                                                                                                                                          |
| **`RoutineTask`** (dans la routine)          | `title`, `description?`, `instructions?`, `estimatedMin?`, `priority`, `required`, `responsibleRole?`, `knowledgeId?`, `checklistId?`, `checks: ChecklistItem[]`. L'ordre est celui du tableau                                                                           |
| **`Checklist`** (nouvelle, bibliothèque)     | `name`, `description?`, `items: ChecklistItem[]`, `active`                                                                                                                                                                                                               |
| **`ChecklistItem`**                          | `label`, `type` (`conformity`, `yes_no`, `number`, `text`, `select`, `comment`), `required`, `options?`, `unit?`, `min?`, `max?`, `knowledgeId?`                                                                                                                         |
| **`Schedule`** (nouvelle, « Planification ») | `routineId`, `startDate`, `time`, `recurrence` (`once`, `daily`, `weekdays`, `weekly`), `weekdays?`, `endDate?`, `assigneeId?` ou `teamId?`, `lineId?`, `workstationId?`, `status` (`active`, `cancelled`), `skippedDates` (occurrences annulées), `createdBy`           |
| Occurrence                                   | **Calculée** : planification × date. Clé `scheduleId` + `date`                                                                                                                                                                                                           |
| `RoutineRun` (« Exécution »)                 | + `scheduleId`, `startedAt`, `startedBy`, `completedBy` ; `results` indexé par tâche ou par tâche/contrôle ; `ItemResult.value` pour les contrôles typés                                                                                                                 |
| `Comment`                                    | Cibles + `routineRun` et `meeting` ; + `anchorId` (tâche commentée)                                                                                                                                                                                                      |
| `Meeting` (« Événement d'agenda »)           | + `type` (réunion, briefing, daily, formation, audit, maintenance, opérationnel), `endTime` (remplace `durationMin`), `location`, `description`, `teamIds`. `participantIds` = **invités** ; + `attendeeIds` = présents ; statut + `cancelled` ; `seriesId` (répétition) |
| `AndonAlert`                                 | Statut + `in_progress` (« En résolution ») avec `resolutionStartedAt` ; urgence `low`, `medium`, `critical`                                                                                                                                                              |
| `Action`                                     | Statut + `blocked` (avec `blockedReason`) ; + `resolutionNote` ; source `andon` reliée à la fiche Andon                                                                                                                                                                  |
| `KnowledgeItem`                              | `isExample` → `toReview` (« À valider », visible uniquement dans l'administration) ; statut + `archived`                                                                                                                                                                 |
| `AppNotification`                            | Types + `routine_assigned`, `meeting_invited`, `access_request`                                                                                                                                                                                                          |

La clé de stockage passe à `ra:v2:`. Les données d'une version précédente ne sont pas migrées : le jeu initial est rechargé.

## 3. Routes cibles

| Espace                                     | Routes                                                                                                                                                                                                                                                            |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public                                     | `/login` (et `/connexion` → `/login`)                                                                                                                                                                                                                             |
| Racine                                     | `/` → redirection selon le profil                                                                                                                                                                                                                                 |
| Mon travail (`space.app`)                  | `/app`, `/app/planning`, `/app/routines`, `/app/routines/:scheduleId/:date`, `/app/sequences`, `/app/reunions`, `/app/actions`, `/app/connaissances`, `/app/passation`                                                                                            |
| Supervision (`space.supervision`)          | `/manager`, `/manager/equipe`, `/manager/routines`, `/manager/production`, `/manager/atelier`, `/manager/anomalies`, `/manager/actions`, `/manager/gemba`, `/manager/gemba/nouvelle`, `/manager/qualite`, `/manager/reporting`, `/manager/bi`                     |
| Administration (`space.admin`)             | `/admin/dashboard`, `/admin/utilisateurs`, `/admin/equipes`, `/admin/routines`, `/admin/checklists`, `/admin/sequences`, `/admin/planification`, `/admin/reunions`, `/admin/agenda`, `/admin/connaissances`, `/admin/postes`, `/admin/roles`, `/admin/parametres` |
| Détails communs (contenu selon les droits) | `/andon`, `/andon/:id`, `/actions/:id`, `/anomalies/:id`, `/reunions/:id`, `/connaissances/:id`, `/gemba/:id`, `/sequences/execution/:runId`, `/signaler` (QR codes imprimés : inchangé)                                                                          |
| Anciennes routes                           | Redirigées vers leur nouvel emplacement (`/routines`, `/agenda`, `/equipe`, `/production`, `/atelier`, `/anomalies`, `/gemba`, `/qualite`, `/reporting`, `/bi`, `/connaissances`, `/sequences`, `/passation`, `/actions`)                                         |

## 4. Phases

| Phase | Contenu                                                                                                                                                                                                                             | Commit                                                                                             |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1     | Audit (ces cinq documents)                                                                                                                                                                                                          | `docs: audit current state and plan role-based evolution`                                          |
| 2     | Permissions (`space.*`, séparation configuration / exécution / supervision), `policies.ts` avec `can(user, permission, ressource)`, écran Rôles et droits                                                                           | `feat: introduce role based permission model`                                                      |
| 3     | Fournisseur d'authentification simulé (identifiant ou email + mot de passe), comptes centralisés, écran de connexion, mot de passe oublié (demande transmise à l'administrateur), dernière activité ; suppression des mentions DÉMO | `feat: add credential based authentication flow`, `fix: remove demo messaging from user interface` |
| 4     | Espaces, sélecteur d'espace, menus par espace, redirection selon le profil, gardes par espace et par page, redirections des anciennes routes                                                                                        | `feat: introduce role based workspaces and route guards`                                           |
| 5     | Équipes ; routines avec tâches ; checklists typées ; nouveau jeu initial (planifications, 30 jours d'exécutions cohérentes)                                                                                                         | `feat: add teams, routine tasks and checklists`                                                    |
| 6     | Planification : création, répétition, affectation personne ou équipe, modification, annulation globale ou d'une occurrence, vue liste et semaine, notification                                                                      | `feat: add routine scheduling`                                                                     |
| 7     | Espace utilisateur : tableau de bord, Mon planning, Mes routines, exécution (Démarrer, chronomètre, tâches, checklist typée, instructions, commentaires, fin, récapitulatif)                                                        | `feat: add user daily workspace`                                                                   |
| 8     | Synchronisation administration → planning → utilisateur ; suivi des routines par personne côté supervision                                                                                                                          | `feat: connect scheduled routines to user and supervision workspaces`                              |
| 9     | Réunions et agenda : CRUD, types, participants et équipes invités, duplication, répétition, « Mes réunions »                                                                                                                        | `feat: add meeting and agenda management`                                                          |
| 10    | Andon (en résolution, 3 urgences, fiche détaillée, action corrective) et actions (bloquée, note de résolution)                                                                                                                      | `feat: improve andon and corrective action workflow`                                               |
| 11    | Tableaux de bord administrateur et manager ; reporting fondé sur les occurrences (programmées, terminées, en cours, en retard, non réalisées ; durée réelle)                                                                        | `feat: add supervision and admin dashboards`, `feat: connect reporting to scheduled activities`    |
| 12    | Centre de connaissances : gestion séparée (créer, modifier, publier, archiver, catégoriser, « à valider ») et consultation                                                                                                          | `feat: separate knowledge administration from consultation`                                        |
| 13    | Chatbot : rien à conserver, rien d'inventé. Documentation uniquement                                                                                                                                                                | inclus dans le commit de documentation                                                             |
| 14    | Passe UI/UX : états (chargement, succès, vide, erreur, désactivé, refus), responsive tablette et mobile de l'espace utilisateur, séquences (réordonner, validation, étapes actives)                                                 | `feat: complete sequence administration`, `fix: …` selon les constats                              |
| 15    | Tests unitaires, parcours intégrés, e2e des scénarios 1 à 3 de la demande, audit des routes par rôle, débordement, axe ; build ; mise à jour de la documentation                                                                    | `test: cover admin, user and anomaly scenarios end to end`                                         |

## 5. Critère de réussite

Les trois scénarios du §46 fonctionnent dans un vrai navigateur, sur le build de production, avec une seule session de navigation. Les données persistent entre les connexions successives :

1. **Administrateur**
   - crée une routine et ses tâches ;
   - la planifie et l'affecte à Nadia ;
   - crée une réunion et y invite Nadia ;
   - vérifie la planification.
2. **Nadia (opératrice)**
   - voit la routine et la réunion sur son tableau de bord ;
   - démarre la routine, exécute les tâches, commente, termine ;
   - la durée réelle est enregistrée.
3. **Anomalie**
   - Nadia déclenche un Andon ;
   - le manager le voit, le prend en charge, crée une action corrective et le résout ;
   - l'action est clôturée ;
   - le reporting compte l'Andon, l'action et la routine.

## 6. Évolutions futures (hors périmètre)

- **Assistant conversationnel** : rechercher une procédure dans le centre de connaissances, expliquer une routine. À construire sur un vrai moteur de recherche documentaire et un modèle hébergé, avec les sources citées. Il n'est pas simulé.
- **Backend** : API REST conforme à `deployment.md`, avec application serveur de la matrice des droits.
- **Authentification réelle** : Entra ID / OIDC derrière `AuthService`.
