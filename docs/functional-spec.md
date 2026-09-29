# Spécification fonctionnelle — Routines de travail digitalisées

> Produit : application métier de digitalisation des routines d'un atelier de câblage automobile.
> Utilisateurs : terrain (poste fixe, tablette, smartphone) et encadrement (poste de bureau).
> Référence : `docs/legacy-audit.md`. Les hypothèses sont dans `docs/decisions.md`.
>
> **Mise à jour (séparation administration / exécution)** : les rôles, espaces, permissions et routes sont désormais décrits dans `docs/role-model.md`, `docs/permission-matrix.md` et `docs/implementation-plan.md`, qui remplacent les sections 2 à 4 ci-dessous. Les définitions d’indicateurs (§7) restent valables ; la réalisation des routines est calculée sur les occurrences planifiées.

## 1. Principes produit

1. **Une question par écran.** L'accueil répond à « qu'est-ce qui se passe maintenant et que dois-je faire ? ».
2. **Aucune donnée inventée présentée comme réelle.** Tout indicateur est calculé à partir d'enregistrements. Le caractère simulé de l'environnement est indiqué à l'administrateur et dans la documentation (D-023).
3. **L'historique est conservé.** On ne « remet pas à zéro » une journée : chaque jour crée de nouvelles exécutions.
4. **Une seule notion d'action.** Toute action (réunion, anomalie, Gemba, manuelle) vit dans le même registre, avec sa source.
5. **Les droits sont centralisés.** Un bouton qu'on n'a pas le droit d'utiliser n'est pas affiché, et la route renvoie un état « accès refusé ».
6. **Terrain d'abord.** Cibles tactiles ≥ 44 px, contraste élevé, états lisibles à distance (Andon).

## 2. Rôles

| Rôle           | Code          | Profil                                                                                                  |
| -------------- | ------------- | ------------------------------------------------------------------------------------------------------- |
| Opérateur      | `operator`    | Travaille au poste. Déclenche un Andon, signale une anomalie, consulte les standards et les séquences.  |
| Hancho         | `hancho`      | Chef d'équipe / anchor. Exécute ses routines équipement, prend en charge les Andon, traite ses actions. |
| Line Leader    | `line_leader` | Pilote la ligne. Routines LL, réunion, passation, annonce, actions, production, Gemba, présences.       |
| Qualité (LQC)  | `quality`     | Line Quality Check. Routines qualité, mesures LQC, anomalies, Gemba.                                    |
| Manager        | `manager`     | Supervise l'atelier. Tous les droits opérationnels + congés, knowledge center, reporting complet.       |
| Administrateur | `admin`       | Paramétrage : utilisateurs, postes, modèles de routines, séquences, données de démo.                    |

## 3. Permissions (matrice de référence)

Source unique : `src/services/auth/permissions.ts`.

