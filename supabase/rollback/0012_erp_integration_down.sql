-- Annulation de 0012_erp_integration.sql (à n'exécuter que sur décision explicite : supprime le journal
-- d'intégration et les données ERP copiées ; aucune table antérieure n'est concernée).
drop function if exists public.integration_claim_outbox(integer);
drop table if exists public."integrationSettings";
drop table if exists public."integrationOutbox";
drop table if exists public."integrationSyncRuns";
drop table if exists public."externalReferences";
drop table if exists public."erpRecords";
