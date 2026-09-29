-- ============================================================
-- Sécurité : identité, permissions, périmètre, RLS, règles d'écriture.
-- Le navigateur n'est pas fiable : toute décision d'accès est prise ici.
-- ============================================================

grant usage on schema app to authenticated, anon;

-- ---------- Identité de l'appelant ----------

create or replace function app.current_user_id() returns text
language sql stable security definer set search_path = '' as $$
  select u.id from public.users u where u."authId" = auth.uid() and u.active
$$;

create or replace function app.user_role() returns text
language sql stable security definer set search_path = '' as $$
  select u.role from public.users u where u."authId" = auth.uid() and u.active
$$;

create or replace function app.current_team() returns text
language sql stable security definer set search_path = '' as $$
  select u."teamId" from public.users u where u."authId" = auth.uid() and u.active
$$;

create or replace function app.current_line() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(u."lineId", t."lineId")
  from public.users u left join public.teams t on t.id = u."teamId"
  where u."authId" = auth.uid() and u.active
$$;

create or replace function app.has_perm(p text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.users u join app.role_permissions rp on rp.role = u.role
    where u."authId" = auth.uid() and u.active and rp.permission = p
  )
$$;

create or replace function app.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.current_user_id() is not null
$$;

/** Périmètre de supervision : site, line, team ou self (docs/SECURITY_ARCHITECTURE.md §4). */
create or replace function app.scope_level() returns text
language sql stable security definer set search_path = '' as $$
  select case app.user_role()
    when 'admin' then 'site' when 'manager' then 'site' when 'quality' then 'site'
    when 'line_leader' then 'line' when 'hancho' then 'team' when 'operator' then 'self'
  end
$$;

