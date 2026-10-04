-- Référentiels paramétrables par site (src/app/catalog.ts) : étapes de fabrication, catégories d'anomalie,
-- motifs d'Andon, vocabulaire des rôles, postes horaires. Les listes figées propres au câblage disparaissent :
-- l'application contrôle que les valeurs appartiennent au catalogue du site.

alter table public.settings
  add column if not exists catalog jsonb
  constraint settings_catalog_object check (catalog is null or (jsonb_typeof(catalog) = 'object' and pg_column_size(catalog) <= 65536));

alter table public."productionOrders" drop constraint if exists "productionOrders_stage_check";
alter table public."productionOrders"
  add constraint "productionOrders_stage_key" check (stage ~ '^[a-z0-9_-]{1,40}$');

alter table public.anomalies drop constraint if exists anomalies_category_check;
alter table public.anomalies
  add constraint anomalies_category_key check (category ~ '^[a-z0-9_-]{1,40}$');