| Permission                                               | operator | hancho | line_leader | quality | manager | admin |
| -------------------------------------------------------- | :------: | :----: | :---------: | :-----: | :-----: | :---: |
| `routine.execute` (valider ses routines)                 |          |   ✓    |      ✓      |    ✓    |    ✓    |   ✓   |
| `routine.manage` (modèles de routines)                   |          |        |             |         |    ✓    |   ✓   |
| `sequence.run`                                           |    ✓     |   ✓    |      ✓      |    ✓    |    ✓    |   ✓   |
| `sequence.manage`                                        |          |        |      ✓      |         |    ✓    |   ✓   |
| `action.create`                                          |          |   ✓    |      ✓      |    ✓    |    ✓    |   ✓   |
| `action.manage` (modifier/réassigner toutes les actions) |          |        |      ✓      |    ✓    |    ✓    |   ✓   |
| `anomaly.create`                                         |    ✓     |   ✓    |      ✓      |    ✓    |    ✓    |   ✓   |
| `anomaly.manage` (qualifier, clôturer)                   |          |   ✓    |      ✓      |    ✓    |    ✓    |   ✓   |
| `andon.raise`                                            |    ✓     |   ✓    |      ✓      |    ✓    |    ✓    |   ✓   |
| `andon.respond` (acquitter, résoudre)                    |          |   ✓    |      ✓      |    ✓    |    ✓    |   ✓   |
| `production.update` (OF, stocks)                         |          |   ✓    |      ✓      |         |    ✓    |   ✓   |
| `gemba.conduct`                                          |          |        |      ✓      |    ✓    |    ✓    |   ✓   |
| `quality.record` (mesures LQC)                           |          |        |             |    ✓    |    ✓    |   ✓   |
| `meeting.manage`                                         |          |        |      ✓      |         |    ✓    |   ✓   |
| `handover.write`                                         |          |   ✓    |      ✓      |    ✓    |    ✓    |   ✓   |
| `announcement.write`                                     |          |        |      ✓      |         |    ✓    |   ✓   |
| `team.updateStatus` (présences)                          |          |        |      ✓      |         |    ✓    |   ✓   |
| `leave.manage`                                           |          |        |             |         |    ✓    |   ✓   |
| `knowledge.manage`                                       |          |        |             |    ✓    |    ✓    |   ✓   |
| `reporting.view`                                         |          |        |      ✓      |    ✓    |    ✓    |   ✓   |
| `admin.access`                                           |          |        |             |         |         |   ✓   |

Tout le monde peut consulter : accueil, standards, plan atelier, production, Andon, anomalies.

## 4. Navigation

```
MA JOURNÉE        Accueil · Mes routines · Actions · Agenda & réunions · Passation · Équipe
OPÉRATIONS        Andon · Production · Plan atelier · Séquences guidées
QUALITÉ           Anomalies · Gemba Walk · Contrôles LQC
ANALYSE           Reporting · Tableaux BI
RESSOURCES        Centre de connaissances
ADMINISTRATION    Utilisateurs · Postes & QR · Paramètres
```

Seules les entrées autorisées pour le rôle sont affichées. Des compteurs signalent ce qui attend une action (routines à faire, Andon actifs, actions en retard, anomalies ouvertes).

## 5. Modules

### 5.1 Accueil (cockpit)

- **Bandeau d'état atelier** : état de chaque ligne (Andon actif = arrêt), nombre d'Andon, anomalies critiques ouvertes.
- **À traiter maintenant** : liste priorisée, calculée — Andon actifs > actions en retard > routines dont l'heure est passée > réunion non tenue > stocks sous le minimum > passation manquante après 12 h. Chaque ligne mène à l'écran concerné.
- **Indicateurs du jour** (définis au §7) : avancement des routines, actions ouvertes/en retard, anomalies ouvertes, conformité LQC du jour.
- **Aujourd'hui** : routines de l'utilisateur, agenda du jour, annonce.
- **Rapport du jour** : texte généré depuis les données, copiable.
- Actions rapides : Signaler une anomalie, Déclencher un Andon, Créer une action.

### 5.2 Routines

