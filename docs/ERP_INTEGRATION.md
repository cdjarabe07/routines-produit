# Intégration ERP (préparation SAP)

> **État actuel : Mock SAP, simulation.** L'application n'est connectée à **aucun** système SAP. Toutes les données et tous les envois de l'écran _Administration → Intégration ERP_ sont simulés et présentés comme tels.
> Aucune hypothèse n'est faite sur l'environnement SAP réel (version, hébergement, interfaces) : il est inconnu à ce jour.

## 1. Pourquoi un adaptateur

Principe fonctionnel :

- **L'ERP est la source de vérité** pour ce qui relève de l'ERP : ordres de fabrication, postes de travail, articles, stocks, mouvements, avis qualité et maintenance ;
- **l'application est la source de vérité** pour le terrain : routines, Gemba, réunions, actions, Andon, anomalies.

Comme le SAP réel n'est pas connu, l'application parle à un **contrat** (`ErpAdapter`), jamais à SAP directement. Aujourd'hui, ce contrat est rempli par un **Mock SAP**. Demain, un connecteur réel prendra sa place, sans modifier ni les écrans, ni les tables, ni le moteur de synchronisation.

```text
Application (écran d'administration)
      │  appelle la fonction serveur « erp-integration » (jeton de l'utilisateur, permission settings.manage)
      ▼
Fonction serveur (Supabase Edge, clé de service)
      │  choisit l'adaptateur selon SAP_INTEGRATION_MODE
      ▼
ErpAdapter ──┬── MockSapAdapter       ← maintenant (simulation, aucune connexion réseau)
             └── adaptateur réel      ← plus tard (§8), non écrit
```

**Le navigateur ne communique jamais avec SAP.** Il n'a accès à aucun identifiant, jeton, point d'accès ou réglage SAP. Il lit seulement les tables de journal (RLS : administration) et appelle la fonction serveur.

## 2. Mock SAP et vrai SAP

|                           | Mock SAP (actuel)                                                                                                | Vrai SAP (futur)                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Données                   | Jeu déterministe d'un atelier de câblage (faisceaux, fils, cosses, connecteurs, postes P1 à P8), numéros neutres | Données de l'entreprise                                               |
| Connexion                 | Aucune                                                                                                           | Mécanisme validé par la DSI (§9)                                      |
| Marquage                  | Chaque enregistrement et chaque envoi porte `simulated = true` ; bandeau « Mock SAP — simulation »               | `simulated = false`                                                   |
| Incidents                 | Scénarios simulés (§6)                                                                                           | Réels                                                                 |
| Liens « Ouvrir dans SAP » | Aucun (aucune URL réelle connue)                                                                                 | Seulement si une URL réelle est renseignée (`externalReferences.url`) |

## 3. Code et données

| Élément                                          | Emplacement                                                                                                     |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Modèle canonique (types neutres, erreurs typées) | `supabase/functions/_shared/erp/types.ts`                                                                       |
| Contrat d'adaptateur                             | `supabase/functions/_shared/erp/adapter.ts`                                                                     |
| Mock SAP et son jeu de données                   | `supabase/functions/_shared/erp/mockSapAdapter.ts`, `mockSapData.ts`                                            |
| Validation des données reçues                    | `supabase/functions/_shared/erp/validate.ts`                                                                    |
| Moteur de synchronisation                        | `supabase/functions/_shared/erp/sync.ts`                                                                        |
| Outbox                                           | `supabase/functions/_shared/erp/outbox.ts`                                                                      |
| Choix de l'adaptateur (réglage)                  | `supabase/functions/_shared/erp/factory.ts`                                                                     |
| Accès à la base (clé de service)                 | `supabase/functions/_shared/erp-store.ts`                                                                       |
| Fonction serveur                                 | `supabase/functions/erp-integration/index.ts`                                                                   |
| Tables, RLS                                      | `supabase/migrations/0012_erp_integration.sql` (annulation : `supabase/rollback/0012_erp_integration_down.sql`) |
| Écran d'administration                           | `src/features/admin/IntegrationPage.tsx` (route `/admin/integration`)                                           |
| Tests                                            | `tests/erp/` (moteur, Mock, outbox), `tests/security/erp.security.test.ts` (serveur)                            |

Le code d'intégration est du TypeScript sans dépendance d'exécution : il tourne dans la fonction serveur (Deno) et dans les tests (Vitest).

### Tables (ajouts uniquement, aucune table existante modifiée)

