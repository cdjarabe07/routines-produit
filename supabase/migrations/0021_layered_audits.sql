-- Audits par couches (LPA) et questions tournantes.
-- - schedules.layer : niveau de l'auditeur (1 terrain, 2 encadrement, 3 direction) ; la même routine d'audit est
--   planifiée à chaque niveau avec sa fréquence (jours ouvrés, hebdomadaire, mensuelle).
-- - routineRuns.sample : contrôles tirés pour l'exécution, par tâche (tâches avec « sampleSize »), fixés au démarrage.
--   Le serveur vérifie l'échantillon à la création, le fige, et n'exige à la clôture que les questions tirées.

alter table public.schedules add column layer integer check (layer between 1 and 3);

alter table public."routineRuns" add column sample jsonb check (sample is null or jsonb_typeof(sample) = 'object');

drop trigger run_freeze on public."routineRuns";
create trigger run_freeze before update on public."routineRuns" for each row
  execute function app.freeze_columns('scheduleId', 'templateId', 'date', 'slot', 'sample', 'assigneeId', 'startedAt', 'createdAt');

-- Règles d'exécution : reprises de 0018, avec la vérification de l'échantillon
create or replace function app.routine_run_rules() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  me text := app.current_user_id();
  tpl jsonb;
  task jsonb;
  item jsonb;
  checks jsonb;
  res jsonb;
  pick jsonb;
  k integer;
begin
  if current_setting('app.seeding', true) = 'on' or auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    if new.date <> app.today() then raise exception 'Seules les routines du jour peuvent être démarrées' using errcode = '22023'; end if;
    if new."completedAt" is not null then raise exception 'Une routine ne peut pas être créée terminée' using errcode = '22023'; end if;
    new."startedAt" := now();
    -- Questions tournantes : l'échantillon couvre exactement N contrôles existants de chaque tâche concernée, et rien d'autre
    select r.tasks into tpl from public."routineTemplates" r where r.id = new."templateId";
    if new.sample is not null and exists (
      select 1 from jsonb_object_keys(new.sample) key where not exists (select 1 from jsonb_array_elements(tpl) t where t ->> 'id' = key)
    ) then
      raise exception 'Questions tournantes invalides' using errcode = '22023';
    end if;
    for task in select * from jsonb_array_elements(tpl) loop
      checks := coalesce(task -> 'checks', '[]');
      if task ->> 'checklistId' is not null then
        checks := coalesce((select c.items from public.checklists c where c.id = task ->> 'checklistId'), '[]') || checks;
      end if;
      k := coalesce((task ->> 'sampleSize')::integer, 0);
      pick := new.sample -> (task ->> 'id');
      if k > 0 and jsonb_array_length(checks) > k then
        if pick is null or jsonb_typeof(pick) <> 'array' or jsonb_array_length(pick) <> k
          or (select count(distinct v) from jsonb_array_elements_text(pick) v) <> k
          or exists (
            select 1 from jsonb_array_elements_text(pick) v
            where not exists (select 1 from jsonb_array_elements(checks) c where c ->> 'id' = v)
          ) then
          raise exception 'Questions tournantes invalides : %', task ->> 'title' using errcode = '22023';
        end if;
      elsif pick is not null then
        raise exception 'Questions tournantes invalides : %', task ->> 'title' using errcode = '22023';
      end if;
    end loop;
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
        -- Questions tournantes : seules les questions tirées pour cette exécution sont exigées
        continue when new.sample ? (task ->> 'id') and not (new.sample -> (task ->> 'id')) ? (item ->> 'id');
        if coalesce((item ->> 'required')::boolean, false) and not new.results ? ((task ->> 'id') || '/' || (item ->> 'id')) then
          raise exception 'Contrôle obligatoire non renseigné : %', item ->> 'label' using errcode = '22023';
        end if;
      end loop;
    end loop;
  end if;
  return new;
end $$;
