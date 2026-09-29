# Rôles, permissions et périmètres

> GÉNÉRÉ par `npm run db:permissions` depuis `src/services/auth/permissions.ts` — ne pas modifier à la main.
> La même matrice alimente l'interface (écran « Rôles et droits ») et la base (`app.role_permissions`, migration 0005).
> En mode Supabase, c'est **la base** qui l'applique ; l'interface ne fait que masquer ce qui serait refusé.

## Périmètre des données par rôle

Une permission dit **quoi** ; le périmètre dit **sur qui**. Il est calculé par `app.scope_level()` à chaque requête.

| Rôle           | Périmètre de supervision                          |
| -------------- | ------------------------------------------------- |
| Opérateur      | Lui-même (et les routines affectées à son équipe) |
| Hancho         | Son équipe                                        |
| Qualité (LQC)  | Site                                              |
| Line Leader    | Sa ligne (équipes et personnes de la ligne)       |
| Manager        | Site                                              |
| Administrateur | Site                                              |

Règles de ressource appliquées en plus par la base (`docs/SECURITY_ARCHITECTURE.md` §5) : on n'agit qu'en son propre nom (déclarant, auteur, exécutant), une routine terminée n'est plus modifiable, personne ne change son propre rôle ni ne se désactive, les notifications et le journal d'audit ne sont écrits que par le serveur.

## Matrice

### Espaces

| Permission                                   | Opérateur | Hancho | Qualité (LQC) | Line Leader | Manager | Administrateur |
| -------------------------------------------- | :-------: | :----: | :-----------: | :---------: | :-----: | :------------: |
| Espace « Mon travail » (`space.app`)         |     ✓     |   ✓    |       ✓       |      ✓      |    ✓    |       ✓        |
| Espace « Supervision » (`space.supervision`) |           |   ✓    |       ✓       |      ✓      |    ✓    |       ✓        |
| Espace « Administration » (`space.admin`)    |           |        |               |             |    ✓    |       ✓        |

### Exécution

| Permission                                                        | Opérateur | Hancho | Qualité (LQC) | Line Leader | Manager | Administrateur |
| ----------------------------------------------------------------- | :-------: | :----: | :-----------: | :---------: | :-----: | :------------: |
| Exécuter les routines qui lui sont affectées (`routine.execute`)  |     ✓     |   ✓    |       ✓       |      ✓      |    ✓    |       ✓        |
| Exécuter une séquence guidée (`sequence.run`)                     |     ✓     |   ✓    |       ✓       |      ✓      |    ✓    |       ✓        |
| Commenter (`comment.write`)                                       |     ✓     |   ✓    |       ✓       |      ✓      |    ✓    |       ✓        |
| Signaler une anomalie (`anomaly.create`)                          |     ✓     |   ✓    |       ✓       |      ✓      |    ✓    |       ✓        |
| Déclencher un Andon (`andon.raise`)                               |     ✓     |   ✓    |       ✓       |      ✓      |    ✓    |       ✓        |
| Créer une action (`action.create`)                                |           |   ✓    |       ✓       |      ✓      |    ✓    |       ✓        |
| Mettre à jour les actions qui lui sont confiées (`action.update`) |     ✓     |   ✓    |       ✓       |      ✓      |    ✓    |       ✓        |
| Rédiger une passation (`handover.write`)                          |           |   ✓    |       ✓       |      ✓      |    ✓    |       ✓        |
| Voir les réunions auxquelles il est invité (`meeting.view`)       |     ✓     |   ✓    |       ✓       |      ✓      |    ✓    |       ✓        |
| Animer les réunions dont il est responsable (`meeting.run`)       |           |        |               |      ✓      |    ✓    |       ✓        |

### Supervision

| Permission                                                        | Opérateur | Hancho | Qualité (LQC) | Line Leader | Manager | Administrateur |
| ----------------------------------------------------------------- | :-------: | :----: | :-----------: | :---------: | :-----: | :------------: |
| Suivre les routines de toutes les personnes (`routine.supervise`) |           |        |               |      ✓      |    ✓    |       ✓        |
| Saisir les présences (`team.updateStatus`)                        |           |        |               |      ✓      |    ✓    |       ✓        |
| Gérer les congés (`leave.manage`)                                 |           |        |               |             |    ✓    |       ✓        |
| Prendre en charge et résoudre un Andon (`andon.respond`)          |           |   ✓    |       ✓       |      ✓      |    ✓    |       ✓        |
| Traiter et clôturer les anomalies (`anomaly.manage`)              |           |   ✓    |       ✓       |      ✓      |    ✓    |       ✓        |
| Gérer toutes les actions (`action.manage`)                        |           |        |       ✓       |      ✓      |    ✓    |       ✓        |
| Voir la production et le plan de l’atelier (`production.view`)    |           |   ✓    |       ✓       |      ✓      |    ✓    |       ✓        |
| Mettre à jour la production et les stocks (`production.update`)   |           |   ✓    |               |      ✓      |    ✓    |       ✓        |
| Conduire une Gemba Walk (`gemba.conduct`)                         |           |        |       ✓       |      ✓      |    ✓    |       ✓        |
| Saisir des mesures LQC (`quality.record`)                         |           |        |       ✓       |             |    ✓    |       ✓        |
| Publier l’annonce du jour (`announcement.write`)                  |           |        |               |      ✓      |    ✓    |       ✓        |
| Consulter le reporting (`reporting.view`)                         |           |        |       ✓       |      ✓      |    ✓    |       ✓        |

### Configuration

| Permission                                                        | Opérateur | Hancho | Qualité (LQC) | Line Leader | Manager | Administrateur |
| ----------------------------------------------------------------- | :-------: | :----: | :-----------: | :---------: | :-----: | :------------: |
| Créer et modifier les routines et leurs tâches (`routine.manage`) |           |        |               |             |         |       ✓        |
| Gérer les checklists (`checklist.manage`)                         |           |        |               |             |         |       ✓        |
| Gérer les séquences guidées (`sequence.manage`)                   |           |        |               |             |         |       ✓        |
| Planifier et affecter les routines (`schedule.manage`)            |           |        |               |             |    ✓    |       ✓        |
| Créer, modifier et supprimer les réunions (`meeting.manage`)      |           |        |               |             |    ✓    |       ✓        |
| Gérer les événements de l’agenda (`agenda.manage`)                |           |        |               |             |    ✓    |       ✓        |
| Gérer le centre de connaissances (`knowledge.manage`)             |           |        |               |             |         |       ✓        |
| Gérer les utilisateurs (`user.manage`)                            |           |        |               |             |         |       ✓        |
| Gérer les équipes (`team.manage`)                                 |           |        |               |             |         |       ✓        |
| Gérer les postes et QR codes (`workstation.manage`)               |           |        |               |             |         |       ✓        |
| Paramètres de l’application (`settings.manage`)                   |           |        |               |             |         |       ✓        |
