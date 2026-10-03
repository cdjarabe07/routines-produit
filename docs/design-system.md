# Design system

Objectif : un logiciel métier industriel, sobre et dense, lisible sur tablette en atelier. Pas de dégradés, pas d’ombres décoratives, pas d’emojis, pas d’animation permanente (seule exception : la pastille d’un Andon en attente et le clignotement d’un Andon escaladé).

## Tokens (`src/styles/tokens.css`)

| Famille  | Tokens                                                                                | Usage                                                                                                                |
| -------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Surfaces | `background`, `surface`, `surface-muted`, `surface-sunken`, `border`, `border-strong` | Fond presque blanc, contenus sur blanc, séparation par filets fins ; ombre légère réservée au survol et aux fenêtres |
| Texte    | `text`, `text-muted`, `text-subtle`, `text-inverse`                                   |                                                                                                                      |
| Barre    | `sidebar`, `sidebar-hover`, `sidebar-active`, `sidebar-text…`                         | Barre latérale claire (style SaaS)                                                                                   |
| Chrome   | `chrome`, `chrome-raised`, `chrome-text…`                                             | Surfaces sombres ponctuelles : bulles d’aide, notifications, avatar                                                  |
| Action   | `primary`, `primary-hover`, `primary-soft`                                            | Bouton principal, liens, sélection                                                                                   |
| Statuts  | `success`, `warning`, `danger`, `info`, `neutral` (+ `-soft`, `-strong`)              | **Sens métier uniquement**                                                                                           |
| Démo     | `demo`, `demo-soft`                                                                   | Réservé au signalement du mode démonstration et des contenus d’exemple                                               |
| Typo     | `text-xs` 12 → `text-display` 44, poids 400/500/600                                   | Inter (variable) auto-hébergée, chiffres tabulaires                                                                  |
| Espaces  | `space-1` 4 px → `space-10` 40 px                                                     | Base 4 px                                                                                                            |
| Formes   | `radius-sm/md/lg` 6/8/10 px, `shadow-sm`, `shadow-overlay`                            | Badges en pastilles ; indicateurs en cartes séparées                                                                 |
| Tailles  | `touch-target` 40 px                                                                  | Cible minimale des contrôles                                                                                         |

### Sens des couleurs

| Couleur | Signification                   | Exemples                                                  |
| ------- | ------------------------------- | --------------------------------------------------------- |
| Vert    | Conforme, terminé, en marche    | Point OK, ligne nominale, action terminée                 |
| Orange  | Attention                       | Andon pris en charge, stock à surveiller, routine à faire |
| Rouge   | Problème / critique             | Andon en attente, retard, non conforme, rupture           |
| Bleu    | Information / en cours / action | Action en cours, bouton principal                         |
| Gris    | Neutre                          | Planifié, annulé, non renseigné                           |

La couleur n’est **jamais** le seul porteur d’information : chaque état a aussi un libellé. Tous les couples texte / fond respectent un contraste ≥ 4,5:1 (vérifié automatiquement par axe dans `e2e/a11y.spec.ts`) ; le rouge vif `danger-strong` est réservé aux traits et pastilles, les fonds rouges avec texte blanc utilisent `danger`.

## Composants (`src/components`)

| Composant                                                                          | Rôle                                                                                                                        |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `Button`, `ButtonLink`, `IconButton`                                               | Variantes primary/secondary/ghost/danger/success, tailles sm/md/lg, état loading ; `IconButton` exige un libellé accessible |
| `TextField`, `TextAreaField`, `SelectField`, `Checkbox`, `FormGrid`, `FormActions` | Champs avec libellé, aide, erreur (`aria-invalid`, `aria-describedby`)                                                      |
| `PhotoInput`                                                                       | Prise de vue, compression avant stockage                                                                                    |
| `Badge`, `StatusDot`                                                               | État court (ton sémantique)                                                                                                 |
| `Panel`                                                                            | Bloc bordé avec en-tête ; accent latéral pour signaler un état                                                              |
| `Kpi`, `KpiStrip`                                                                  | Indicateurs en bande (pas de cartes empilées), variation vs période précédente                                              |
| `Tabs` (onglets / segmented)                                                       | Navigation clavier (flèches, Début, Fin)                                                                                    |
| `Progress`                                                                         | Barre avec `role="progressbar"`                                                                                             |
| `Modal`, `Drawer`                                                                  | Piège du focus, Échap, restauration du focus ; plein écran bas sur mobile                                                   |
| `ConfirmDialog` (`useConfirm`)                                                     | Remplace `window.confirm`                                                                                                   |
| `Menu`                                                                             | Menu déroulant accessible                                                                                                   |
| `Tooltip`, `Toast` (`useToast`)                                                    |                                                                                                                             |
| `DateNavigator`                                                                    | Jour précédent / suivant / sélection                                                                                        |
| `LoadingState`, `EmptyState`, `ErrorState`, `AccessDenied`, `QueryBoundary`        | États UX normalisés                                                                                                         |
| `PageHeader`, `Section`, `Stack`, `Columns`                                        | Mise en page                                                                                                                |
| `DataTable`                                                                        | Recherche, tri, pagination, ligne cliquable, ton de ligne ; **vue carte ≤ 900 px**                                          |
| `ItemList`, `KeyValueList`                                                         | Listes denses                                                                                                               |
| `BarChart`, `LineChart`, `RankedBars`                                              | SVG sobres, comparaison, ligne de référence, « Voir les données » (tableau accessible)                                      |

## Règles

1. Une page = `PageHeader` + contenu en `Stack` ; pas de carte « décorative ».
2. Toute liste vide affiche un `EmptyState` explicite.
3. Toute requête passe par `QueryBoundary` (chargement / erreur / réessayer).
4. Les boutons d’envoi passent en `loading` pendant l’opération.
5. Les actions interdites ne sont pas affichées (`<Can>`), et la route renvoie `AccessDenied`.
6. Responsive : barre latérale → tiroir sous 1024 px ; tableaux → cartes sous 900 px ; formulaires en une colonne et actions pleine largeur sous 720 px.