/** Une personne est-elle dans le périmètre de supervision de l'appelant ? */
create or replace function app.user_in_scope(target text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case app.scope_level()
    when 'site' then true
    when 'line' then exists (
      select 1 from public.users u left join public.teams t on t.id = u."teamId"
      where u.id = target and coalesce(u."lineId", t."lineId") = app.current_line())
    when 'team' then exists (select 1 from public.users u where u.id = target and u."teamId" = app.current_team())
    when 'self' then target = app.current_user_id()
    else false
  end
$$;

/** Une planification est-elle dans le périmètre de supervision de l'appelant ? */
create or replace function app.schedule_in_scope(p_assignee text, p_team text, p_line text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case app.scope_level()
    when 'site' then true
    when 'line' then p_line = app.current_line()
      or (p_assignee is not null and app.user_in_scope(p_assignee))
      or exists (select 1 from public.teams t where t.id = p_team and t."lineId" = app.current_line())
    when 'team' then p_team = app.current_team() or (p_assignee is not null and app.user_in_scope(p_assignee))
    else false
  end
$$;

/** Date du jour à l'heure de l'atelier. */
create or replace function app.today() returns date
language sql stable security definer set search_path = '' as $$
  select (now() at time zone coalesce((select s.timezone from public.settings s limit 1), 'Europe/Paris'))::date
$$;

-- ---------- Règles génériques d'écriture ----------

/** Horodatage imposé par le serveur : un client ne peut ni antidater ni modifier la date de création (intégrité des indicateurs). */
create or replace function app.touch() returns trigger language plpgsql set search_path = '' as $$
begin
  if current_setting('app.seeding', true) = 'on' then
    new."createdAt" := coalesce(new."createdAt", now());
    new."updatedAt" := coalesce(new."updatedAt", new."createdAt");
    return new;
  end if;
  new."updatedAt" := now();
  if tg_op = 'INSERT' then new."createdAt" := now(); else new."createdAt" := old."createdAt"; end if;
  return new;
end $$;

/** Colonnes modifiées par une mise à jour (hors horodatage technique). */
create or replace function app.changed_columns(o jsonb, n jsonb) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(k.key), '{}') from jsonb_each(n) k
  where k.key <> 'updatedAt' and (o -> k.key) is distinct from k.value
$$;

/**
 * Sans la permission TG_ARGV[0], seules les colonnes TG_ARGV[1..] peuvent changer.
 * Utilisé pour les personnes concernées par une ressource (responsable d'action, organisateur de réunion…).
 */
create or replace function app.restrict_columns() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  allowed text[] := tg_argv[1:];
  col text;
begin
  if current_setting('app.seeding', true) = 'on' or auth.uid() is null then return new; end if;
  if app.has_perm(tg_argv[0]) then return new; end if;
  foreach col in array app.changed_columns(to_jsonb(old), to_jsonb(new)) loop
    if not col = any(allowed) then
      raise exception 'Modification non autorisée du champ %', col using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;

/** Colonnes jamais modifiables après création (identité, rattachements, auteur). */
create or replace function app.freeze_columns() returns trigger language plpgsql security definer set search_path = '' as $$
declare col text;
begin
  if current_setting('app.seeding', true) = 'on' or auth.uid() is null then return new; end if;
  foreach col in array tg_argv loop
    if (to_jsonb(old) -> col) is distinct from (to_jsonb(new) -> col) then
      raise exception 'Le champ % ne peut pas être modifié', col using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;

/** Limitation de débit par utilisateur : TG_ARGV = colonne auteur, nombre maximum, fenêtre. */
create or replace function app.rate_limit() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  n integer;
  author text := to_jsonb(new) ->> tg_argv[0];
begin
  if current_setting('app.seeding', true) = 'on' or author is null then return new; end if;
  execute format('select count(*) from public.%I where %I = $1 and "createdAt" > now() - $2::interval', tg_table_name, tg_argv[0])
    into n using author, tg_argv[2];
  if n >= tg_argv[1]::integer then
    raise exception 'Trop de créations en peu de temps. Réessayez dans quelques minutes.' using errcode = '54000';
  end if;
  return new;
end $$;

-- ---------- Règles métier serveur ----------

/** Andon : ordre des statuts et auteur de chaque étape imposés. */
create or replace function app.andon_rules() returns trigger language plpgsql security definer set search_path = '' as $$
declare me text := app.current_user_id();
begin
  if current_setting('app.seeding', true) = 'on' or auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    if new.status <> 'active' or new."acknowledgedBy" is not null or new."resolvedBy" is not null then
      raise exception 'Un Andon est créé au statut « Nouveau »' using errcode = '22023';
    end if;
    new."raisedAt" := now();
    if exists (select 1 from public."andonAlerts" a where a."workstationId" = new."workstationId" and a.type = new.type and a.status <> 'resolved') then
      raise exception 'Un Andon de ce type est déjà en cours sur ce poste.' using errcode = '23505';
    end if;
    return new;
  end if;
  if old.status = 'resolved' then raise exception 'Un Andon résolu ne peut plus être modifié' using errcode = '42501'; end if;
  if (old.status, new.status) not in (('active', 'active'), ('active', 'acknowledged'), ('active', 'in_progress'), ('active', 'resolved'),
      ('acknowledged', 'acknowledged'), ('acknowledged', 'in_progress'), ('acknowledged', 'resolved'), ('in_progress', 'in_progress'), ('in_progress', 'resolved')) then
    raise exception 'Transition de statut non autorisée' using errcode = '22023';
  end if;
  if new."acknowledgedBy" is distinct from old."acknowledgedBy" and new."acknowledgedBy" <> me then
    raise exception 'La prise en charge est enregistrée au nom de l’utilisateur connecté' using errcode = '42501';
  end if;
  if new.status = 'resolved' and (new."resolvedBy" is distinct from me or coalesce(trim(new."rootCause"), '') = '' or coalesce(trim(new.resolution), '') = '') then
    raise exception 'La résolution exige la cause et l’action réalisée, au nom de l’utilisateur connecté' using errcode = '22023';
  end if;
  return new;
end $$;

/** Exécution d'une routine : créée pour une occurrence affectée, du jour ; terminée seulement si les tâches obligatoires sont faites. */
create or replace function app.routine_run_rules() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  me text := app.current_user_id();
  tpl jsonb;
  task jsonb;
  item jsonb;
  checks jsonb;
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
      continue when not coalesce((task ->> 'required')::boolean, true);
      if new.results ? (task ->> 'id') then continue; end if;
      checks := coalesce(task -> 'checks', '[]');
      if task ->> 'checklistId' is not null then
        checks := coalesce((select c.items from public.checklists c where c.id = task ->> 'checklistId'), '[]') || checks;
      end if;
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

/** Comptes : l'identité d'authentification ne se modifie pas ; personne ne change son propre rôle ni ne se désactive. */
create or replace function app.user_rules() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('app.seeding', true) = 'on' or auth.uid() is null then return new; end if;
  if new."authId" is distinct from old."authId" then raise exception 'Identifiant d’authentification non modifiable' using errcode = '42501'; end if;
  if old."authId" = auth.uid() and (new.role <> old.role or new.active <> old.active) then
    raise exception 'Vous ne pouvez pas modifier votre propre rôle ni désactiver votre compte' using errcode = '42501';
  end if;
  -- Désactivation : plus aucun renouvellement de session côté Supabase Auth
  if old.active and not new.active and new."authId" is not null then
    update auth.users set banned_until = 'infinity' where id = new."authId";
  elsif not old.active and new.active and new."authId" is not null then
    update auth.users set banned_until = null where id = new."authId";
  end if;
  return new;
end $$;

-- ---------- Déclencheurs ----------

do $$
declare t text;
begin
  foreach t in array array['workshops', 'lines', 'workstations', 'teams', 'users', 'presence', 'leaves', 'checklists', 'routineTemplates', 'schedules',
    'routineRuns', 'actions', 'comments', 'anomalies', 'andonAlerts', 'sequenceTemplates', 'sequenceRuns', 'productionOrders', 'materialStocks',
    'stockMovements', 'gembaWalks', 'qualityChecks', 'knowledgeItems', 'favorites', 'meetings', 'handovers', 'announcements', 'notifications', 'settings', 'auditLog']
  loop
    execute format('create trigger touch before insert or update on public.%I for each row execute function app.touch()', t);
  end loop;
end $$;

create trigger andon_rules before insert or update on public."andonAlerts" for each row execute function app.andon_rules();
create trigger andon_freeze before update on public."andonAlerts" for each row execute function app.freeze_columns('workstationId', 'type', 'raisedBy', 'raisedAt', 'createdAt');
create trigger andon_rate before insert on public."andonAlerts" for each row execute function app.rate_limit('raisedBy', '10', '10 minutes');

create trigger run_rules before insert or update on public."routineRuns" for each row execute function app.routine_run_rules();
create trigger run_freeze before update on public."routineRuns" for each row execute function app.freeze_columns('scheduleId', 'templateId', 'date', 'assigneeId', 'startedAt', 'createdAt');

create trigger action_scope before update on public.actions for each row
  execute function app.restrict_columns('action.manage', 'status', 'blockedReason', 'resolutionNote', 'closedAt');
create trigger action_freeze before update on public.actions for each row execute function app.freeze_columns('createdBy', 'source', 'createdAt');
create trigger action_rate before insert on public.actions for each row execute function app.rate_limit('createdBy', '60', '1 hour');

create trigger anomaly_freeze before update on public.anomalies for each row execute function app.freeze_columns('reportedBy', 'origin', 'createdAt');
create trigger anomaly_rate before insert on public.anomalies for each row execute function app.rate_limit('reportedBy', '20', '10 minutes');

create trigger comment_scope before update on public.comments for each row execute function app.restrict_columns('__none__', 'text', 'editedAt');
create trigger comment_rate before insert on public.comments for each row execute function app.rate_limit('authorId', '30', '5 minutes');

create trigger meeting_scope before update on public.meetings for each row
  execute function app.restrict_columns('meeting.manage', 'agenda', 'attendeeIds', 'minutes', 'status');

create trigger handover_scope before update on public.handovers for each row
  execute function app.restrict_columns('__none__', 'acknowledgedBy', 'acknowledgedAt');

create trigger notification_scope before update on public.notifications for each row execute function app.restrict_columns('__none__', 'readAt');

create trigger user_rules before update on public.users for each row execute function app.user_rules();

create trigger sequence_run_freeze before update on public."sequenceRuns" for each row execute function app.freeze_columns('templateId', 'startedBy', 'date', 'createdAt');
create trigger qc_freeze before update on public."qualityChecks" for each row execute function app.freeze_columns('measuredBy', 'value', 'createdAt');

-- ---------- RLS ----------

do $$
declare t text;
begin
  foreach t in array array['workshops', 'lines', 'workstations', 'teams', 'users', 'presence', 'leaves', 'checklists', 'routineTemplates', 'schedules',
    'routineRuns', 'actions', 'comments', 'anomalies', 'andonAlerts', 'sequenceTemplates', 'sequenceRuns', 'productionOrders', 'materialStocks',
    'stockMovements', 'gembaWalks', 'qualityChecks', 'knowledgeItems', 'favorites', 'meetings', 'handovers', 'announcements', 'notifications', 'settings', 'auditLog']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
alter table app.role_permissions enable row level security;
alter table app.access_requests enable row level security;

-- Référentiels : lecture pour tout compte actif, écriture selon la permission de configuration
create policy read_members on public.workshops for select to authenticated using (app.is_member());
create policy write_admin on public.workshops for all to authenticated using (app.has_perm('workstation.manage')) with check (app.has_perm('workstation.manage'));
create policy read_members on public.lines for select to authenticated using (app.is_member());
create policy write_admin on public.lines for all to authenticated using (app.has_perm('workstation.manage')) with check (app.has_perm('workstation.manage'));
create policy read_members on public.workstations for select to authenticated using (app.is_member());
create policy write_admin on public.workstations for all to authenticated using (app.has_perm('workstation.manage')) with check (app.has_perm('workstation.manage'));
create policy read_members on public.teams for select to authenticated using (app.is_member());
create policy write_admin on public.teams for insert to authenticated with check (app.has_perm('team.manage'));
create policy update_admin on public.teams for update to authenticated using (app.has_perm('team.manage')) with check (app.has_perm('team.manage'));

-- Annuaire : comptes actifs visibles des membres ; comptes désactivés visibles de l'administration
create policy directory on public.users for select to authenticated using (app.is_member() and (active or app.has_perm('user.manage')));
-- Création uniquement par la fonction serveur admin-users (clé de service) ; modification par l'administration
create policy update_admin on public.users for update to authenticated
  using (app.has_perm('user.manage') or (app.has_perm('team.manage')))
  with check (app.has_perm('user.manage') or (app.has_perm('team.manage')));

create policy read_scope on public.presence for select to authenticated
  using ("userId" = app.current_user_id() or (app.has_perm('team.updateStatus') and app.user_in_scope("userId")));
create policy write_scope on public.presence for all to authenticated
  using (app.has_perm('team.updateStatus') and app.user_in_scope("userId"))
  with check (app.has_perm('team.updateStatus') and app.user_in_scope("userId") and "recordedBy" = app.current_user_id());
create policy read_scope on public.leaves for select to authenticated
  using ("userId" = app.current_user_id() or ((app.has_perm('team.updateStatus') or app.has_perm('leave.manage')) and app.user_in_scope("userId")));
create policy write_manage on public.leaves for all to authenticated using (app.has_perm('leave.manage')) with check (app.has_perm('leave.manage'));

create policy read_members on public.checklists for select to authenticated using (app.is_member());
create policy write_manage on public.checklists for all to authenticated using (app.has_perm('checklist.manage')) with check (app.has_perm('checklist.manage'));
create policy read_members on public."routineTemplates" for select to authenticated using (app.is_member());
create policy write_manage on public."routineTemplates" for insert to authenticated with check (app.has_perm('routine.manage'));
create policy update_manage on public."routineTemplates" for update to authenticated using (app.has_perm('routine.manage')) with check (app.has_perm('routine.manage'));
create policy read_members on public."sequenceTemplates" for select to authenticated using (app.is_member());
create policy write_manage on public."sequenceTemplates" for insert to authenticated with check (app.has_perm('sequence.manage'));
create policy update_manage on public."sequenceTemplates" for update to authenticated using (app.has_perm('sequence.manage')) with check (app.has_perm('sequence.manage'));

-- Planification : ce qui m'est affecté, mon périmètre de supervision, ou la gestion de la planification
create policy read_assigned on public.schedules for select to authenticated using (
  app.is_member() and (
    app.has_perm('schedule.manage')
    or "assigneeId" = app.current_user_id()
    or ("teamId" is not null and "teamId" = app.current_team())
    or (app.has_perm('routine.supervise') and app.schedule_in_scope("assigneeId", "teamId", "lineId"))
  ));
create policy write_manage on public.schedules for insert to authenticated with check (app.has_perm('schedule.manage') and "createdBy" = app.current_user_id());
create policy update_manage on public.schedules for update to authenticated using (app.has_perm('schedule.manage')) with check (app.has_perm('schedule.manage'));

-- Exécutions : visibles si la planification l'est (la sous-requête applique la RLS de schedules)
create policy read_visible on public."routineRuns" for select to authenticated
  using (exists (select 1 from public.schedules s where s.id = "scheduleId"));
create policy start_assigned on public."routineRuns" for insert to authenticated with check (
  app.has_perm('routine.execute')
  and "assigneeId" = app.current_user_id()
  and exists (
    select 1 from public.schedules s
    where s.id = "scheduleId" and s."routineId" = "templateId" and s.status = 'active'
      and (s."assigneeId" = app.current_user_id() or (s."teamId" is not null and s."teamId" = app.current_team()))
  ));
create policy execute_own on public."routineRuns" for update to authenticated
  using ("assigneeId" = app.current_user_id() and "completedAt" is null)
  with check ("assigneeId" = app.current_user_id());

-- Actions : personnes concernées, ou gestion des actions
create policy read_involved on public.actions for select to authenticated using (
  app.is_member() and (app.has_perm('action.manage') or app.current_user_id() in ("assigneeId", "backupId", "createdBy")));
create policy create_own on public.actions for insert to authenticated
  with check (app.has_perm('action.create') and "createdBy" = app.current_user_id() and status in ('todo', 'in_progress'));
create policy update_involved on public.actions for update to authenticated
  using (app.has_perm('action.manage') or (app.has_perm('action.update') and app.current_user_id() in ("assigneeId", "backupId", "createdBy")))
  with check (app.has_perm('action.manage') or app.current_user_id() in ("assigneeId", "backupId", "createdBy"));

-- Anomalies : déclarant, ou traitement des anomalies
create policy read_reporter on public.anomalies for select to authenticated
  using (app.is_member() and ("reportedBy" = app.current_user_id() or app.has_perm('anomaly.manage')));
create policy report_own on public.anomalies for insert to authenticated
  with check (app.has_perm('anomaly.create') and "reportedBy" = app.current_user_id() and status = 'open');
create policy manage on public.anomalies for update to authenticated using (app.has_perm('anomaly.manage')) with check (app.has_perm('anomaly.manage'));

-- Andon : tableau d'atelier visible de tous les comptes ; déclenchement au nom de l'appelant ; traitement par les intervenants
create policy read_members on public."andonAlerts" for select to authenticated using (app.is_member());
create policy raise_own on public."andonAlerts" for insert to authenticated
  with check (app.has_perm('andon.raise') and "raisedBy" = app.current_user_id());
create policy respond on public."andonAlerts" for update to authenticated using (app.has_perm('andon.respond')) with check (app.has_perm('andon.respond'));

-- Commentaires : lisibles si la cible l'est ; rédigés au nom de l'appelant
create or replace function app.target_visible(p_type text, p_id text) returns boolean
language sql stable security invoker set search_path = '' as $$
  select case p_type
    when 'action' then exists (select 1 from public.actions x where x.id = p_id)
    when 'anomaly' then exists (select 1 from public.anomalies x where x.id = p_id)
    when 'gembaWalk' then exists (select 1 from public."gembaWalks" x where x.id = p_id)
    when 'andonAlert' then exists (select 1 from public."andonAlerts" x where x.id = p_id)
    when 'routineRun' then exists (select 1 from public."routineRuns" x where x.id = p_id)
    when 'meeting' then exists (select 1 from public.meetings x where x.id = p_id)
    else false
  end
$$;
create policy read_visible on public.comments for select to authenticated using (app.is_member() and app.target_visible("targetType", "targetId"));
create policy write_own on public.comments for insert to authenticated
  with check (app.has_perm('comment.write') and "authorId" = app.current_user_id() and app.target_visible("targetType", "targetId"));
create policy edit_own on public.comments for update to authenticated using ("authorId" = app.current_user_id()) with check ("authorId" = app.current_user_id());

-- Séquences exécutées
create policy read_own on public."sequenceRuns" for select to authenticated
  using ("startedBy" = app.current_user_id() or (app.has_perm('space.supervision') and app.user_in_scope("startedBy")));
create policy start_own on public."sequenceRuns" for insert to authenticated with check (app.has_perm('sequence.run') and "startedBy" = app.current_user_id());
create policy run_own on public."sequenceRuns" for update to authenticated using ("startedBy" = app.current_user_id()) with check ("startedBy" = app.current_user_id());

-- Production
create policy read_view on public."productionOrders" for select to authenticated using (app.has_perm('production.view'));
create policy write_update on public."productionOrders" for all to authenticated using (app.has_perm('production.update')) with check (app.has_perm('production.update'));
create policy read_view on public."materialStocks" for select to authenticated using (app.has_perm('production.view'));
create policy write_update on public."materialStocks" for all to authenticated using (app.has_perm('production.update')) with check (app.has_perm('production.update'));
create policy read_view on public."stockMovements" for select to authenticated using (app.has_perm('production.view'));
create policy record_own on public."stockMovements" for insert to authenticated with check (app.has_perm('production.update') and "by" = app.current_user_id());

-- Gemba, qualité, connaissances
create policy read_gemba on public."gembaWalks" for select to authenticated
  using (app.has_perm('gemba.conduct') or "leaderId" = app.current_user_id() or app.current_user_id() = any ("participantIds"));
create policy write_gemba on public."gembaWalks" for all to authenticated using (app.has_perm('gemba.conduct')) with check (app.has_perm('gemba.conduct'));
create policy read_quality on public."qualityChecks" for select to authenticated
  using (app.has_perm('quality.record') or app.has_perm('reporting.view') or app.has_perm('production.view'));
create policy record_own on public."qualityChecks" for insert to authenticated with check (app.has_perm('quality.record') and "measuredBy" = app.current_user_id());
create policy update_quality on public."qualityChecks" for update to authenticated using (app.has_perm('quality.record')) with check (app.has_perm('quality.record'));
create policy read_published on public."knowledgeItems" for select to authenticated
  using (app.is_member() and (status = 'published' or app.has_perm('knowledge.manage')));
create policy write_manage on public."knowledgeItems" for insert to authenticated with check (app.has_perm('knowledge.manage'));
create policy update_manage on public."knowledgeItems" for update to authenticated using (app.has_perm('knowledge.manage')) with check (app.has_perm('knowledge.manage'));
create policy own on public.favorites for all to authenticated using ("userId" = app.current_user_id()) with check ("userId" = app.current_user_id());

-- Agenda : invités (directs ou via équipe), responsable, supervision, gestion
create policy read_invited on public.meetings for select to authenticated using (
  app.is_member() and (
    app.has_perm('meeting.manage') or app.has_perm('space.supervision')
    or "organizerId" = app.current_user_id()
    or app.current_user_id() = any ("participantIds")
    or (app.current_team() is not null and app.current_team() = any ("teamIds"))
  ));
create policy create_manage on public.meetings for insert to authenticated with check (app.has_perm('meeting.manage'));
create policy update_run on public.meetings for update to authenticated
  using (app.has_perm('meeting.manage') or "organizerId" = app.current_user_id())
  with check (app.has_perm('meeting.manage') or "organizerId" = app.current_user_id());
create policy delete_manage on public.meetings for delete to authenticated using (app.has_perm('meeting.manage') and status in ('planned', 'cancelled'));

create policy read_members on public.handovers for select to authenticated using (app.is_member());
create policy write_own on public.handovers for insert to authenticated with check (app.has_perm('handover.write') and "authorId" = app.current_user_id());
create policy acknowledge on public.handovers for update to authenticated using (app.is_member())
  with check ("acknowledgedBy" = app.current_user_id() or "authorId" = app.current_user_id());

create policy read_members on public.announcements for select to authenticated using (app.is_member());
create policy write_own on public.announcements for insert to authenticated with check (app.has_perm('announcement.write') and "authorId" = app.current_user_id());
create policy update_own on public.announcements for update to authenticated using (app.has_perm('announcement.write')) with check (app.has_perm('announcement.write') and "authorId" = app.current_user_id());

-- Notifications : les miennes ; créées uniquement par le serveur
create policy read_own on public.notifications for select to authenticated using ("userId" = app.current_user_id());
create policy mark_read on public.notifications for update to authenticated using ("userId" = app.current_user_id()) with check ("userId" = app.current_user_id());

create policy read_members on public.settings for select to authenticated using (app.is_member());
create policy write_manage on public.settings for update to authenticated using (app.has_perm('settings.manage')) with check (app.has_perm('settings.manage'));

-- Journal d'audit : lecture par l'administration, aucune écriture cliente
create policy read_admin on public."auditLog" for select to authenticated using (app.has_perm('settings.manage'));
