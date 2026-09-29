# Modèle de données

Source : `src/types/domain.ts`. Toutes les entités ont `id`, `createdAt`, `updatedAt` (ISO 8601). Les dates calendaires (`DateKey`, `AAAA-MM-JJ`) sont en **heure locale de l’atelier**.

**Règle : les valeurs dérivées ne sont jamais stockées** (retard d’une action, état d’une routine, conformité, état d’un poste, statut « en congé »). Elles sont calculées dans `features/<module>/model.ts`.

## Vue d’ensemble

```text
Team 1──* User                          (le quart et la ligne d'un membre suivent son équipe)
Line 1──* Workstation                   (la ligne joue le rôle de « zone »)

Checklist ──* RoutineTask (checklistId)
RoutineTemplate 1──* RoutineTask ──* ChecklistItem (contrôles propres)
RoutineTemplate 1──* Schedule ── assigneeId → User  |  teamId → Team
Schedule × date  = Occurrence (calculée) ──0..1 RoutineRun ── results[tâche | tâche/contrôle] ──0..1 Anomaly
RoutineRun ──* Comment (targetType routineRun, anchorId = tâche)

Meeting (événement d'agenda) ── organizerId, participantIds, teamIds, attendeeIds ──* Action (source meeting) ──* Comment
AndonAlert ── raisedBy, acknowledgedBy, resolvedBy ──* Action (source andon) ──* Comment
Anomaly ──* Action (source anomaly)       GembaWalk ── observations[] ──0..1 Action (source gemba)
Workstation ──* MaterialStock ──* StockMovement      Line ──* ProductionOrder
User ──* PresenceRecord, Leave, Favorite, AppNotification
KnowledgeItem ← RoutineTask.knowledgeId, ChecklistItem.knowledgeId, SequenceStep.knowledgeId
SequenceTemplate 1──* SequenceRun
AppSettings (enregistrement unique « app »)
```

Chaînes demandées :

```text
User → Team → Schedule → Routine → Task → Execution (RoutineRun) → Result (ItemResult)
User → Andon → CorrectiveAction (Action, source andon) → Resolution (resolutionNote)
Admin → Meeting → Participants (participantIds + teamIds) → User
```

## Entités

