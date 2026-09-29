# Matrice des permissions

Source unique : `src/services/auth/permissions.ts` (rôle → permissions) et `src/services/auth/policies.ts` (règles par ressource).

- Les composants appellent `can(permission)` ou `can(permission, ressource)`.
- Les routes sont protégées par `RequirePermission`.
- Un espace entier est protégé par sa permission `space.*`.
- L'écran **Administration → Rôles et droits** affiche cette matrice à partir du code : elle ne peut pas diverger de la réalité.

Légende :

| Symbole | Signification                                  |
| ------- | ---------------------------------------------- |
| ✓       | Autorisé                                       |
| ◐       | Autorisé sous condition de ressource (voir §2) |
| —       | Refusé                                         |

## 1. Par rôle

| Fonction                                                     | Permission           | Admin |   Manager   | Line Leader | Hancho | LQC | Opérateur |
| ------------------------------------------------------------ | -------------------- | :---: | :---------: | :---------: | :----: | :-: | :-------: |
| **Espaces**                                                  |                      |       |             |             |        |     |           |
| Espace « Mon travail »                                       | `space.app`          |   ✓   |      ✓      |      ✓      |   ✓    |  ✓  |     ✓     |
| Espace « Supervision »                                       | `space.supervision`  |   ✓   |      ✓      |      ✓      |   ✓    |  ✓  |     —     |
| Espace « Administration »                                    | `space.admin`        |   ✓   | ✓ (partiel) |      —      |   —    |  —  |     —     |
| **Exécution**                                                |                      |       |             |             |        |     |           |
| Voir son planning, ses routines, ses réunions                | `space.app`          |   ✓   |      ✓      |      ✓      |   ✓    |  ✓  |     ✓     |
| Exécuter une routine                                         | `routine.execute`    |   ◐   |      ◐      |      ◐      |   ◐    |  ◐  |     ◐     |
| Exécuter une séquence guidée                                 | `sequence.run`       |   ✓   |      ✓      |      ✓      |   ✓    |  ✓  |     ✓     |
| Commenter (tâche, routine, action, anomalie, Andon, réunion) | `comment.write`      |   ✓   |      ✓      |      ✓      |   ✓    |  ✓  |     ✓     |
| Signaler une anomalie                                        | `anomaly.create`     |   ✓   |      ✓      |      ✓      |   ✓    |  ✓  |     ✓     |
| Déclencher un Andon                                          | `andon.raise`        |   ✓   |      ✓      |      ✓      |   ✓    |  ✓  |     ✓     |
| Mettre à jour une action qui m'est confiée                   | `action.update`      |   ◐   |      ◐      |      ◐      |   ◐    |  ◐  |     ◐     |
| Créer une action                                             | `action.create`      |   ✓   |      ✓      |      ✓      |   ✓    |  ✓  |     —     |
| Rédiger une passation                                        | `handover.write`     |   ✓   |      ✓      |      ✓      |   ✓    |  ✓  |     —     |
| Animer une réunion (présences, compte-rendu)                 | `meeting.run`        |   ✓   |      ✓      |      ◐      |   ◐    |  ◐  |     ◐     |
| **Supervision**                                              |                      |       |             |             |        |     |           |
| Suivre les routines de toutes les personnes                  | `routine.supervise`  |   ✓   |      ✓      |      ✓      |   —    |  —  |     —     |
| Voir l'équipe, saisir les présences                          | `team.updateStatus`  |   ✓   |      ✓      |      ✓      |   —    |  —  |     —     |
| Gérer les congés                                             | `leave.manage`       |   ✓   |      ✓      |      —      |   —    |  —  |     —     |
| Prendre en charge et résoudre un Andon                       | `andon.respond`      |   ✓   |      ✓      |      ✓      |   ✓    |  ✓  |     —     |
| Traiter et clôturer les anomalies                            | `anomaly.manage`     |   ✓   |      ✓      |      ✓      |   ✓    |  ✓  |     —     |
| Gérer toutes les actions (réaffecter, bloquer, clôturer)     | `action.manage`      |   ✓   |      ✓      |      ✓      |   —    |  ✓  |     —     |
| Mettre à jour la production et les stocks                    | `production.update`  |   ✓   |      ✓      |      ✓      |   ✓    |  —  |     —     |
| Voir la production et le plan de l'atelier                   | `production.view`    |   ✓   |      ✓      |      ✓      |   ✓    |  ✓  |     —     |
| Conduire une Gemba Walk                                      | `gemba.conduct`      |   ✓   |      ✓      |      ✓      |   —    |  ✓  |     —     |
| Saisir des mesures LQC                                       | `quality.record`     |   ✓   |      ✓      |      —      |   —    |  ✓  |     —     |
| Publier l'annonce du jour                                    | `announcement.write` |   ✓   |      ✓      |      ✓      |   —    |  —  |     —     |
| Reporting et tableaux BI                                     | `reporting.view`     |   ✓   |      ✓      |      ✓      |   —    |  ✓  |     —     |
| **Configuration**                                            |                      |       |             |             |        |     |           |
| Créer, modifier, archiver une routine et ses tâches          | `routine.manage`     |   ✓   |      —      |      —      |   —    |  —  |     —     |
| Gérer les checklists                                         | `checklist.manage`   |   ✓   |      —      |      —      |   —    |  —  |     —     |
| Gérer les séquences guidées                                  | `sequence.manage`    |   ✓   |      —      |      —      |   —    |  —  |     —     |
| Planifier et affecter les routines                           | `schedule.manage`    |   ✓   |      ✓      |      —      |   —    |  —  |     —     |
| Créer, modifier, dupliquer, supprimer une réunion            | `meeting.manage`     |   ✓   |      ✓      |      —      |   —    |  —  |     —     |
| Gérer les événements de l'agenda                             | `agenda.manage`      |   ✓   |      ✓      |      —      |   —    |  —  |     —     |
| Gérer le centre de connaissances                             | `knowledge.manage`   |   ✓   |      —      |      —      |   —    |  —  |     —     |
| Gérer les utilisateurs                                       | `user.manage`        |   ✓   |      —      |      —      |   —    |  —  |     —     |
| Gérer les équipes                                            | `team.manage`        |   ✓   |      —      |      —      |   —    |  —  |     —     |
| Gérer les postes et QR codes                                 | `workstation.manage` |   ✓   |      —      |      —      |   —    |  —  |     —     |
| Paramètres, rôles et droits                                  | `settings.manage`    |   ✓   |      —      |      —      |   —    |  —  |     —     |

