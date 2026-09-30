-- ============================================================
-- Couche d'intégration ERP (préparation SAP), docs/ERP_INTEGRATION.md.
-- Uniquement des AJOUTS : aucune table, colonne, politique ou donnée existante n'est modifiée.
-- - erpRecords          : copie normalisée des données reçues de l'ERP (source de vérité = l'ERP)
-- - externalReferences  : lien générique entité de l'application ↔ identifiant d'un système externe
-- - integrationSyncRuns : journal des synchronisations
-- - integrationOutbox   : file d'envoi application → ERP (idempotente, avec nouvelles tentatives)
-- - integrationSettings : réglages (envoi sortant désactivé par défaut)
-- Lecture : administration (settings.manage). Écriture : fonctions serveur uniquement (clé de service).
-- Annulation : supabase/rollback/0012_erp_integration_down.sql
-- ============================================================

create table public."erpRecords" (
  id text primary key default gen_random_uuid()::text,
  system text not null check (system ~ '^[A-Z0-9_]{2,20}$'),
  "objectType" text not null check ("objectType" in (
    'productionOrder', 'workCenter', 'material', 'stock', 'stockMovement', 'qualityNotification', 'maintenanceNotification')),
  "externalId" text not null check (char_length("externalId") between 1 and 120),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 20000),
  hash text not null check (hash ~ '^[0-9a-f]{64}$'),
  -- Donnée produite par le Mock SAP : jamais présentée comme provenant du vrai SAP
  simulated boolean not null,
  "sourceUpdatedAt" timestamptz,
  "lastSyncRunId" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique (system, "objectType", "externalId")
);

create table public."externalReferences" (
  id text primary key default gen_random_uuid()::text,
  "entityType" text not null check (char_length("entityType") between 1 and 40),
  "entityId" text not null check (char_length("entityId") between 1 and 64),
  system text not null check (system ~ '^[A-Z0-9_]{2,20}$'),
  "externalId" text not null check (char_length("externalId") between 1 and 120),
  -- Lien vers l'écran du système externe : renseigné seulement quand une URL réelle est connue
  url text check (url is null or (url ~ '^https://' and char_length(url) <= 500)),
  metadata jsonb not null default '{}' check (jsonb_typeof(metadata) = 'object'),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  -- Une entité a au plus un identifiant par système ; un identifiant externe désigne une seule entité par type
  unique ("entityType", "entityId", system),
  unique (system, "entityType", "externalId")
);

create table public."integrationSyncRuns" (
  id text primary key default gen_random_uuid()::text,
  source text not null check (source ~ '^[A-Z0-9_]{2,20}$'),
  mode text not null check (mode in ('mock', 'real')),
  scenario text check (char_length(scenario) <= 40),
  status text not null check (status in ('running', 'success', 'partial', 'failed')),
  "startedAt" timestamptz not null default now(),
  "finishedAt" timestamptz,
  "recordsRead" integer not null default 0 check ("recordsRead" >= 0),
  "recordsCreated" integer not null default 0 check ("recordsCreated" >= 0),
  "recordsUpdated" integer not null default 0 check ("recordsUpdated" >= 0),
  "recordsUnchanged" integer not null default 0 check ("recordsUnchanged" >= 0),
  "recordsFailed" integer not null default 0 check ("recordsFailed" >= 0),
  "errorMessage" text check (char_length("errorMessage") <= 2000),
  metadata jsonb not null default '{}' check (jsonb_typeof(metadata) = 'object'),
  "triggeredBy" text references public.users (id),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index "integrationSyncRuns_startedAt" on public."integrationSyncRuns" ("startedAt" desc);
-- Une seule synchronisation en cours par source
create unique index "integrationSyncRuns_one_running" on public."integrationSyncRuns" (source) where status = 'running';

create table public."integrationOutbox" (
  id text primary key default gen_random_uuid()::text,
  target text not null check (target ~ '^[A-Z0-9_]{2,20}$'),
  "entityType" text not null check (char_length("entityType") between 1 and 40),
  "entityId" text not null check (char_length("entityId") between 1 and 64),
  operation text not null check (operation in ('createQualityNotification', 'createMaintenanceNotification')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 20000),
  "idempotencyKey" text not null unique check (char_length("idempotencyKey") between 8 and 120),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'dead')),
  attempts integer not null default 0 check (attempts >= 0),
  "nextRetryAt" timestamptz not null default now(),
  "lastError" text check (char_length("lastError") <= 2000),
  "externalId" text check (char_length("externalId") <= 120),
  "sentAt" timestamptz,
  simulated boolean not null,
  "createdBy" text references public.users (id),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index "integrationOutbox_due" on public."integrationOutbox" ("nextRetryAt") where status in ('pending', 'failed');

create table public."integrationSettings" (
  id text primary key default 'erp' check (id = 'erp'),
  "outboundEnabled" boolean not null default false,
  "maxAttempts" integer not null default 5 check ("maxAttempts" between 1 and 20),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
insert into public."integrationSettings" (id) values ('erp');

-- Horodatages imposés par le serveur (même trigger que les autres tables)
create trigger touch before insert or update on public."erpRecords" for each row execute function app.touch();
create trigger touch before insert or update on public."externalReferences" for each row execute function app.touch();
create trigger touch before insert or update on public."integrationSyncRuns" for each row execute function app.touch();
create trigger touch before insert or update on public."integrationOutbox" for each row execute function app.touch();
create trigger touch before insert or update on public."integrationSettings" for each row execute function app.touch();

-- RLS : lecture par l'administration, AUCUNE écriture cliente (pas de politique d'écriture, pas de droit d'écriture)
do $$
declare t text;
begin
  foreach t in array array['erpRecords', 'externalReferences', 'integrationSyncRuns', 'integrationOutbox', 'integrationSettings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy read_admin on public.%I for select to authenticated using (app.has_perm(''settings.manage''))', t);
  end loop;
end $$;

-- Prise en charge atomique des envois dus (plusieurs exécutions simultanées ne traitent jamais le même élément)
create or replace function public.integration_claim_outbox(p_limit integer) returns setof public."integrationOutbox"
language sql security definer set search_path = '' as $$
  update public."integrationOutbox" o
     set status = 'sending', attempts = o.attempts + 1
   where o.id in (
     select id from public."integrationOutbox"
      where (status in ('pending', 'failed') and "nextRetryAt" <= now())
         -- envoi interrompu (fonction arrêtée en cours de route) : repris après 10 minutes
         or (status = 'sending' and "updatedAt" < now() - interval '10 minutes')
      order by "nextRetryAt"
      limit least(greatest(p_limit, 1), 50)
      for update skip locked)
  returning o.*
$$;
revoke all on function public.integration_claim_outbox(integer) from public, anon, authenticated;
grant execute on function public.integration_claim_outbox(integer) to service_role;
