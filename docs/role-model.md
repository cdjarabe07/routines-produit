# Modèle de rôles

## 1. Principe

L'application s'organise en **trois espaces**, qui suivent la chaîne demandée :

```text
ADMINISTRATION  →  PLANIFICATION  →  MON TRAVAIL (exécution)  →  DONNÉES  →  SUPERVISION (manager)
   configure         affecte             reçoit, exécute,                    supervise, analyse,
                                          signale                             corrige
```

| Espace             | Préfixe    | Question à laquelle il répond                      |
| ------------------ | ---------- | -------------------------------------------------- |
| **Mon travail**    | `/app`     | « Qu'est-ce que je dois faire maintenant ? »       |
| **Supervision**    | `/manager` | « Comment va mon équipe, ma ligne, mon atelier ? » |
| **Administration** | `/admin`   | « Qu'est-ce qui est configuré et planifié ? »      |

Un utilisateur voit **uniquement les espaces auxquels il a droit**. Un sélecteur en haut du menu permet de passer d'un espace à l'autre, et chaque espace a son propre menu.

Les écrans de détail communs restent hors préfixe : une action, une anomalie, une réunion, un Andon, un document, une Gemba, une séquence en cours. Leur contenu s'adapte aux droits de l'utilisateur.

## 2. Profils et rôles

Les trois profils demandés (Admin, Manager / Responsable, Utilisateur / Opérateur) regroupent les **six rôles métier** existants. Ces rôles sont conservés parce qu'ils correspondent à l'organisation réelle d'un atelier de câblage :

- un Hancho encadre une cellule ;
- un LQC contrôle ;
- un Line Leader pilote une ligne.

| Profil             | Rôle           | Espace d'accueil   | Autres espaces                                                 | Mission                                                                                                                                                       |
| ------------------ | -------------- | ------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Utilisateur**    | Opérateur      | `/app`             | —                                                              | Exécute ses routines et séquences, signale les problèmes (anomalie, Andon), traite les actions qui lui sont confiées, consulte ses réunions et les standards  |
| **Utilisateur**    | Hancho         | `/app`             | Supervision (Andon, production)                                | Comme l'opérateur, plus la prise en charge des Andon de sa ligne et la mise à jour de la production et des stocks                                             |
| **Utilisateur**    | Qualité (LQC)  | `/app`             | Supervision (qualité, anomalies, reporting)                    | Comme l'opérateur, plus les mesures LQC, le traitement des anomalies et la Gemba                                                                              |
| **Responsable**    | Line Leader    | `/manager`         | Mon travail                                                    | Supervise sa ligne et son équipe, anime les réunions dont il est organisateur, traite les Andon et les actions, exécute ses propres routines                  |
| **Responsable**    | Manager        | `/manager`         | Mon travail ; Administration (planification, réunions, agenda) | Supervise l'atelier, consulte les KPI et les rapports, planifie et réaffecte les routines, organise les réunions                                              |
| **Administrateur** | Administrateur | `/admin/dashboard` | Tous                                                           | Configure tout : utilisateurs, équipes, postes, routines, tâches, checklists, séquences, planification, réunions, agenda, centre de connaissances, paramètres |

Règles :

- Le **manager n'a pas tous les droits de l'administrateur**. Il ne gère ni les utilisateurs, ni les équipes, ni les postes, ni le contenu des routines, checklists et séquences, ni les paramètres.
- L'**administrateur peut exécuter** une routine, à condition qu'elle lui soit affectée. Personne n'exécute une routine qui ne lui est pas affectée.
- Un rôle n'est **jamais testé dans un composant**. Les composants demandent une permission (`can(permission, ressource?)`). La correspondance entre rôles et permissions se trouve dans `src/services/auth/permissions.ts` et est décrite dans `permission-matrix.md`.

## 3. Rattachements

```text
Utilisateur ── appartient à ──► Équipe ── travaille sur ──► Ligne (zone) ──► Postes
     │                              │
     └── affecté directement ───────┴── affectée ──► Planification ──► Routine ──► Tâches ──► Checklist
```

- **Équipe** : nouvelle entité. Elle a un nom, un quart (matin, après-midi ou nuit), une ligne éventuelle et un responsable. Le quart et la ligne d'un utilisateur sont **repris de son équipe** quand il en a une.
- **Zone** : correspond à la **ligne** existante (Ligne A, Ligne B). Aucune entité « Zone » supplémentaire n'est créée, pour ne pas introduire d'entité inutile.
- **Poste** : poste de travail existant (P1…P8, avec QR code).

## 4. Routes d'entrée

| Profil                               | Après connexion    | Route `/`                         |
| ------------------------------------ | ------------------ | --------------------------------- |
| Administrateur                       | `/admin/dashboard` | redirigée vers `/admin/dashboard` |
| Responsable (Line Leader, Manager)   | `/manager`         | redirigée vers `/manager`         |
| Utilisateur (Opérateur, Hancho, LQC) | `/app`             | redirigée vers `/app`             |

Si la connexion est demandée depuis un lien protégé (paramètre `retour`, par exemple un QR code de poste ou un lien de notification), l'utilisateur revient sur ce lien. Les gardes de route s'appliquent ensuite normalement.

## 5. Comptes de test

Les identifiants sont **centralisés dans le fournisseur d'authentification simulé** (`src/services/auth/mock/accounts.ts`). Ils n'apparaissent dans aucun composant d'interface.

| Identifiant | Email                           | Personne        | Rôle           |
| ----------- | ------------------------------- | --------------- | -------------- |
| `admin`     | `claire.fontaine@atelier.local` | Claire Fontaine | Administrateur |
| `manager`   | `xavier.dupont@atelier.local`   | Xavier Dupont   | Manager        |
| `operateur` | `nadia.roussel@atelier.local`   | Nadia Roussel   | Opérateur      |

- **Mot de passe** : `Routines2026`. C'est le mot de passe initial de tous les comptes simulés, y compris les comptes créés par l'administrateur.
- **Autres comptes** : tout utilisateur actif peut se connecter avec son email, par exemple `karim.benali@atelier.local` (Line Leader), `yann.duclos@atelier.local` (Hancho) ou `aicha.camara@atelier.local` (LQC).

> **Sécurité.** Le fournisseur simulé **n'est pas sécurisé**. Les identifiants et le mot de passe sont dans le code JavaScript livré au navigateur, et les droits sont appliqués côté client uniquement. Il sert au développement et aux démonstrations. En production, il est remplacé par un fournisseur réel (Microsoft Entra ID / OIDC, voir `deployment.md`) derrière la même interface `AuthService`, et **le serveur doit appliquer la même matrice de droits**.