Remarques :

- La gestion du centre de connaissances est **réservée à l'administrateur** (§29 de la demande). Auparavant, le LQC et le manager pouvaient aussi publier. Un propriétaire de standard qui n'est pas administrateur transmet ses modifications à l'administrateur.
- Le **manager** voit dans l'espace Administration uniquement Planification, Réunions et Agenda.

## 2. Règles par ressource (◐)

| Permission        | Ressource            | Condition                                                                                                                                       |
| ----------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `routine.execute` | Planification + date | La routine est affectée à l'utilisateur (directement ou via son équipe) **et** la date est aujourd'hui. Les jours passés sont en lecture seule. |
| `action.update`   | Action               | Responsable, suppléant ou créateur de l'action, ou `action.manage`                                                                              |
| `meeting.run`     | Réunion              | Organisateur (responsable) de la réunion, ou `meeting.manage`                                                                                   |
| `meeting.view`    | Réunion              | Participant (directement ou via son équipe), organisateur, `meeting.manage` ou `space.supervision`                                              |
| `comment.edit`    | Commentaire          | Auteur du commentaire                                                                                                                           |

## 3. Correspondance avec la matrice demandée

| Fonction (demande §44)           |         Admin          |                  Manager                  |      Utilisateur      |
| -------------------------------- | :--------------------: | :---------------------------------------: | :-------------------: |
| Voir dashboard                   | ✓ (`/admin/dashboard`) |              ✓ (`/manager`)               |      ✓ (`/app`)       |
| Créer routine                    |           ✓            | — (réservé à l'administration du contenu) |           —           |
| Modifier routine                 |           ✓            |                     —                     |           —           |
| Planifier / affecter une routine |           ✓            |                     ✓                     |           —           |
| Exécuter routine                 |     ✓ si affectée      |               ✓ si affectée               |     ✓ si affectée     |
| Créer réunion                    |           ✓            |                     ✓                     |           —           |
| Voir réunion                     |           ✓            |                     ✓                     |   ✓ si participant    |
| Créer Andon                      |           ✓            |                     ✓                     |           ✓           |
| Résoudre Andon                   |           ✓            |                     ✓                     | — (Hancho et LQC : ✓) |
| Gérer utilisateurs               |           ✓            |                     —                     |           —           |
| Reporting global                 |           ✓            |                     ✓                     |      — (LQC : ✓)      |

## 4. Protection

- **Interface** : les menus, boutons et formulaires sont masqués ou désactivés selon `can()`.
- **Routes** : chaque route vérifie sa permission. Un accès direct par URL affiche « Accès non autorisé », jamais la page.
- **Serveur (mode API)** : un refus HTTP 403 est traduit en `PermissionError`. Le backend **doit** appliquer la même matrice : les contrôles côté client ne sont pas une sécurité.
