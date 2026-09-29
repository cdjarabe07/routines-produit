# Audit du prototype `LL-App-LL.html`

> Statut du document : référence pour le rebuild.
> Source analysée : `legacy/LL-App-LL.html` (3 922 lignes, version avec les améliorations d'ergonomie de septembre 2026).
> Version d'origine conservée : `legacy/LL-App-LL.original.html` (3 666 lignes).

## 1. Vue d'ensemble

Le prototype est **un fichier HTML unique** qui contient tout :

| Bloc       | Lignes (approx.) | Contenu                                                                                                                               |
| ---------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| CSS        | ~620             | ~350 règles, variables CSS partielles (`--blue`, `--green`…), styles par module mélangés                                              |
| HTML       | ~620             | 16 panneaux (`section.tab-panel`), 1 modale, 1 conteneur de toasts, écran de chargement, écran de connexion, 8 QR codes en SVG base64 |
| JavaScript | ~2 700           | ~100 fonctions globales, un objet `DB` global, un objet `state` global, rendu par `innerHTML` + template strings                      |

Il n'y a **aucune dépendance externe**, aucun build, aucun test. L'application se lance en ouvrant le fichier.

Le texte d'en-tête du script le résume : _« Prototype sanitisé — données de démonstration uniquement. Réplique les logiques Power Fx du projet d'entreprise »_. Le prototype imite donc une application **Power Apps + Power Automate + SharePoint/Dataverse** existante ou envisagée (patch + horodatage, flow « 00:01 », flow d'envoi d'email, commentaires sérialisés `§§FIELD§§`).

## 2. Écrans (16 panneaux + 2 écrans techniques)

| #   | Écran              | id                | Rôle métier                                      | Ce qui fonctionne réellement                                                                                                                                    |
| --- | ------------------ | ----------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —   | Chargement         | `screen-loading`  | Splash 0,5 s                                     | Purement décoratif                                                                                                                                              |
| —   | Connexion          | `screen-login`    | Email + code à 6 chiffres                        | Le code est **généré et affiché à l'écran** (mode démo). Session 12 h en localStorage. Aucune sécurité réelle.                                                  |
| 1   | Accueil            | `panel-dashboard` | Cockpit du Line Leader                           | « À faire maintenant », actions rapides, KPI, routines, actions à échéance, annonce, incidents, rapport du jour, séquence guidée, KPI Lean, analyse par période |
| 2   | Routines           | `panel-routines`  | Checklists horodatées par rôle (LL, Hancho, LQC) | Clic = validation horodatée ; lien vers le standard                                                                                                             |
| 3   | Réunion            | `panel-reunion`   | Brief quotidien                                  | Présences, ordre du jour cochable, compte-rendu auto-sauvegardé, actions décidées (créent aussi une tâche), historique                                          |
| 4   | Passation          | `panel-passation` | Transmission entre équipes                       | Note + équipe émettrice/réceptrice ; liste                                                                                                                      |
| 5   | Écarts             | `panel-ecarts`    | Écarts au standard + actions correctives         | Checklist digitale 7 × 4 points (✅/❌), formulaire d'écart avec photo, suivi du statut, répartition par zone, faux journal d'emails                            |
| 6   | Andon              | `panel-andon`     | Arrêt de poste (jidoka)                          | Grille poste × type, déclenchement/résolution, durée, pareto                                                                                                    |
| 7   | Gemba Walk         | `panel-gemba`     | Observation terrain                              | Formulaire + checklist 8 points (OK/KO/NA, commentaire obligatoire si KO), criticité, résumé avant validation, création automatique d'une action                |
| 8   | QR Postes          | `panel-qr`        | Étiquettes par poste                             | 8 QR **statiques** (SVG base64) qui ouvrent `#poste=Px` → formulaire d'écart pré-rempli                                                                         |
| 9   | Tâches & Incidents | `panel-tasks`     | Suivi des actions et incidents                   | Création de tâche (assigné, backup, priorité), commentaires, incidents (catégorie, clôture)                                                                     |
| 10  | CQC / LQC          | `panel-cqc`       | Indicateurs qualité                              | Tendance 7 j **codée en dur**, 3 mesures avec bornes min/max                                                                                                    |
| 11  | Reporting          | `panel-reporting` | Analyse                                          | KPI 7 j, évolution des écarts, taux de routines, catégories, zones — **basé sur un historique fabriqué**                                                        |
| 12  | Jumeau numérique   | `panel-twin`      | Plan 2D de l'atelier                             | 8 postes positionnés en %, état vert/rouge selon l'Andon                                                                                                        |
| 13  | Flux               | `panel-flux`      | Salle de contrôle + kanban matières              | État des lignes (Andon), stocks par poste, boutons −20 / +50                                                                                                    |
| 14  | Standards          | `panel-standards` | Knowledge Center                                 | 12 fiches, recherche, filtre catégorie, modale de détail                                                                                                        |
| 15  | Équipe             | `panel-team`      | Présences et congés                              | Tableau des statuts, congés (actif → statut « En congé »)                                                                                                       |
| 16  | Liens              | `panel-links`     | Liens opérationnels                              | Ajout réservé Manager, validation `https://`                                                                                                                    |

## 3. Données (objet `DB`, clé localStorage `ll_cqc_data_v1`)

`seedData()` construit 22 collections :

| Collection                                     | Nature                              | Remarques                                                                                          |
| ---------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| `team`                                         | 8 personnes (2 LL, 3 Hancho, 3 LQC) | Noms fictifs. `status` : present / absent / onLeave. `role` interne `Anchor` = Hancho, `CQC` = LQC |
| `routines`                                     | 9 routines (3 par rôle)             | `items[]`, `stdRefs[]`, `done[]` (indices), `stamps{}` — **un seul jour**, aucun historique        |
| `tasks`                                        | 3 tâches                            | Statuts `In Progress` / `Completed` ; `Overdue` calculé ; commentaires sérialisés dans une chaîne  |
| `incidents`                                    | 2                                   | `Ouvert` / `Clôturé`                                                                               |
| `leaves`                                       | 2 congés                            | Pilotent `team[].status`                                                                           |
| `announcement`                                 | 1 chaîne                            | Annonce du jour                                                                                    |
| `links`                                        | 3                                   | URL `example.com`                                                                                  |
| `sequence`                                     | 7 étapes                            | Heure, durée (min), `finished`                                                                     |
| `andonStations` / `andonTypes` / `andonAlarms` | 4 postes, 3 types, 2 alarmes        | Seulement 4 postes sur 8 ont un Andon                                                              |
| `cqcTrend`                                     | 7 valeurs **codées en dur**         | Présentées comme « Conformité du jour »                                                            |
| `cqcChecks`                                    | 3 mesures                           | Valeur, min, max, unité                                                                            |
| `passations`                                   | 2                                   |                                                                                                    |
| `kanban`                                       | 7 stocks matières                   | stock / min / cible                                                                                |
| `ecarts`                                       | 4                                   | Statuts Ouvert / EnCours / Termine / Retard (calculé)                                              |
| `gembaWalks`                                   | 2                                   | Complétées par `migrateGemba()`                                                                    |
| `emailLog`                                     | 2                                   | **Simulation** d'emails Power Automate                                                             |
| `checklist`                                    | `{}`                                | État du jour de la checklist digitale                                                              |
| `history`                                      | 30 jours **générés par formule**    | Alimente le reporting et l'analyse par période                                                     |
| `knowledge`                                    | 12 fiches                           | Copie de `KNOWLEDGE_REF`                                                                           |
| `meetings`                                     | 1 réunion passée                    |                                                                                                    |

Constantes de référence : `CHECKLIST_REF` (7 catégories × 4 points), `KNOWLEDGE_REF`, `GEMBA_CHECK_ITEMS` (8), `MEETING_AGENDA` (5), `TWIN_LAYOUT` (8 postes), `ANDON_PRESETS`, `ROLE_PERMS`, `ROLE_USER`.

Autres clés de stockage : `ll_app_session_v1` (session), `ll_app_login_code_v1` (code en sessionStorage), `ll_app_last_tab_v1` (dernier onglet).

Migrations ad hoc dans `loadDB()` : complément des champs manquants, ajout de `stdRefs`, correction de `checklist`, dédoublonnage des tâches.

## 4. État applicatif (objet `state`)

`tab`, `role` (verrouillé à `LL`), `authEmail`, `authenticated`, `seq` (index, running, remaining, timer, done), `andonTimer`, `fluxTimer`, `ecartPhoto`, `gembaPhoto`, `gembaChecks`, `gembaDraft`, `rptScale`, `rptFrom/To` (inutilisés), `dashPeriod`, `dashFrom`, `dashTo`, `editingAnn`, `twinSel`. Plus `kbState` (recherche Knowledge Center).

## 5. Interactions et logique métier identifiées

**Routines**

- Validation d'un point = ajout de l'indice dans `done` + horodatage ; re-clic = annulation.
- Taux global = points validés / points totaux (toutes routines, tous rôles).
- « Nouvelle journée » remet tout à zéro (imite un flow planifié à 00:01) → **l'historique est perdu**.

**Actions / tâches**

- Une tâche est « en retard » si non terminée et échéance dépassée.
- Quatre sources créent des actions, chacune dans sa propre structure : tâche manuelle, action de réunion (dupliquée dans `tasks`, liée par **titre + assigné**), écart (action intégrée à l'écart), Gemba (tâche liée par `gembaId`).
- Dédoublonnage par titre + assigné.
- Commentaires : chaîne sérialisée `date§§FIELD§§texte§§FIELD§§auteur§§COMMENT§§…` (héritage SharePoint/Power Apps).

**Écarts**

- Statut cyclique au clic : Ouvert → En cours → Terminé → Ouvert.
- Retard calculé depuis la date limite.
- Un ❌ dans la checklist pré-remplit la description.
- Photo en base64 dans localStorage (limite 1 Mo).
- « Email automatique envoyé » : **simulé**, aucun envoi.
- Les écarts saisis ont tous la catégorie `Manuel` → les KPI Lean par catégorie ne les comptent jamais.

**KPI Lean** (`domKpis`) : Qualité = dernière valeur codée en dur − 2 × écarts qualité ; Sécurité/Performance/5S = 100 − 20 × écarts ouverts. **Formules arbitraires**.

**Séquence guidée** : 7 étapes, minuteur par `setInterval` qui décrémente un compteur ; passage automatique à l'étape suivante ; pause, retour, suivant, rejouer. État non persisté (perdu au rechargement).

**Andon** : types Qualité / Équipement / Matières ; durée depuis le déclenchement ; « critique » après 8 min ; rafraîchissement toutes les 5 s ; pareto par type. Pas de responsable, pas d'acquittement, pas de cause, pas d'historique consultable.

**Gemba Walk** : validation en deux temps (brouillon → résumé → validation) ; action créée si au moins un KO ou criticité ≠ Mineure ; priorité et échéance déduites de la criticité (Critique = 1 j, Majeure = 3 j, sinon 7 j) ; changement de statut synchronisé avec l'action liée.

**Réunion** : une réunion par jour créée à la volée ; compte-rendu enregistré à chaque frappe.

**Congés** : un congé actif force le statut `onLeave` (jamais remis à `present` à la fin du congé : **bug**).

**Kanban matières** : Sain si stock ≥ cible ; À surveiller si min ≤ stock < cible ; Réappro urgent si < min ; Rupture si 0.

**Jumeau numérique** : état = Andon actif sur le poste ; les « routines associées » sont déduites de **l'icône du poste**.

**Rapport du jour** : texte copiable (routines, écarts du jour, incidents, actions).

**QR** : `#poste=P1…P8` → onglet Écarts avec la zone pré-remplie.

**Permissions** (`ROLE_PERMS`) : LL, Anchor, CQC, Manager. Utilisées pour : formulaires Congés et Liens (Manager), bouton d'avancement des écarts, passations. **Le rôle est verrouillé sur LL**, le sélecteur de rôle n'existe plus dans le HTML.

## 6. Éléments purement démonstratifs (à ne jamais présenter comme réels)

1. Code de connexion affiché à l'écran ; aucune vérification d'identité.
2. Journal d'emails « Power Automate » : aucun email n'est envoyé.
3. `history` (30 jours) : séries générées par formule.
4. `cqcTrend` : 7 valeurs codées en dur, affichées comme « Conformité du jour ».
5. Formules des KPI Lean.
6. Temps de réaction Andon « simulation ».
7. Jumeau numérique « màj live » : aucune donnée machine.
8. Kanban : boutons ±, pas de lien avec une vraie consommation.
9. Liens vers `example.com`.
10. Styles `.bi-embed` / `.bi-placeholder` pour Power BI : **aucun HTML ne les utilise** (intégration jamais commencée).
11. Toutes les personnes et références (OF, riser client #84…) sont fictives.

## 7. Défauts et incohérences relevés

| Type         | Constat                                                                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture | Tout est global (`DB`, `state`), rendu par `innerHTML` complet à chaque action, écouteurs ré-attachés à chaque rendu                                     |
| Architecture | Logique métier, accès aux données et rendu mélangés dans les mêmes fonctions                                                                             |
| Données      | Aucun historique : routines, checklist et séquence sont écrasées chaque jour                                                                             |
| Données      | Pas de modèle unifié des actions (4 structures différentes, liaisons par titre)                                                                          |
| Données      | Photos base64 dans localStorage (quota ~5 Mo)                                                                                                            |
| Données      | Incohérence de lignes : postes 5-6 en « Ligne B » sur les QR, en « Ligne A » dans le jumeau et l'Andon, mais dessinés dans la rangée « Ligne B » du plan |
| Données      | Dates : mélange `toISOString()` (UTC) et dates locales → décalage possible d'un jour autour de minuit                                                    |
| Métier       | Écarts manuels toujours catégorisés « Manuel »                                                                                                           |
| Métier       | Congé terminé ne remet pas le statut à « Présent »                                                                                                       |
| Métier       | « Routines du jour » compte tous les rôles alors que l'écran est dédié au LL                                                                             |
| UX           | 16 entrées de menu (regroupées en 5 groupes lors de la dernière itération)                                                                               |
| UX           | Emojis utilisés comme icônes ; nombreuses couleurs décoratives                                                                                           |
| UX           | `prompt()` / `confirm()` natifs                                                                                                                          |
| UX           | Tableaux non adaptés au mobile                                                                                                                           |
| Sécurité     | `href` des liens injecté après `escapeHtml` mais sans liste d'autorisation de schéma côté affichage (validation `https://` seulement à la saisie)        |
| Sécurité     | Authentification factice                                                                                                                                 |
| Qualité      | Aucun test, aucune séparation, pas de gestion d'erreur (`catch (e) {}` silencieux)                                                                       |
| Code mort    | `renderAndonNone`, `renderQR` (vide), `rptFrom/rptTo`, `twinStateOf.activeAndon`, `catSource`, `.bi-*`, `.comment-bubble`, `#role-switch`                |

## 8. Dépendances implicites

- Navigateur récent (localStorage, sessionStorage, FileReader, Clipboard API avec repli `execCommand`).
- Culture française (`fr-FR`) codée en dur.
- Heure locale du poste de travail pour les échéances et le « jour ».
- Écosystème Microsoft visé (Power Apps, Power Automate, Power BI) → cible probable Microsoft Entra ID pour l'authentification.
- Atelier supposé : 2 lignes, 8 postes, 3 équipes (matin, après-midi, nuit).

## 9. Décision par fonctionnalité

| Fonctionnalité                                             | Décision                                             | Justification                                                                                                    |
| ---------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Accueil / cockpit                                          | **Transformer**                                      | Garder « À faire maintenant » (priorisation), supprimer les widgets décoratifs, tout calculer depuis les données |
| Routines                                                   | **Transformer**                                      | Séparer modèle (template) et exécution datée → historique, plus de reset destructif                              |
| Checklist digitale des écarts                              | **Fusionner** dans les routines                      | C'est une routine d'audit LL à 7 sections ; un KO propose de créer une anomalie                                  |
| Séquence guidée                                            | **Reconstruire**                                     | Minuteur basé sur l'horodatage, état persistant, séquences multiples                                             |
| Tâches, actions de réunion, actions d'écart, actions Gemba | **Unifier** en une entité `Action` avec une `source` | Supprime les liaisons par titre et les doublons                                                                  |
| Commentaires                                               | **Reconstruire**                                     | Entité `Comment` rattachée à n'importe quelle entité, fini la sérialisation `§§`                                 |
| Écarts + Incidents                                         | **Fusionner** en `Anomaly`                           | Même cycle de vie (déclaration → traitement → clôture), distingués par la catégorie                              |
| Andon                                                      | **Enrichir**                                         | Ajout de l'acquittement, du responsable, de la cause, de l'historique, tous les postes                           |
| Jumeau numérique                                           | **Transformer**                                      | Plan de l'atelier dont chaque état indique sa source (calculé / manuel / non connecté)                           |
| Flux / Kanban                                              | **Transformer**                                      | Ordres de fabrication par étape + stocks matières ; aucune simulation automatique                                |
| Gemba Walk                                                 | **Conserver et structurer**                          | Plusieurs observations par marche, actions liées                                                                 |
| LQC                                                        | **Transformer**                                      | Saisie de mesures réelles ; conformité calculée ; suppression de la tendance codée en dur                        |
| Knowledge Center + Liens                                   | **Fusionner**                                        | Même besoin (retrouver une référence) ; ajout version, date, propriétaire, favoris                               |
| Réunion                                                    | **Conserver** + agenda du jour                       |                                                                                                                  |
| Passation                                                  | **Conserver** + accusé de lecture                    |                                                                                                                  |
| Équipe + congés                                            | **Conserver** ; statut calculé correctement          |                                                                                                                  |
| Annonce du jour                                            | **Conserver**                                        |                                                                                                                  |
| Rapport du jour                                            | **Conserver**                                        | Calculé depuis les vraies données                                                                                |
| QR postes                                                  | **Transformer**                                      | QR générés dynamiquement à partir de la liste des postes, imprimables                                            |
| Reporting / analyse par période                            | **Reconstruire**                                     | Uniquement des agrégats de données existantes ; comparaison avec la période précédente                           |
| KPI Lean arbitraires                                       | **Supprimer**                                        | Remplacés par des indicateurs définis et documentés                                                              |
| Journal d'emails simulé                                    | **Remplacer**                                        | Centre de notifications interne ; connecteur email explicitement « non configuré »                               |
| Power BI                                                   | **Créer l'abstraction**                              | Composant `BIEmbed`, état « non connecté » explicite                                                             |
| Écran de chargement                                        | **Supprimer**                                        | Pas de valeur métier                                                                                             |
| Connexion par code affiché                                 | **Remplacer**                                        | Sélection de profil en mode DÉMO clairement étiquetée ; interface prête pour un fournisseur réel                 |