| Entité           | Collection          | Champs clés                                                                                                                                                                                                                                                           | Remarques                                                      |
| ---------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| User             | `users`             | name, email, role, teamId?, workstationId?, lineId?, shift?, zoneLabel?, active, lastSignInAt?                                                                                                                                                                        | Rôles : operator, hancho, quality, line_leader, manager, admin |
| Team             | `teams`             | name, shift?, lineId?, leaderId?, active                                                                                                                                                                                                                              | Affectation collective des routines et réunions                |
| Line             | `lines`             | code, name                                                                                                                                                                                                                                                            | Zone                                                           |
| Workstation      | `workstations`      | code (unique, QR), name, process, lineId, mapX, mapY, active                                                                                                                                                                                                          |                                                                |
| Checklist        | `checklists`        | name, description?, items[ChecklistItem], active                                                                                                                                                                                                                      | Bibliothèque réutilisable                                      |
| ChecklistItem    | (intégré)           | label, type (conformity, yes_no, number, text, select, comment), required, options?, unit?, min?, max?, knowledgeId?                                                                                                                                                  | Nombre : conforme dans les bornes                              |
| RoutineTemplate  | `routineTemplates`  | title, description?, durationMin, defaultTime, lineId?, workstationId?, tasks[RoutineTask], active                                                                                                                                                                    | « Routine » : ce qui doit être fait                            |
| RoutineTask      | (intégré)           | title, description?, instructions?, estimatedMin?, priority, required, responsibleRole?, knowledgeId?, checklistId?, checks[ChecklistItem]                                                                                                                            | Ordre = ordre d’exécution                                      |
| Schedule         | `schedules`         | routineId, startDate, endDate?, time, recurrence (once, daily, weekdays, weekly), weekdays[], assigneeId? / teamId?, lineId?, workstationId?, status, skippedDates[], createdBy                                                                                       | « Planification » : quand et par qui                           |
| RoutineRun       | `routineRuns`       | scheduleId, templateId, date, assigneeId (exécutant), startedAt, results{clé → status, value?, comment?, at, by, anomalyId?}, completedAt?, completedBy?                                                                                                              | Une par occurrence ; durée réelle = completedAt − startedAt    |
| Action           | `actions`           | title, description?, assigneeId, backupId?, priority, status (todo, in_progress, blocked, done, cancelled), dueDate, source{type,id}, blockedReason?, resolutionNote?, closedAt?                                                                                      | Registre unique des actions correctives                        |
| Comment          | `comments`          | targetType (action, anomaly, gembaWalk, andonAlert, routineRun, meeting), targetId, anchorId?, authorId, text, editedAt?                                                                                                                                              |                                                                |
| Anomaly          | `anomalies`         | description, category, severity, workstationId?, status, reportedBy, photo?, origin{type,id}, closedAt?, resolutionNote?                                                                                                                                              |                                                                |
| AndonAlert       | `andonAlerts`       | workstationId, type, urgency (low, medium, critical), detail, status (active, acknowledged, in_progress, resolved), horodatages et auteurs de chaque étape, rootCause, resolution                                                                                     | Nouveau → Pris en charge → En résolution → Résolu              |
| SequenceTemplate | `sequenceTemplates` | name, steps[title, instruction?, validation?, durationMin, plannedTime?, knowledgeId?, active], active                                                                                                                                                                |                                                                |
| SequenceRun      | `sequenceRuns`      | templateId, status, currentStepIndex, segmentStartedAt, steps[stepId, elapsedMs, completedAt]                                                                                                                                                                         | Étapes figées au démarrage                                     |
| Meeting          | `meetings`          | title, type (meeting, briefing, daily, training, audit, maintenance, operational), date, startTime, endTime, location?, description?, organizerId, participantIds, teamIds, attendeeIds, agenda[], minutes, status (planned, in_progress, done, cancelled), seriesId? | « Événement d’agenda » ; invités ≠ présents                    |
| ProductionOrder  | `productionOrders`  | reference, harnessRef, lineId, quantityPlanned/Done, stage, status, blockedReason?, ownerId?, dueDate                                                                                                                                                                 |                                                                |
| MaterialStock    | `materialStocks`    | material, workstationId, quantity, min, target, unit                                                                                                                                                                                                                  |                                                                |
| StockMovement    | `stockMovements`    | stockId, delta, reason, by                                                                                                                                                                                                                                            |                                                                |
| GembaWalk        | `gembaWalks`        | date, zone, leaderId, participantIds, checklist[], observations[], status                                                                                                                                                                                             |                                                                |
| QualityCheck     | `qualityChecks`     | characteristic, workstationId, value, min, max, unit, measuredBy, anomalyId?                                                                                                                                                                                          |                                                                |
| KnowledgeItem    | `knowledgeItems`    | code, title, category, kind, summary, keyPoints, url?, version, owner, status (draft, published, archived), toReview                                                                                                                                                  | Seuls les documents publiés sont consultables                  |
| Favorite         | `favorites`         | userId, knowledgeId                                                                                                                                                                                                                                                   |                                                                |
| PresenceRecord   | `presence`          | userId, date, status, recordedBy                                                                                                                                                                                                                                      |                                                                |
| Leave            | `leaves`            | userId, from, to, reason?                                                                                                                                                                                                                                             |                                                                |
| Handover         | `handovers`         | fromShift, toShift, note, workstationId?, authorId, acknowledgedBy/At                                                                                                                                                                                                 |                                                                |
| Announcement     | `announcements`     | text, date, authorId                                                                                                                                                                                                                                                  |                                                                |
| AppNotification  | `notifications`     | userId, kind (action_assigned, andon_raised, comment_added, anomaly_reported, routine_assigned, meeting_invited, access_request), title, link?, readAt?                                                                                                               | Interne, aucun email                                           |
| AppSettings      | `settings`          | plantName, andonEscalationMinutes, routineLateToleranceMinutes                                                                                                                                                                                                        |                                                                |

**Valeurs calculées** (jamais stockées) : occurrences et leur état (à venir, à faire, en cours, en retard, terminée, non réalisée), avancement d’une routine, retard d’une action, conformité, état d’un poste, statut de présence, indicateurs du reporting.

## Correspondance avec le prototype

| Prototype (`DB`)                                           | Nouveau modèle                                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `team` + `status`                                          | `users` + `presence` + `leaves` (statut calculé)                                                       |
| `routines` (done/stamps, un seul jour)                     | `routineTemplates` (tâches) + `schedules` + `routineRuns`                                              |
| `checklist` (7 catégories)                                 | Modèle de routine « Audit terrain »                                                                    |
| `tasks`, actions de réunion, actions d’écart, tâches Gemba | `actions` avec `source`                                                                                |
| Commentaires sérialisés `§§FIELD§§`                        | `comments`                                                                                             |
| `ecarts` + `incidents`                                     | `anomalies`                                                                                            |
| `andonStations/Types/Alarms`                               | `workstations` + `andonAlerts`                                                                         |
| `sequence`                                                 | `sequenceTemplates` + `sequenceRuns`                                                                   |
| `kanban`                                                   | `materialStocks` + `stockMovements`                                                                    |
| `cqcTrend` (codé en dur), `cqcChecks`                      | `qualityChecks` (tendance calculée)                                                                    |
| `knowledge` + `links`                                      | `knowledgeItems`                                                                                       |
| `emailLog` (simulé)                                        | `notifications` (internes, réelles)                                                                    |
| `history` (fabriqué par formule)                           | supprimé : le reporting agrège les exécutions enregistrées (générées par le jeu initial, puis saisies) |