| Table                 | Rôle                                                                                                                                                                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `erpRecords`          | Copie normalisée des données reçues. Clé unique `(system, objectType, externalId)`, `payload` (JSON validé), `hash` (empreinte), `simulated`, `sourceUpdatedAt`, `lastSyncRunId`                                                                                                                                   |
| `externalReferences`  | Lien générique entité de l'application ↔ identifiant externe : `(entityType, entityId, system, externalId, url, metadata)`. Un OF interne peut pointer vers SAP **et** vers un autre système. Uniques : une entité a au plus un identifiant par système ; un identifiant externe désigne une seule entité par type |
| `integrationSyncRuns` | Journal des synchronisations : source, mode, scénario, statut (`running` / `success` / `partial` / `failed`), début, fin, lus / créés / modifiés / inchangés / rejetés, message d'erreur, détails par type. Une seule synchronisation en cours par source (index unique)                                           |
| `integrationOutbox`   | File d'envoi : opération, payload, clé d'idempotence (unique), statut (`pending` / `sending` / `sent` / `failed` / `dead`), essais, prochain essai, dernière erreur, référence renvoyée, date d'envoi                                                                                                              |
| `integrationSettings` | Envoi sortant activé ou non (**désactivé par défaut**), nombre maximal d'essais                                                                                                                                                                                                                                    |

Choix d'une table **générique** plutôt que de colonnes `sap_xxx` dans chaque table : le schéma SAP réel est inconnu. Les tables métier existantes (`productionOrders`, `materialStocks`…) sont aujourd'hui modifiées dans l'application ; y écrire des données simulées aurait changé le comportement actuel.

