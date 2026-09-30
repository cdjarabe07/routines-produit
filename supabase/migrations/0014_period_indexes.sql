-- Chargement par période (exécutions de routines, contrôles qualité, présence) : index sur les colonnes filtrées.
-- Ajouts seulement ; aucune donnée ni règle modifiée. (comments ("targetType", "targetId") existe déjà : 0001.)
create index if not exists "routineRuns_date" on public."routineRuns" (date);
create index if not exists "qualityChecks_createdAt" on public."qualityChecks" ("createdAt");
create index if not exists "presence_date" on public.presence (date);