- **Modèle de routine** : titre, rôle cible, heure prévue, sections, points de contrôle (libellé, standard associé optionnel).
- **Exécution** : une par modèle, par jour et par exécutant. Chaque point : Conforme / Non conforme / N.A. + commentaire + horodatage + auteur.
- Un point « Non conforme » propose de créer une anomalie pré-remplie (lien conservé).
- Progression, statut (à faire, en cours, terminée, en retard si l'heure prévue + 2 h est dépassée).
- Historique consultable par date.
- Gestion des modèles (création, modification, archivage) : permission `routine.manage`.
- La « checklist digitale » du prototype devient le modèle « Audit terrain LL » (7 sections).

### 5.3 Actions

- Champs : titre, description, responsable, suppléant, priorité (basse, moyenne, haute, critique), échéance, statut (à faire, en cours, terminée, annulée), source (manuelle, réunion, anomalie, Gemba, routine) avec lien vers la source.
- « En retard » est **calculé** (non terminée et échéance passée), jamais stocké.
- Vues : Mes actions (défaut), Toutes, En retard, Terminées. Recherche, tri, filtres.
- Commentaires horodatés (auteur, date), ajout et modification par l'auteur.
- Création d'une notification interne pour le responsable.

### 5.4 Séquences guidées

- **Modèle** : nom, étapes ordonnées (titre, consigne, durée cible en minutes, heure indicative, standard associé).
- **Exécution** : démarrer, pause, reprendre, étape suivante (valide l'étape), précédente, terminer, abandonner. Le temps réel de chaque étape est enregistré.
- Le minuteur est calculé à partir des horodatages : il résiste au rechargement de la page et à la mise en veille.
- Dépassement de la durée cible : affichage « +mm:ss » en orange, sans bloquer.
- Vue d'exécution épurée, grands caractères.

### 5.5 Andon

- Types : Qualité, Équipement, Matière, Sécurité. Urgence : normale / critique (Sécurité = critique par défaut).
- Cycle : **Actif** → **Pris en charge** (qui, quand) → **Résolu** (cause, action réalisée, qui, quand).
- Tableau de bord lisible à distance : une tuile par poste, couleur = état, durée écoulée en grand.
- Seuil d'escalade : 10 min sans prise en charge → tuile « escaladée » (paramètre).
- Historique filtrable + indicateurs (nombre, temps de prise en charge, temps de résolution, pareto par type et par poste).
- Lien « créer une anomalie » depuis un Andon résolu.

### 5.6 Production

- **Ordres de fabrication (OF)** : référence, référence faisceau, ligne, quantité prévue / produite, étape (Coupe, Sertissage, Assemblage, Rubanage, Test électrique, Contrôle, Expédition), statut (planifié, en cours, bloqué + motif, terminé), responsable, échéance.
- Tableau par étape (colonnes) avec déplacement par boutons (accessible clavier et tactile ; pas de glisser-déposer, voir décisions).
- **Stocks matières (kanban)** : matière, poste, stock, seuil mini, cible ; état Sain / À surveiller / Réappro / Rupture ; saisie d'une consommation ou d'un réapprovisionnement (mouvement tracé).

### 5.7 Plan atelier (jumeau numérique)

- Plan des lignes et postes (positions paramétrées).
- État de chaque poste **calculé** à partir de données saisies : Andon actif, stock sous le minimum, OF bloqué.
- Chaque indicateur affiche sa source : « Calculé — Andon », « Saisie manuelle », « Donnée machine : non connectée ».
- Panneau de détail : Andon, stocks, OF, routines rattachées, anomalies ouvertes du poste.

### 5.8 Anomalies

- Déclaration : description, catégorie (Sécurité, Qualité, 5S, Standard, Performance, Équipement, Matière, Autre), poste, gravité (mineure, majeure, critique), photo (optionnelle), déclarant, date.
- Statuts : ouverte → en traitement → clôturée.
- Actions correctives liées (0..n) créées depuis l'anomalie.
- Entrée terrain par QR : `/#/signaler?poste=P4` ouvre le formulaire avec le poste pré-rempli.

### 5.9 Gemba Walk

- Marche : date, zone, conducteur, participants, checklist (8 points par défaut, OK / KO / N.A., commentaire obligatoire si KO), observations (constat, amélioration proposée, gravité, photo), statut (brouillon, validée, clôturée).
- Parcours en 3 étapes : saisie → résumé → validation.
- À la validation : création proposée d'une action par observation majeure/critique ou point KO. Échéance par défaut selon la gravité (critique 1 j, majeure 3 j, mineure 7 j).
- Clôture possible quand toutes les actions liées sont terminées.

### 5.10 Contrôles LQC

- Saisie d'une mesure : caractéristique, poste, valeur, bornes min/max, unité, commentaire.
- Conformité calculée ; une mesure hors bornes propose de créer une anomalie Qualité.
- Conformité du jour = mesures conformes / mesures du jour. Tendance = agrégat réel par jour.

### 5.11 Centre de connaissances

- Documents : code, titre, catégorie, résumé, points clés, version, date de mise à jour, propriétaire, statut (brouillon, publié), type (standard interne ou lien externe https).
- Recherche plein texte, filtre par catégorie, favoris par utilisateur.
- Ouverture contextuelle depuis un point de routine ou une étape de séquence.
- Les 12 fiches du prototype sont chargées **comme exemples** et marquées « Exemple à remplacer ».

### 5.12 Agenda & réunions

- Agenda du jour : routines planifiées, réunions, séquences, triés par heure.
- Réunion : type, date, heure, participants (présents), ordre du jour (points cochables), compte-rendu, actions décidées (créées dans le registre des actions avec la source « réunion »), statut (planifiée, en cours, terminée).
- Historique des réunions.

### 5.13 Passation de poste

- Note : équipe émettrice, équipe réceptrice, texte, points d'attention (poste optionnel), auteur, date.
- Accusé de lecture par l'équipe suivante.

### 5.14 Équipe

- Membres, rôle, zone, statut du jour (présent, absent, en congé).
- Le statut « en congé » est **calculé** depuis les congés ; il n'écrase jamais le statut saisi.
- Congés : création et suppression (`leave.manage`).

### 5.15 Reporting et analyse par période

- Sélecteur : 7 jours, 30 jours, mois en cours, période personnalisée ; comparaison avec la période précédente de même durée.
- Indicateurs : réalisation des routines, anomalies (par jour, catégorie, poste), actions (créées, terminées, en retard, délai moyen), Andon (nombre, temps de prise en charge et de résolution), conformité LQC.
- Graphiques sobres : barres, courbes, tableaux. Chaque graphique a une alternative tabulaire.
- L'architecture d'agrégation accepte d'autres dimensions (ligne, équipe).

### 5.16 Tableaux BI

- Composant d'intégration générique. Sans configuration : état « Non connecté » avec la procédure de configuration. Avec configuration (`VITE_BI_EMBED_URL`, origine autorisée) : iframe isolée.

### 5.17 Administration

- Utilisateurs : liste, rôle, zone, actif/inactif.
- Rôles : matrice des permissions en lecture.
- Postes & QR : lignes, postes, positions sur le plan, génération et impression des QR.
- Paramètres : mode de données, seuil d'escalade Andon, réinitialisation des données de démonstration (DÉMO uniquement).

### 5.18 Transverses

- **Notifications internes** : nouvelle action assignée, Andon déclenché, commentaire reçu. Pas d'email (connecteur non configuré, affiché comme tel).
- **Aide** : panneau d'aide contextuel par écran.
- **États** : chargement, vide, erreur, accès refusé, hors ligne pour chaque écran.

## 6. Parcours critiques (à tester)

1. Se connecter (DÉMO) avec un profil → arriver sur l'accueil avec la bonne navigation.
2. Valider une routine point par point ; un point non conforme crée une anomalie liée.
3. Déclencher un Andon → prise en charge → résolution avec cause.
4. Déclarer une anomalie depuis un QR → créer une action corrective → la terminer.
5. Conduire une Gemba Walk → résumé → validation → actions créées.
6. Tenir la réunion du jour → cocher l'ordre du jour → créer une action.
7. Exécuter une séquence guidée avec pause/reprise.
8. Changer de période dans le reporting et comparer.
9. Un opérateur n'a pas accès au reporting ni à l'administration.

## 7. Définition des indicateurs

| Indicateur                      | Définition                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| Réalisation des routines (jour) | Points traités (OK, KO ou N.A.) / points prévus des routines planifiées ce jour    |
| Routines à l'heure              | Routines terminées avant heure prévue + 2 h / routines planifiées                  |
| Actions en retard               | Actions non terminées et non annulées dont l'échéance est passée                   |
| Délai de clôture moyen          | Moyenne (date de clôture − date de création) des actions terminées dans la période |
| Anomalies ouvertes              | Anomalies au statut ouverte ou en traitement                                       |
| Temps de prise en charge Andon  | Prise en charge − déclenchement                                                    |
| Temps de résolution Andon       | Résolution − déclenchement                                                         |
| Conformité LQC                  | Mesures dans les bornes / mesures de la période                                    |
