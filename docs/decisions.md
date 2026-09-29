# Journal des décisions

Chaque entrée : contexte, décision, conséquence. Les hypothèses métier à valider avec le terrain sont marquées **[À VALIDER]**.

## D-001 — Rebuild complet, prototype conservé en référence
Le prototype est conservé dans `legacy/` (version d'origine et version améliorée). Aucune ligne n'en est reprise ; il sert de référence fonctionnelle.

## D-002 — Postes par ligne **[À VALIDER]**
Le prototype est incohérent (postes 5-6 en ligne B sur les QR, en ligne A dans le jumeau, mais dessinés dans la rangée B du plan). Hypothèse retenue : **ligne A = postes 1 à 4, ligne B = postes 5 à 8**, ce qui correspond aux étiquettes QR (objet physique) et au dessin du plan. Les postes sont paramétrables dans l'administration.

## D-003 — Écarts et incidents fusionnés en « Anomalies »
Même cycle de vie, même besoin de traçabilité. La catégorie distingue sécurité, qualité, équipement, etc. La catégorie « Manuel » du prototype disparaît : la catégorie devient obligatoire.

## D-004 — Une seule entité « Action »
Tâches, actions de réunion, actions d'écart et actions Gemba deviennent `Action` avec une `source`. Plus de liaison par titre.

## D-005 — Routines : modèle + exécution datée
Le bouton « Nouvelle journée » disparaît : chaque jour crée de nouvelles exécutions, l'historique est conservé. La « checklist digitale » (7 catégories) devient le modèle de routine « Audit terrain LL ».

## D-006 — Rôles **[À VALIDER]**
Six rôles : opérateur, Hancho, Line Leader, qualité (LQC), manager, administrateur. Le prototype n'avait pas de rôle opérateur ni administrateur ; ils sont ajoutés pour l'accès terrain (QR, Andon) et le paramétrage.

## D-007 — Authentification DÉMO par choix de profil
Le code à 6 chiffres affiché à l'écran donnait l'illusion d'une sécurité. Il est remplacé par un choix de profil explicitement libellé « MODE DÉMO ». Cible production présumée : Microsoft Entra ID (écosystème Power Platform évoqué dans le prototype) **[À VALIDER]**.

## D-008 — Routeur hash
Permet un hébergement statique sans configuration serveur et des QR codes stables.

## D-009 — Pas de glisser-déposer pour la production
Le déplacement d'un OF entre étapes se fait par boutons « étape précédente / suivante ». Plus fiable sur tablette avec gants, accessible au clavier, sans dépendance. Le glisser-déposer pourra être ajouté si le terrain le demande.

## D-010 — Aucune notification email simulée
Le journal « Power Automate » du prototype est supprimé. Les notifications sont internes à l'application ; le connecteur email est affiché « non configuré ».

## D-011 — Indicateurs Lean arbitraires supprimés
Les formules « 100 − 20 × écarts » n'avaient pas de définition métier. Remplacées par les indicateurs définis dans `functional-spec.md §7`.

## D-012 — Jeu de démonstration daté dynamiquement
Pour que le reporting soit testable, le jeu DÉMO génère 30 jours d'enregistrements (exécutions de routines, anomalies, Andon, mesures) relatifs à la date du jour. Toutes les pages portent le bandeau « MODE DÉMO — données fictives ». Aucun nom réel.

## D-013 — Seuil d'escalade Andon : 10 minutes **[À VALIDER]**
Le prototype utilisait 8 min pour « critique ». Valeur paramétrable, défaut 10 min sans prise en charge.

## D-014 — Retard d'une routine : heure prévue + 2 h **[À VALIDER]**
Aucune règle dans le prototype. Paramètre modifiable.

## D-015 — Équipes : matin, après-midi, nuit **[À VALIDER]**
Reprises du formulaire de passation du prototype.
