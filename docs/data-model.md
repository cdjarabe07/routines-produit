# Modèle de données

Source : `src/types/domain.ts`. Toutes les entités ont `id`, `createdAt`, `updatedAt` (ISO 8601). Les dates calendaires (`DateKey`, `AAAA-MM-JJ`) sont en **heure locale de l’atelier**.

**Règle : les valeurs dérivées ne sont jamais stockées** (retard d’une action, état d’une routine, conformité, état d’un poste, statut « en congé »). Elles sont calculées dans `features/<module>/model.ts`.

## Vue d’ensemble

```text
Line 1──* Workstation 1──* MaterialStock 1──* StockMovement
  │            │  ├──* AndonAlert
  │            │  ├──* Anomaly ──* Action (source anomaly)
  │            │  └──* QualityCheck ──0..1 Anomaly
  └──* ProductionOrder

User ──* PresenceRecord        User ──* Leave
User ──* Action (assignee / backup / createdBy)
User ──* Favorite *── KnowledgeItem ──* RoutineItem / SequenceStep (knowledgeId)

RoutineTemplate 1──* RoutineRun (une par jour) ── results[itemId] ──0..1 Anomaly
SequenceTemplate 1──* SequenceRun
GembaWalk ── observations[] ──0..1 Action (source gemba)
Meeting ──* Action (source meeting)
Comment ── (targetType, targetId) → Action | Anomaly | GembaWalk | AndonAlert
AppNotification ── User
AppSettings (enregistrement unique « app »)
```

## Entités

| Entité           | Collection          | Champs clés                                                                                                                                       | Remarques                                                      |
| ---------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| User             | `users`             | name, email, role, lineId?, zoneLabel?, shift?, active                                                                                            | Rôles : operator, hancho, line_leader, quality, manager, admin |
| Line             | `lines`             | code, name                                                                                                                                        |                                                                |
| Workstation      | `workstations`      | code (unique, utilisé par les QR), name, process, lineId, mapX, mapY, active                                                                      | Position sur le plan en %                                      |
| PresenceRecord   | `presence`          | userId, date, status (present/absent), recordedBy                                                                                                 | Une par personne et par jour                                   |
| Leave            | `leaves`            | userId, from, to, reason?                                                                                                                         | Pilote le statut calculé « en congé »                          |
| RoutineTemplate  | `routineTemplates`  | title, role, scheduledTime, sections[items[label, knowledgeId?]], active                                                                          |                                                                |
| RoutineRun       | `routineRuns`       | templateId, date, assigneeId, results{itemId → status ok/ko/na, comment, at, by, anomalyId}, completedAt?                                         | Historique conservé                                            |
| Action           | `actions`           | title, assigneeId, backupId?, priority, status (todo/in_progress/done/cancelled), dueDate, source{type,id}, createdBy, closedAt?                  | Registre unique                                                |
| Comment          | `comments`          | targetType, targetId, authorId, text, editedAt?                                                                                                   |                                                                |
| Anomaly          | `anomalies`         | description, category, severity, workstationId?, status, reportedBy, photo?, origin{type,id}, closedAt?, resolutionNote?                          | Écarts + incidents du prototype                                |
| AndonAlert       | `andonAlerts`       | workstationId, type, urgency, detail, status (active/acknowledged/resolved), raisedAt/By, acknowledgedAt/By, resolvedAt/By, rootCause, resolution |                                                                |
| SequenceTemplate | `sequenceTemplates` | name, steps[title, instruction?, durationMin, plannedTime?, knowledgeId?], active                                                                 |                                                                |
| SequenceRun      | `sequenceRuns`      | templateId, status, currentStepIndex, segmentStartedAt, steps[elapsedMs, completedAt]                                                             | Minuteur par horodatage                                        |
| ProductionOrder  | `productionOrders`  | reference, harnessRef, lineId, quantityPlanned/Done, stage, status, blockedReason?, ownerId?, dueDate                                             |                                                                |
| MaterialStock    | `materialStocks`    | material, workstationId, quantity, min, target, unit                                                                                              |                                                                |
| StockMovement    | `stockMovements`    | stockId, delta, reason, by                                                                                                                        | Traçabilité des mouvements                                     |
| GembaWalk        | `gembaWalks`        | date, zone, leaderId, participantIds, checklist[], observations[], status (draft/validated/closed)                                                |                                                                |
| QualityCheck     | `qualityChecks`     | characteristic, workstationId, value, min, max, unit, measuredBy, anomalyId?                                                                      |                                                                |
| KnowledgeItem    | `knowledgeItems`    | code, title, category, kind (standard/link), summary, keyPoints, url?, version, owner, status, isExample                                          |                                                                |
| Favorite         | `favorites`         | userId, knowledgeId                                                                                                                               |                                                                |
| Meeting          | `meetings`          | title, date, startTime, durationMin, organizerId, participantIds, agenda[], minutes, status                                                       |                                                                |
| Handover         | `handovers`         | fromShift, toShift, note, workstationId?, authorId, acknowledgedBy/At                                                                             |                                                                |
| Announcement     | `announcements`     | text, date, authorId                                                                                                                              |                                                                |
| AppNotification  | `notifications`     | userId, kind, title, link?, readAt?                                                                                                               | Interne, pas d’email                                           |
| AppSettings      | `settings`          | plantName, andonEscalationMinutes, routineLateToleranceMinutes                                                                                    |                                                                |

## Correspondance avec le prototype

| Prototype (`DB`)                                           | Nouveau modèle                                           |
| ---------------------------------------------------------- | -------------------------------------------------------- |
| `team` + `status`                                          | `users` + `presence` + `leaves` (statut calculé)         |
| `routines` (done/stamps, un seul jour)                     | `routineTemplates` + `routineRuns` (historique)          |
| `checklist` (7 catégories)                                 | Modèle de routine « Audit terrain »                      |
| `tasks`, actions de réunion, actions d’écart, tâches Gemba | `actions` avec `source`                                  |
| Commentaires sérialisés `§§FIELD§§`                        | `comments`                                               |
| `ecarts` + `incidents`                                     | `anomalies`                                              |
| `andonStations/Types/Alarms`                               | `workstations` + `andonAlerts`                           |
| `sequence`                                                 | `sequenceTemplates` + `sequenceRuns`                     |
| `kanban`                                                   | `materialStocks` + `stockMovements`                      |
| `cqcTrend` (codé en dur), `cqcChecks`                      | `qualityChecks` (tendance calculée)                      |
| `knowledge` + `links`                                      | `knowledgeItems`                                         |
| `emailLog` (simulé)                                        | `notifications` (internes, réelles)                      |
| `history` (fabriqué)                                       | supprimé : le reporting agrège les vrais enregistrements |
