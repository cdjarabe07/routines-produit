-- Checklists enrichies : photo par contrôle, commentaire exigé sur non-conformité, anomalie automatique (côté application),
-- type « lot ». Les photos sont stockées à part : un résultat de contrôle est limité à 20 Ko (0009_run_results.sql).

create table public."runPhotos" (
  id text primary key default gen_random_uuid()::text,
  "runId" text not null references public."routineRuns" (id) on delete cascade,
  key text not null check (char_length(key) between 1 and 200),
  -- Image JPEG ré-encodée par l'application, 2 Mo maximum (comme les photos d'anomalie)
  photo text not null check (photo like 'data:image/jpeg;base64,%' and char_length(photo) <= 2800000),
  "takenBy" text not null references public.users (id),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index "runPhotos_run" on public."runPhotos" ("runId");

create trigger touch before insert or update on public."runPhotos" for each row execute function app.touch();
create trigger run_photo_rate before insert on public."runPhotos" for each row execute function app.rate_limit('takenBy', '60', '10 minutes');

alter table public."runPhotos" enable row level security;
revoke all on public."runPhotos" from anon;
grant select, insert on public."runPhotos" to authenticated;
-- Visible si l'exécution l'est (la sous-requête applique la RLS de routineRuns)
create policy read_visible on public."runPhotos" for select to authenticated
  using (exists (select 1 from public."routineRuns" r where r.id = "runId"));
-- Ajoutée par la personne qui exécute la routine, tant qu'elle n'est pas terminée
create policy add_own on public."runPhotos" for insert to authenticated with check (
  "takenBy" = app.current_user_id()
  and exists (
    select 1 from public."routineRuns" r
    where r.id = "runId" and r."assigneeId" = app.current_user_id() and r."completedAt" is null
  ));

/** Clôture d'une routine : en plus des contrôles obligatoires, chaque contrôle saisi doit être complet
    (photo exigée jointe, commentaire exigé sur non-conformité). Reprise de 0002 avec ces règles. */
create or replace function app.routine_run_rules() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  me text := app.current_user_id();
  tpl jsonb;
  task jsonb;
  item jsonb;
  checks jsonb;
  res jsonb;
begin
  if current_setting('app.seeding', true) = 'on' or auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    if new.date <> app.today() then raise exception 'Seules les routines du jour peuvent être démarrées' using errcode = '22023'; end if;
    if new."completedAt" is not null then raise exception 'Une routine ne peut pas être créée terminée' using errcode = '22023'; end if;
    new."startedAt" := now();
    return new;
  end if;
  if old."completedAt" is not null then raise exception 'Cette routine est terminée : elle n’est plus modifiable' using errcode = '42501'; end if;
  if new."completedAt" is not null then
    if new."completedBy" is distinct from me then raise exception 'Clôture au nom de l’utilisateur connecté uniquement' using errcode = '42501'; end if;
    new."completedAt" := now();
    select r.tasks into tpl from public."routineTemplates" r where r.id = new."templateId";
    for task in select * from jsonb_array_elements(tpl) loop
      checks := coalesce(task -> 'checks', '[]');
      if task ->> 'checklistId' is not null then
        checks := coalesce((select c.items from public.checklists c where c.id = task ->> 'checklistId'), '[]') || checks;
      end if;
      -- Contrôles saisis : complets
      for item in select * from jsonb_array_elements(checks) loop
        res := new.results -> ((task ->> 'id') || '/' || (item ->> 'id'));
        continue when res is null;
        if item ->> 'photo' = 'required' and coalesce(res ->> 'photoId', '') = '' then
          raise exception 'Photo obligatoire manquante : %', item ->> 'label' using errcode = '22023';
        end if;
        if coalesce((item ->> 'commentOnFail')::boolean, false) and res ->> 'status' = 'ko' and coalesce(trim(res ->> 'comment'), '') = '' then
          raise exception 'Commentaire obligatoire manquant (non conforme) : %', item ->> 'label' using errcode = '22023';
        end if;
      end loop;
      -- Tâches obligatoires : faites
      continue when not coalesce((task ->> 'required')::boolean, true);
      if new.results ? (task ->> 'id') then continue; end if;
      if jsonb_array_length(checks) = 0 then
        raise exception 'Tâche obligatoire non faite : %', task ->> 'title' using errcode = '22023';
      end if;
      for item in select * from jsonb_array_elements(checks) loop
        if coalesce((item ->> 'required')::boolean, false) and not new.results ? ((task ->> 'id') || '/' || (item ->> 'id')) then
          raise exception 'Contrôle obligatoire non renseigné : %', item ->> 'label' using errcode = '22023';
        end if;
      end loop;
    end loop;
  end if;
  return new;
end $$;
