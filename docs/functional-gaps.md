# Écarts fonctionnels

Écarts entre l'application actuelle (`current-state.md`) et la cible « administration → planification → exécution → supervision → reporting ».

Priorités :

| Priorité | Signification                      |
| -------- | ---------------------------------- |
| **P1**   | Bloque la chaîne métier            |
| **P2**   | Nécessaire à un prototype crédible |
| **P3**   | Amélioration                       |

## 1. Authentification et rôles

| #    | Écart                                                                                                                                                              | Priorité |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| G-01 | Pas d'écran de connexion identifiant + mot de passe ; connexion par choix de profil                                                                                | P1       |
| G-02 | Mécanisme DÉMO visible (bandeaux, badges, textes)                                                                                                                  | P1       |
| G-03 | Pas de « Mot de passe oublié »                                                                                                                                     | P2       |
| G-04 | Pas de redirection selon le profil ; tout le monde arrive sur le même cockpit                                                                                      | P1       |
| G-05 | Pas d'espaces distincts (Mon travail / Supervision / Administration) ; un seul menu                                                                                | P1       |
| G-06 | Permissions trop grossières : `admin.access` couvre toute l'administration ; `meeting.manage` confond planifier et animer ; pas de règle par ressource centralisée | P1       |
| G-07 | L'opérateur ne peut exécuter aucune routine                                                                                                                        | P1       |
| G-08 | Pas de « dernière activité » par utilisateur                                                                                                                       | P3       |

## 2. Administration et configuration

| #    | Écart                                                                                                                                                                                                 | Priorité |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| G-10 | Pas de tableau de bord administrateur                                                                                                                                                                 | P2       |
| G-11 | Utilisateurs : pas de filtres (rôle, équipe, statut), pas d'équipe (entité), pas de poste habituel                                                                                                    | P2       |
| G-12 | Pas d'entité **Équipe** ni d'écran de gestion des équipes                                                                                                                                             | P1       |
| G-13 | Routine = sections de points OK/KO. Il manque les **tâches** (ordre, durée estimée, priorité, obligatoire / facultative, instructions, responsable), la **durée prévue**, la **zone** et le **poste** | P1       |
| G-14 | Pas de **checklists** réutilisables ni de types de contrôle (oui/non, valeur numérique avec bornes, texte, sélection, commentaire)                                                                    | P1       |
| G-15 | Séquences : pas de réordonnancement des étapes, pas de critère de validation, pas d'activation / désactivation d'étape ; gestion mêlée à l'exécution                                                  | P2       |
| G-16 | Centre de connaissances : gestion mêlée à la consultation ; pas d'archivage                                                                                                                           | P2       |

## 3. Planification

| #    | Écart                                                                                                                                                                                                                                                                                                                             | Priorité |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| G-20 | **Aucune planification** : une routine est due chaque jour pour tout un rôle. Il manque la date, l'heure, la répétition (unique, quotidienne, jours ouvrés, hebdomadaire), la date de fin, l'affectation à une personne ou à une équipe, la zone et le poste, la modification et l'annulation (globale ou d'une seule occurrence) | P1       |
| G-21 | Pas de vue de la planification (liste et semaine)                                                                                                                                                                                                                                                                                 | P1       |
| G-22 | Pas de notification à la personne affectée                                                                                                                                                                                                                                                                                        | P2       |

## 4. Réunions et agenda

| #    | Écart                                                                                                                                                                                      | Priorité |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| G-30 | Réunion : il manque le lieu, l'heure de fin, le responsable distinct du créateur, les **participants invités** (le champ actuel sert aux présences), la description, le statut « annulée » | P1       |
| G-31 | Pas de CRUD complet : modification, suppression, duplication, répétition                                                                                                                   | P1       |
| G-32 | Pas d'événements d'agenda autres que les réunions : briefing, daily, formation, audit, maintenance, événement opérationnel                                                                 | P2       |
| G-33 | L'utilisateur ne voit pas « ses » réunions : aucune notion d'invitation                                                                                                                    | P1       |

## 5. Espace utilisateur

| #    | Écart                                                                                                                                                                | Priorité |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| G-40 | Pas de tableau de bord orienté action (activité en cours, prochaine activité, tâches, alertes, réunions, historique)                                                 | P1       |
| G-41 | Pas de page **Mon planning** : routines, réunions, formations, actions à échéance ; aujourd'hui, semaine, période                                                    | P1       |
| G-42 | Pas de **Mes routines** par état (à venir, en cours, terminées, en retard)                                                                                           | P1       |
| G-43 | Exécution : pas de bouton **Démarrer**, pas de chronomètre, pas de fin explicite, pas de récapitulatif (durée réelle, tâches complétées), pas de tâches facultatives | P1       |
| G-44 | Pas de commentaire sur une routine, une tâche ou une réunion                                                                                                         | P2       |
| G-45 | Après un Andon, pas de rappel « Andon actif · poste · depuis » dans l'espace de l'utilisateur                                                                        | P2       |

## 6. Andon et actions

| #    | Écart                                                                                                      | Priorité |
| ---- | ---------------------------------------------------------------------------------------------------------- | -------- |
| G-50 | Pas d'état « En résolution » entre la prise en charge et la résolution                                     | P2       |
| G-51 | Urgence à 2 niveaux ; la demande en prévoit 3 (faible, moyenne, critique)                                  | P3       |
| G-52 | Pas de fiche détaillée d'un Andon (description, déclarant, zone, chronologie, commentaires, actions liées) | P2       |
| G-53 | Pas de création d'une **action corrective** depuis un Andon                                                | P1       |
| G-54 | Actions : pas de statut « Bloquée », pas de note de résolution à la clôture                                | P2       |

## 7. Supervision et reporting

| #    | Écart                                                                                                                                                                                 | Priorité |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| G-60 | Pas de tableau de bord manager distinct : équipe, production, routines par personne, anomalies, Andon, actions, KPI                                                                   | P1       |
| G-61 | Pas de suivi des routines **par personne et par équipe**                                                                                                                              | P1       |
| G-62 | Reporting des routines calculé sur « modèle × jour » et non sur les **occurrences planifiées**. Il faut pouvoir afficher : programmées, terminées, en cours, en retard, non réalisées | P1       |
| G-63 | Durée réelle d'exécution non mesurée                                                                                                                                                  | P2       |

## 8. Hors écart (conservé tel quel)

Digital Twin (plan atelier), production et kanban, Gemba, LQC, passation, présences et congés, annonce, notifications, aide contextuelle, analyse par période, BI (non connecté).

Ces modules sont **rattachés au nouveau modèle de rôles** : ils sont placés dans l'espace approprié et protégés par permission.

## 9. Chatbot

Aucun chatbot à conserver : il n'existe pas (voir `current-state.md` §8). Aucune fonctionnalité conversationnelle n'est ajoutée.