**Brancher les données ERP sur les écrans Production est une phase ultérieure**, à décider quand le vrai SAP sera connu (par exemple : l'OF vient de SAP, l'étape et le blocage restent gérés dans l'application, via `externalReferences`).

### Droits

- **Lecture** des cinq tables : administration (`settings.manage`), par RLS. Aucun accès anonyme.
- **Écriture** : fonction serveur uniquement. Aucune politique ni aucun droit d'écriture pour les clients.
- **Fonction `erp-integration`** : permission `settings.manage` vérifiée côté serveur. Un refus est tracé (`PERMISSION_DENIED`).
- **Opérations journalisées dans le journal d'audit** : ERP_SYNC, ERP_SETTINGS_CHANGED, ERP_OUTBOX_PROCESSED, ERP_OUTBOX_RETRY, ERP_OUTBOX_TEST_ENQUEUED.

## 4. Flux entrants (ERP → application) et idempotence

Pour chaque type d'objet (postes, articles, ordres, stocks, mouvements, avis qualité, avis maintenance), le moteur :

1. appelle l'adaptateur, avec un délai maximal et des nouvelles tentatives sur erreur transitoire ;
2. vérifie que la réponse est une liste, sinon le type est rejeté ;
3. **valide chaque enregistrement**. Un enregistrement invalide est rejeté seul, et journalisé avec son identifiant et le motif ;
4. **dédoublonne** : un doublon identique est ignoré ; un doublon contradictoire (même identifiant, contenus différents) est rejeté entièrement ;
5. calcule une **empreinte SHA-256** du contenu normalisé (clés triées) ;
6. compare avec l'empreinte enregistrée :
   - absente → **création** ;
   - différente → **mise à jour** ;
   - identique → **aucune écriture**.

Une synchronisation répétée ne crée donc **jamais** de doublon et ne réécrit rien d'inchangé. Test : `tests/erp/erp.test.ts`, section « Synchronisation et idempotence », et `tests/security/erp.security.test.ts` contre la vraie base.

Limite connue : un enregistrement qui disparaît de l'ERP n'est **pas supprimé** de `erpRecords`. La règle (suppression, marquage « obsolète ») sera à définir avec le vrai SAP.

## 5. Flux sortants (application → ERP) : outbox

```text
Application → écriture locale → integrationOutbox (pending) → traitement serveur → adaptateur → ERP
```

- Si l'ERP est indisponible, l'application **continue de fonctionner** : l'envoi attend dans la file.
- **Prise en charge atomique** (`integration_claim_outbox`, `FOR UPDATE SKIP LOCKED`) : deux traitements simultanés ne prennent jamais le même élément. Un envoi interrompu (« sending » depuis plus de 10 minutes) est repris.
- **Erreur transitoire** (indisponible, délai) : nouvel essai programmé après 1, 5, 15, 60 puis 240 minutes.
- **Erreur définitive** (refus, contenu invalide) ou nombre maximal d'essais atteint : `dead`. « Relancer » remet l'élément dans la file.
- La **clé d'idempotence** est transmise à l'ERP : un renvoi ne crée pas deux avis.
- **Aujourd'hui, aucune donnée de l'application n'entre automatiquement dans la file.** Les envois sont des « envois de test » créés depuis l'écran (Mock SAP uniquement), et le traitement exige que l'envoi sortant soit activé. Quels événements alimenteront la file (anomalie qualité → avis qualité, Andon équipement → avis maintenance…) reste une décision métier.

## 6. Gestion des erreurs — scénarios du Mock SAP

| Scénario        | Comportement attendu                                                                         | Vérifié par                |
| --------------- | -------------------------------------------------------------------------------------------- | -------------------------- |
| `success`       | Synchronisation réussie                                                                      | tests unitaires et serveur |
| `unavailable`   | Échec après nouvelles tentatives ; aucune donnée modifiée                                    | tests unitaires et serveur |
| `timeout`       | Appel interrompu par le moteur (délai maximal) → échec                                       | tests unitaires            |
| `invalid`       | Réponse non exploitable pour les ordres → type rejeté, autres types synchronisés → `partial` | tests unitaires            |
| `duplicate`     | Doublon identique ignoré, doublon contradictoire rejeté → `partial`                          | tests unitaires            |
| `partial`       | Enregistrements invalides rejetés et journalisés, les autres enregistrés                     | tests unitaires et serveur |
| `send_error`    | Envoi en échec → nouvel essai programmé ; reprise ensuite                                    | tests unitaires et serveur |
| `send_rejected` | Refus définitif → `dead` sans nouvel essai                                                   | tests unitaires            |
| `recovery`      | Premier appel en échec, nouvelle tentative réussie                                           | tests unitaires            |

Une synchronisation restée « en cours » après un arrêt brutal est clôturée en échec au bout de 15 minutes.

Messages : les erreurs ERP connues sont affichées telles quelles. Les autres restent dans les journaux du serveur, et l'interface affiche un message générique.

## 7. Réglage d'activation (serveur uniquement)

| Variable               | Où                                                            | Valeurs               | Défaut                                      |
| ---------------------- | ------------------------------------------------------------- | --------------------- | ------------------------------------------- |
| `SAP_INTEGRATION_MODE` | Secrets des fonctions Supabase (jamais une variable `VITE_*`) | `off`, `mock`, `real` | `mock` si absente ; valeur inconnue → `off` |

- `real` refuse explicitement (« Connecteur ERP réel non configuré ») : aucune connexion n'est tentée tant que l'adaptateur réel n'existe pas.
- **Aucune variable Vercel n'a été ajoutée** : le frontend apprend le mode en le demandant au serveur (action `status`).
- Ce mode n'a rien à voir avec le mode démo de l'application, qui reste désactivé en production.

## 8. Remplacer le Mock SAP par un connecteur réel

1. Obtenir les informations du §9 et valider le mécanisme avec la DSI.
2. Écrire `supabase/functions/_shared/erp/<nom>Adapter.ts`, qui implémente `ErpAdapter` :
   - chaque méthode de lecture renvoie les données **traduites vers le modèle canonique** (`types.ts`) ;
   - les erreurs sont converties en `ErpUnavailableError` / `ErpTimeoutError` (transitoires) ou `ErpInvalidResponseError` / `ErpRejectedError` (définitives) ;
   - `createQualityNotification` / `createMaintenanceNotification` transmettent la clé d'idempotence si l'ERP le permet ; sinon, un contrôle de doublon est à prévoir.
3. L'instancier dans `factory.ts` pour `mode === 'real'`.
4. Stocker les identifiants **uniquement** dans les secrets des fonctions Supabase (ou dans un coffre de l'entreprise). Jamais dans Git, jamais dans `VITE_*`.
5. Tester contre un **environnement SAP de test**, jamais la production SAP : `tests/erp` avec l'adaptateur réel sur des réponses enregistrées, puis `npm run test:security`.
6. Passer `SAP_INTEGRATION_MODE=real` dans les secrets serveur. Rien à changer dans le frontend.
7. Si SAP n'est pas joignable depuis Internet, le connecteur tournera **dans le réseau de l'entreprise** et poussera les données vers le serveur de l'application. Le moteur et les tables restent les mêmes : seul l'emplacement de l'adaptateur change.

Mécanismes possibles, **à choisir selon ce que l'environnement réel propose** (aucun n'est retenu aujourd'hui) : OData, API SAP, RFC/BAPI, IDoc, SAP BTP, SAP Integration Suite, Cloud Connector, autre mécanisme validé par la DSI.

## 9. Informations requises pour le vrai SAP

À obtenir auprès de la DSI et du référent SAP. **Aucune réponse n'est connue à ce jour.**

| Question                                                                                        | Réponse     |
| ----------------------------------------------------------------------------------------------- | ----------- |
| ECC ou S/4HANA ?                                                                                | _à obtenir_ |
| Version exacte                                                                                  | _à obtenir_ |
| Hébergement : on-premise, cloud privé, cloud public                                             | _à obtenir_ |
| SAP BTP disponible ?                                                                            | _à obtenir_ |
| Interfaces disponibles (OData, API, RFC/BAPI, IDoc, Integration Suite, autre)                   | _à obtenir_ |
| Modules utilisés (PP, MM, QM, PM, autres)                                                       | _à obtenir_ |
| API autorisées pour une application tierce                                                      | _à obtenir_ |
| Mode d'authentification (compte technique, certificat, OAuth, SSO)                              | _à obtenir_ |
| Fréquence de synchronisation attendue                                                           | _à obtenir_ |
| Flux autorisés : lecture seule, ou écriture (avis, confirmations, mouvements)                   | _à obtenir_ |
| Contraintes réseau (SAP joignable depuis Internet ? passerelle, VPN, liste blanche)             | _à obtenir_ |
| Politique de stockage des données SAP hors de SAP (hébergement UE, durée, données personnelles) | _à obtenir_ |
| Correspondance entre postes de l'application (P1…P8) et postes de travail SAP                   | _à obtenir_ |
| Environnement SAP de test disponible pour la recette                                            | _à obtenir_ |
