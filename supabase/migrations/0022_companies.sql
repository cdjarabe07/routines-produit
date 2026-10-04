-- ============================================================
-- Plusieurs entreprises clientes dans une même base : séparation stricte des données.
-- - public.companies : une ligne par entreprise cliente.
-- - Chaque table métier porte "companyId". Le serveur le renseigne lui-même à la création
--   (entreprise du compte connecté, ou entreprise fixée par une fonction serveur) et il ne change jamais.
-- - Une politique RESTRICTIVE par table impose "companyId" = entreprise du compte connecté : elle s'ajoute
--   (ET logique) aux politiques existantes, qui restent inchangées.
-- - Les fonctions serveur qui lisent sans RLS (SECURITY DEFINER) filtrent désormais par entreprise.
-- - Un compte (email) appartient à une seule entreprise.
-- Les données existantes et la configuration sont rattachées à l'entreprise « demo ».
-- ============================================================

create table public.companies (
  id text primary key default gen_random_uuid()::text,
  name text not null check (char_length(name) between 1 and 120),
  sector text not null default 'generic'
    check (sector in ('generic', 'automotive', 'plastics', 'machining', 'food', 'electronics')),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create trigger touch before insert or update on public.companies for each row execute function app.touch();
alter table public.companies enable row level security;
revoke all on public.companies from anon, authenticated;
grant select on public.companies to authenticated;

-- Entreprise de démonstration (environnement réinitialisable)
insert into public.companies (id, name, sector) values ('demo', 'Atelier de démonstration', 'automotive');

-- 1. Colonne "companyId" sur chaque table métier (données existantes : entreprise « demo »)
do $$
declare
  t text;
  tenant text[] := array['workshops', 'lines', 'workstations', 'teams', 'users', 'presence', 'leaves', 'checklists', 'routineTemplates',
    'schedules', 'routineRuns', 'actions', 'comments', 'anomalies', 'andonAlerts', 'sequenceTemplates', 'sequenceRuns', 'productionOrders',
    'materialStocks', 'stockMovements', 'gembaWalks', 'qualityChecks', 'knowledgeItems', 'favorites', 'meetings', 'handovers',
    'announcements', 'notifications', 'settings', 'auditLog', 'runPhotos', 'routineTriggers', 'erpRecords', 'externalReferences',
    'integrationSyncRuns', 'integrationOutbox', 'integrationSettings', 'errorReports', 'usageDaily'];
begin
  foreach t in array tenant loop
    execute format('alter table public.%I add column "companyId" text references public.companies (id)', t);
    execute format('update public.%I set "companyId" = ''demo'' where "companyId" is null', t);
    -- Journal d'audit : un refus d'accès d'un appelant inconnu n'a pas d'entreprise
    if t <> 'auditLog' then
      execute format('alter table public.%I alter column "companyId" set not null', t);
    end if;
    execute format('create index %I on public.%I ("companyId")', t || '_company', t);
  end loop;
end $$;

-- 2. Fonctions d'entreprise (elles lisent la colonne ajoutée ci-dessus)
/** Entreprise du compte connecté. */
create or replace function app.current_company() returns text
language sql stable security definer set search_path = '' as $$
  select u."companyId" from public.users u where u."authId" = auth.uid() and u.active
$$;

/** Entreprise de l'appel : compte connecté, sinon celle fixée par une fonction serveur (app.company). */
create or replace function app.context_company() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(app.current_company(), nullif(current_setting('app.company', true), ''))
$$;

create policy read_own on public.companies for select to authenticated using (id = app.current_company());

/**
 * Rattachement à l'entreprise, avant toute autre règle (nom « _company » : premier dans l'ordre des déclencheurs).
 * - Compte connecté : l'entreprise du compte, quelle que soit la valeur envoyée.
 * - Fonction serveur : la valeur fournie, ou l'entreprise fixée par app.company ; obligatoire sauf TG_ARGV[0] = 'optional'.
 * - Modification : interdite.
 */
create or replace function app.set_company() returns trigger language plpgsql security definer set search_path = '' as $$
declare c text;
begin
  if tg_op = 'UPDATE' then
    if new."companyId" is distinct from old."companyId" then
      raise exception 'L’entreprise d’un enregistrement ne peut pas être modifiée' using errcode = '42501';
    end if;
    return new;
  end if;
  if auth.uid() is not null then
    c := app.current_company();
    if c is null then raise exception 'Compte inactif ou inconnu' using errcode = '42501'; end if;
    new."companyId" := c;
  else
    new."companyId" := coalesce(new."companyId", nullif(current_setting('app.company', true), ''));
  end if;
  if new."companyId" is null and coalesce(tg_argv[0], '') <> 'optional' then
    raise exception 'Entreprise manquante' using errcode = '23502';
  end if;
  return new;
end $$;
revoke all on function app.set_company() from public, anon, authenticated;

-- 3. Rattachement imposé par le serveur et politique restrictive sur chaque table
do $$
declare
  t text;
  tenant text[] := array['workshops', 'lines', 'workstations', 'teams', 'users', 'presence', 'leaves', 'checklists', 'routineTemplates',
    'schedules', 'routineRuns', 'actions', 'comments', 'anomalies', 'andonAlerts', 'sequenceTemplates', 'sequenceRuns', 'productionOrders',
    'materialStocks', 'stockMovements', 'gembaWalks', 'qualityChecks', 'knowledgeItems', 'favorites', 'meetings', 'handovers',
    'announcements', 'notifications', 'settings', 'auditLog', 'runPhotos', 'routineTriggers', 'erpRecords', 'externalReferences',
    'integrationSyncRuns', 'integrationOutbox', 'integrationSettings', 'errorReports', 'usageDaily'];
begin
  foreach t in array tenant loop
    execute format('create trigger _company before insert or update on public.%I for each row execute function app.set_company(%L)',
      t, case when t = 'auditLog' then 'optional' else '' end);
    execute format('create policy company_isolation on public.%I as restrictive for all to authenticated '
      'using ("companyId" = app.current_company()) with check ("companyId" = app.current_company())', t);
  end loop;
end $$;

-- ---------- Unicités : par entreprise ----------

alter table public.workstations drop constraint workstations_code_key;
alter table public.workstations add constraint workstations_code_key unique ("companyId", code);
alter table public.teams drop constraint teams_name_key;
alter table public.teams add constraint teams_name_key unique ("companyId", name);
alter table public."knowledgeItems" drop constraint "knowledgeItems_code_key";
alter table public."knowledgeItems" add constraint "knowledgeItems_code_key" unique ("companyId", code);

alter table public.settings drop constraint settings_pkey;
alter table public.settings add primary key ("companyId", id);
alter table public."integrationSettings" drop constraint "integrationSettings_pkey";
alter table public."integrationSettings" add primary key ("companyId", id);
alter table public."usageDaily" drop constraint "usageDaily_pkey";
alter table public."usageDaily" add primary key ("companyId", day, route, role);

-- Unicités sans nom explicite (noms générés) : remplacées par leur équivalent par entreprise
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl, pg_get_constraintdef(c.oid) as def
    from pg_constraint c
    where c.contype = 'u' and c.conrelid in ('public."erpRecords"'::regclass, 'public."externalReferences"'::regclass,
      'public."integrationOutbox"'::regclass, 'public."errorReports"'::regclass)
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add unique ("companyId", %s', r.tbl, substring(r.def from 'UNIQUE \((.*)$'));
  end loop;
end $$;
drop index public."integrationSyncRuns_one_running";
create unique index "integrationSyncRuns_one_running" on public."integrationSyncRuns" ("companyId", source) where status = 'running';

-- ---------- Fonctions serveur : filtrage par entreprise ----------

/** Date du jour à l'heure de l'entreprise de l'appel. */
create or replace function app.today() returns date
language sql stable security definer set search_path = '' as $$
  select (now() at time zone coalesce(
    (select s.timezone from public.settings s where s."companyId" = app.context_company() limit 1), 'Europe/Paris'))::date
$$;

/** Notifications : uniquement aux comptes actifs de l'entreprise de l'appel (ou de la personne visée, en contexte serveur). */
create or replace function app.notify(p_users text[], p_kind text, p_title text, p_link text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me text := app.current_user_id();
  c text := app.context_company();
begin
  insert into public.notifications ("userId", kind, title, link, "companyId")
  select distinct x.id, p_kind, left(p_title, 300), p_link, x."companyId"
  from unnest(p_users) u join public.users x on x.id = u
  where u is distinct from me and x.active and (c is null or x."companyId" = c);
end $$;
revoke all on function app.notify(text[], text, text, text) from public, anon, authenticated;

create or replace function app.audit(p_event text, p_resource text, p_id text, p_detail jsonb default '{}') returns void
language sql security definer set search_path = '' as $$
  insert into public."auditLog" ("actorId", event, resource, "resourceId", detail, "companyId")
  values (app.current_user_id(), p_event, p_resource, p_id, coalesce(p_detail, '{}'), app.context_company())
$$;
revoke all on function app.audit(text, text, text, jsonb) from public, anon, authenticated;

/** « Mot de passe oublié » : prévient les administrateurs de l'entreprise du compte concerné. */
create or replace function public.request_access_help(p_identifier text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  ident text := lower(trim(coalesce(p_identifier, '')));
  target public.users;
begin
  if char_length(ident) not between 3 and 254 then return; end if;
  if (select count(*) from app.access_requests where identifier = ident and at > now() - interval '1 hour') >= 3
     or (select count(*) from app.access_requests where at > now() - interval '1 hour') >= 30 then
    return;
  end if;
  insert into app.access_requests (identifier) values (ident);
  select * into target from public.users u where lower(u.email) = ident and u.active;
  if target.id is null then return; end if;
  insert into public.notifications ("userId", kind, title, link, "companyId")
  select u.id, 'access_request', 'Mot de passe oublié : ' || target.name || ' demande une réinitialisation',
         '/admin/utilisateurs?utilisateur=' || target.id, u."companyId"
  from public.users u join app.role_permissions rp on rp.role = u.role and rp.permission = 'user.manage'
  where u.active and u."companyId" = target."companyId";
end $$;
revoke all on function public.request_access_help(text) from public;
grant execute on function public.request_access_help(text) to anon, authenticated;

/** Démarrage d'un OF : routines de démarrage de la même entreprise, à la date et l'heure de cette entreprise. */
create or replace function app.on_order_start() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  tz text := coalesce((select st.timezone from public.settings st where st."companyId" = new."companyId" limit 1), 'Europe/Paris');
begin
  if current_setting('app.seeding', true) = 'on' then return new; end if;
  if new.status = 'in_progress' and (tg_op = 'INSERT' or old.status is distinct from 'in_progress') then
    perform set_config('app.company', new."companyId", true);
    insert into public."routineTriggers" ("scheduleId", date, slot, reason, "orderId", "triggeredBy", "companyId")
    select s.id, (now() at time zone tz)::date, to_char(now() at time zone tz, 'HH24:MI'), left('Démarrage OF ' || new.reference, 200),
           new.id, app.current_user_id(), new."companyId"
    from public.schedules s
    where s."companyId" = new."companyId" and s.status = 'active' and s.recurrence = 'on_demand' and s."triggerOn" = 'order_start'
      and (s."lineId" is null or s."lineId" = new."lineId")
    on conflict ("scheduleId", date, slot) do nothing;
  end if;
  return new;
end $$;

/** Déclenchement : les personnes de l'entreprise sont prévenues (contexte serveur compris). */
create or replace function app.on_routine_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  s record;
  users text[];
begin
  if current_setting('app.seeding', true) = 'on' then return new; end if;
  perform set_config('app.company', new."companyId", true);
  select x."assigneeId", x."teamId", t.title into s
    from public.schedules x join public."routineTemplates" t on t.id = x."routineId" where x.id = new."scheduleId";
  users := case when s."assigneeId" is not null then array[s."assigneeId"]
                else (select array_agg(u.id) from public.users u where u.active and u."teamId" = s."teamId") end;
  perform app.notify(users, 'routine_assigned', 'Routine à réaliser : ' || s.title || ' — ' || new.reason,
    '/app/routines/' || new."scheduleId" || '/' || new.date || '/' || replace(new.slot, ':', ''));
  perform app.audit('ROUTINE_TRIGGERED', 'routineTriggers', new.id,
    jsonb_build_object('scheduleId', new."scheduleId", 'reason', new.reason, 'orderId', new."orderId"));
  return new;
end $$;

-- Mesure d'usage et erreurs : comptées et plafonnées par entreprise
create or replace function public.report_client_error(
  p_message text, p_stack text, p_route text, p_source text, p_version text, p_agent text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  msg text := left(coalesce(nullif(trim(p_message), ''), 'Erreur sans message'), 500);
  rt text := left(coalesce(nullif(trim(p_route), ''), '/'), 200);
  c text := app.current_company();
  d date := app.today();
  fp text;
begin
  if c is null or p_source is null or p_source not in ('window', 'promise', 'react') then return; end if;
  fp := md5(msg || '|' || split_part(coalesce(p_stack, ''), E'\n', 2) || '|' || rt);
  if not exists (select 1 from public."errorReports" e where e."companyId" = c and e.day = d and e.fingerprint = fp)
     and (select count(*) from public."errorReports" e where e."companyId" = c and e.day = d) >= 200 then
    return;
  end if;
  insert into public."errorReports" ("companyId", day, fingerprint, message, stack, route, source, role, "appVersion", "userAgent")
  values (c, d, fp, msg, left(p_stack, 4000), rt, p_source, app.user_role(), left(p_version, 40), left(p_agent, 300))
  on conflict ("companyId", day, fingerprint) do update
    set count = least(public."errorReports".count + 1, 1000000), "lastAt" = now(), "updatedAt" = now();
end $$;

create or replace function public.track_screen_view(p_route text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r text := app.user_role();
  c text := app.current_company();
  d date := app.today();
begin
  if r is null or c is null or p_route is null or p_route !~ '^/[A-Za-z0-9/:_-]{0,150}$' then return; end if;
  if not exists (select 1 from public."usageDaily" u where u."companyId" = c and u.day = d and u.route = p_route and u.role = r)
     and (select count(*) from public."usageDaily" u where u."companyId" = c and u.day = d) >= 1000 then
    return;
  end if;
  insert into public."usageDaily" ("companyId", day, route, role, views) values (c, d, p_route, r, 1)
  on conflict ("companyId", day, route, role) do update set views = least(public."usageDaily".views + 1, 1000000), "updatedAt" = now();
end $$;

-- Notifications d'Andon et d'anomalie critique : uniquement dans l'entreprise concernée
-- (fonction reprise de 0020, seuls les deux filtres « companyId » sont ajoutés)
create or replace function app.on_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  users text[];
begin
  if current_setting('app.seeding', true) = 'on' then return coalesce(new, old); end if;

  case tg_table_name
  when 'actions' then
    if tg_op = 'INSERT' then
      perform app.audit('CORRECTIVE_ACTION_CREATED', 'actions', new.id, jsonb_build_object('source', new.source, 'assigneeId', new."assigneeId"));
      perform app.notify(array[new."assigneeId", new."backupId"], 'action_assigned', 'Nouvelle action : ' || new.title, '/actions/' || new.id);
    else
      perform app.audit('CORRECTIVE_ACTION_UPDATED', 'actions', new.id,
        jsonb_build_object('status', new.status, 'previousStatus', old.status, 'changed', app.changed_columns(to_jsonb(old), to_jsonb(new))));
      if new."assigneeId" is distinct from old."assigneeId" then
        perform app.notify(array[new."assigneeId"], 'action_assigned', 'Action réassignée : ' || new.title, '/actions/' || new.id);
      end if;
    end if;

  when 'andonAlerts' then
    if tg_op = 'INSERT' then
      perform app.audit('ANDON_CREATED', 'andonAlerts', new.id, jsonb_build_object('workstationId', new."workstationId", 'type', new.type, 'urgency', new.urgency));
      select w.name, w."lineId" into r from public.workstations w where w.id = new."workstationId";
      select array_agg(u.id) into users from public.users u join app.role_permissions rp on rp.role = u.role and rp.permission = 'andon.respond'
        where u.active and u.role <> 'admin' and u."companyId" = new."companyId" and (u."lineId" is null or u."lineId" = r."lineId");
      perform app.notify(users, 'andon_raised',
        'Andon ' || case new.type when 'quality' then 'qualité' when 'equipment' then 'équipement' when 'material' then 'matière'
                                  when 'safety' then 'sécurité' else new.type end || ' — ' || r.name,
        '/andon/' || new.id);
    elsif new.status <> old.status then
      perform app.audit(case new.status when 'acknowledged' then 'ANDON_ACKNOWLEDGED' when 'in_progress' then 'ANDON_IN_PROGRESS' else 'ANDON_RESOLVED' end,
        'andonAlerts', new.id, jsonb_build_object('from', old.status, 'to', new.status));
    end if;

  when 'anomalies' then
    if tg_op = 'INSERT' then
      perform app.audit('ANOMALY_CREATED', 'anomalies', new.id, jsonb_build_object('severity', new.severity, 'category', new.category));
      if new.severity = 'critical' then
        select array_agg(u.id) into users from public.users u
          where u.active and u.role in ('line_leader', 'manager') and u."companyId" = new."companyId";
        perform app.notify(users, 'anomaly_reported', 'Anomalie critique : ' || left(new.description, 80), '/anomalies/' || new.id);
      end if;
    else
      perform app.audit('ANOMALY_UPDATED', 'anomalies', new.id, jsonb_build_object('status', new.status, 'changed', app.changed_columns(to_jsonb(old), to_jsonb(new))));
    end if;

  when 'comments' then
    if tg_op = 'INSERT' then
      users := case new."targetType"
        when 'action' then (select array[a."assigneeId", a."backupId", a."createdBy"] from public.actions a where a.id = new."targetId")
        when 'anomaly' then (select array[a."reportedBy", a."closedBy"] from public.anomalies a where a.id = new."targetId")
        when 'andonAlert' then (select array[a."raisedBy", a."acknowledgedBy"] from public."andonAlerts" a where a.id = new."targetId")
        when 'routineRun' then (select array[a."assigneeId"] from public."routineRuns" a where a.id = new."targetId")
        when 'meeting' then (select array[a."organizerId"] from public.meetings a where a.id = new."targetId")
        when 'gembaWalk' then (select array[a."leaderId"] from public."gembaWalks" a where a.id = new."targetId")
      end;
      perform app.notify(users, 'comment_added', 'Nouveau commentaire : ' || left(new.text, 80),
        case new."targetType"
          when 'action' then '/actions/' || new."targetId" when 'anomaly' then '/anomalies/' || new."targetId"
          when 'andonAlert' then '/andon/' || new."targetId" when 'meeting' then '/reunions/' || new."targetId"
          when 'gembaWalk' then '/gemba/' || new."targetId"
          else (select '/app/routines/' || x."scheduleId" || '/' || x.date || coalesce('/' || replace(x.slot, ':', ''), '')
                from public."routineRuns" x where x.id = new."targetId")
        end);
    end if;

  when 'schedules' then
    perform app.audit(case when tg_op = 'INSERT' then 'SCHEDULE_CREATED' when new.status = 'cancelled' and old.status = 'active' then 'SCHEDULE_CANCELLED' else 'SCHEDULE_UPDATED' end,
      'schedules', new.id, jsonb_build_object('routineId', new."routineId", 'assigneeId', new."assigneeId", 'teamId', new."teamId"));
    if new.status = 'active' then
      users := case when new."assigneeId" is not null then array[new."assigneeId"]
                    else (select array_agg(u.id) from public.users u where u.active and u."teamId" = new."teamId") end;
      perform app.notify(users, 'routine_assigned',
        (case when tg_op = 'INSERT' then 'Routine planifiée : ' else 'Planification modifiée : ' end)
          || (select t.title from public."routineTemplates" t where t.id = new."routineId") || ' à ' || new.time,
        '/app/routines');
    end if;

  when 'meetings' then
    if tg_op = 'INSERT' then
      perform app.audit('MEETING_CREATED', 'meetings', new.id, jsonb_build_object('type', new.type, 'date', new.date));
      perform app.notify(app.meeting_invitees(new), 'meeting_invited', 'Invitation : ' || new.title || ' — ' || to_char(new.date, 'DD/MM/YYYY') || ' ' || new."startTime", '/reunions/' || new.id);
    elsif tg_op = 'DELETE' then
      perform app.audit('MEETING_DELETED', 'meetings', old.id, jsonb_build_object('title', old.title, 'date', old.date));
      return old;
    else
      if app.changed_columns(to_jsonb(old), to_jsonb(new)) && array['title', 'date', 'startTime', 'endTime', 'location', 'participantIds', 'teamIds', 'status', 'organizerId'] then
        perform app.audit('MEETING_UPDATED', 'meetings', new.id, jsonb_build_object('changed', app.changed_columns(to_jsonb(old), to_jsonb(new))));
      end if;
      if new.status = 'cancelled' and old.status <> 'cancelled' then
        perform app.notify(app.meeting_invitees(new), 'meeting_invited', 'Annulée : ' || new.title || ' — ' || to_char(new.date, 'DD/MM/YYYY'), '/reunions/' || new.id);
      else
        perform app.notify(array(select unnest(app.meeting_invitees(new)) except select unnest(app.meeting_invitees(old))),
          'meeting_invited', 'Invitation : ' || new.title || ' — ' || to_char(new.date, 'DD/MM/YYYY') || ' ' || new."startTime", '/reunions/' || new.id);
        if new.date is distinct from old.date or new."startTime" is distinct from old."startTime" or new.location is distinct from old.location then
          perform app.notify(array(select unnest(app.meeting_invitees(new)) intersect select unnest(app.meeting_invitees(old))),
            'meeting_invited', 'Réunion modifiée : ' || new.title || ' — ' || to_char(new.date, 'DD/MM/YYYY') || ' ' || new."startTime", '/reunions/' || new.id);
        end if;
      end if;
    end if;

  when 'routineTemplates' then
    perform app.audit(case when tg_op = 'INSERT' then 'ROUTINE_CREATED' when old.active and not new.active then 'ROUTINE_ARCHIVED' else 'ROUTINE_UPDATED' end,
      'routineTemplates', new.id, jsonb_build_object('title', new.title));

  when 'routineRuns' then
    if tg_op = 'INSERT' then
      perform app.audit('ROUTINE_STARTED', 'routineRuns', new.id, jsonb_build_object('scheduleId', new."scheduleId", 'date', new.date));
    elsif new."completedAt" is not null and old."completedAt" is null then
      perform app.audit('ROUTINE_COMPLETED', 'routineRuns', new.id, jsonb_build_object('scheduleId', new."scheduleId", 'date', new.date));
    end if;

  when 'users' then
    if tg_op = 'INSERT' then
      perform app.audit('USER_CREATED', 'users', new.id, jsonb_build_object('role', new.role, 'email', new.email));
    else
      if new.role <> old.role then perform app.audit('USER_ROLE_CHANGED', 'users', new.id, jsonb_build_object('from', old.role, 'to', new.role)); end if;
      if old.active and not new.active then perform app.audit('USER_DEACTIVATED', 'users', new.id);
      elsif not old.active and new.active then perform app.audit('USER_REACTIVATED', 'users', new.id);
      end if;
      if app.changed_columns(to_jsonb(old), to_jsonb(new)) && array['name', 'email', 'teamId', 'lineId', 'workstationId', 'shift'] then
        perform app.audit('USER_UPDATED', 'users', new.id, jsonb_build_object('changed', app.changed_columns(to_jsonb(old), to_jsonb(new))));
      end if;
    end if;

  when 'settings' then
    perform app.audit('SETTINGS_CHANGED', 'settings', new.id, jsonb_build_object('changed', app.changed_columns(to_jsonb(old), to_jsonb(new))));

  when 'checklists' then
    perform app.audit(case when tg_op = 'INSERT' then 'CHECKLIST_CREATED' else 'CHECKLIST_UPDATED' end, 'checklists', new.id);

  when 'knowledgeItems' then
    perform app.audit(case when tg_op = 'INSERT' then 'DOCUMENT_CREATED' else 'DOCUMENT_UPDATED' end, 'knowledgeItems', new.id, jsonb_build_object('status', new.status));

  else null;
  end case;
  return coalesce(new, old);
end $$;

-- ---------- Fonctions réservées au serveur (clé de service) ----------

/** Entreprise d'un compte d'authentification (fonctions Edge). */
create or replace function public.auth_user_company(p_auth uuid) returns text
language sql stable security definer set search_path = '' as $$
  select u."companyId" from public.users u where u."authId" = p_auth and u.active
$$;
revoke all on function public.auth_user_company(uuid) from public, anon, authenticated;
grant execute on function public.auth_user_company(uuid) to service_role;

/** Nouvelle entreprise cliente : entreprise, paramètres et réglages d'intégration (le premier administrateur est créé par la fonction Edge). */
create or replace function public.create_company(p_name text, p_sector text, p_timezone text default 'Europe/Paris') returns text
language plpgsql security definer set search_path = '' as $$
declare c text;
begin
  insert into public.companies (name, sector) values (trim(p_name), coalesce(p_sector, 'generic')) returning id into c;
  perform set_config('app.company', c, true);
  insert into public.settings ("companyId", id, "plantName", "andonEscalationMinutes", "routineLateToleranceMinutes", timezone, environment)
  values (c, 'app', trim(p_name), 10, 120, coalesce(nullif(p_timezone, ''), 'Europe/Paris'), 'production');
  insert into public."integrationSettings" ("companyId", id) values (c, 'erp');
  insert into public."auditLog" ("companyId", event, resource, "resourceId", detail)
  values (c, 'COMPANY_CREATED', 'companies', c, jsonb_build_object('sector', p_sector));
  return c;
end $$;
revoke all on function public.create_company(text, text, text) from public, anon, authenticated;
grant execute on function public.create_company(text, text, text) to service_role;

/** Jeu de démonstration : limité à l'entreprise « demo », jamais en production. Le journal d'audit n'est jamais effacé. */
create or replace function public.seed_demo(payload jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare c text := 'demo';
begin
  if exists (select 1 from public.settings where "companyId" = c and environment = 'production') then
    raise exception 'Réinitialisation interdite : environnement de production' using errcode = '42501';
  end if;
  perform set_config('app.seeding', 'on', true);
  perform set_config('app.company', c, true);

  delete from public.notifications where "companyId" = c; delete from public.favorites where "companyId" = c;
  delete from public.comments where "companyId" = c; delete from public."stockMovements" where "companyId" = c;
  delete from public."qualityChecks" where "companyId" = c; delete from public.actions where "companyId" = c;
  delete from public.anomalies where "companyId" = c; delete from public."runPhotos" where "companyId" = c;
  delete from public."routineRuns" where "companyId" = c; delete from public."routineTriggers" where "companyId" = c;
  delete from public.schedules where "companyId" = c; delete from public."sequenceRuns" where "companyId" = c;
  delete from public."andonAlerts" where "companyId" = c; delete from public.meetings where "companyId" = c;
  delete from public.handovers where "companyId" = c; delete from public.announcements where "companyId" = c;
  delete from public.presence where "companyId" = c; delete from public.leaves where "companyId" = c;
  delete from public."gembaWalks" where "companyId" = c; delete from public."productionOrders" where "companyId" = c;
  delete from public."materialStocks" where "companyId" = c; delete from public."knowledgeItems" where "companyId" = c;
  delete from public."routineTemplates" where "companyId" = c; delete from public."sequenceTemplates" where "companyId" = c;
  delete from public.checklists where "companyId" = c;

  insert into public.workshops select * from jsonb_populate_recordset(null::public.workshops, payload -> 'workshops')
    on conflict (id) do update set name = excluded.name;
  insert into public.lines select * from jsonb_populate_recordset(null::public.lines, payload -> 'lines')
    on conflict (id) do update set code = excluded.code, name = excluded.name, description = excluded.description, "workshopId" = excluded."workshopId";
  insert into public.workstations select * from jsonb_populate_recordset(null::public.workstations, payload -> 'workstations')
    on conflict (id) do update set code = excluded.code, name = excluded.name, process = excluded.process, "lineId" = excluded."lineId",
      "mapX" = excluded."mapX", "mapY" = excluded."mapY", active = excluded.active;
  update public.teams set "leaderId" = null where "companyId" = c;
  insert into public.teams (id, name, shift, "lineId", "leaderId", active, "createdAt", "updatedAt", "companyId")
    select id, name, shift, "lineId", null, active, "createdAt", "updatedAt", c
    from jsonb_populate_recordset(null::public.teams, payload -> 'teams')
    on conflict (id) do update set name = excluded.name, shift = excluded.shift, "lineId" = excluded."lineId", active = excluded.active;
  insert into public.users select * from jsonb_populate_recordset(null::public.users, payload -> 'users')
    on conflict (id) do update set name = excluded.name, email = excluded.email, role = excluded.role, "lineId" = excluded."lineId",
      "zoneLabel" = excluded."zoneLabel", shift = excluded.shift, "teamId" = excluded."teamId", "workstationId" = excluded."workstationId",
      active = excluded.active, "authId" = coalesce(public.users."authId", excluded."authId");
  update public.teams t set "leaderId" = x."leaderId"
    from jsonb_populate_recordset(null::public.teams, payload -> 'teams') x where x.id = t.id and t."companyId" = c;
  insert into public.settings select * from jsonb_populate_recordset(null::public.settings, payload -> 'settings')
    on conflict ("companyId", id) do update set "plantName" = excluded."plantName", "andonEscalationMinutes" = excluded."andonEscalationMinutes",
      "routineLateToleranceMinutes" = excluded."routineLateToleranceMinutes", environment = 'demo';

  insert into public.checklists select * from jsonb_populate_recordset(null::public.checklists, payload -> 'checklists');
  insert into public."routineTemplates" select * from jsonb_populate_recordset(null::public."routineTemplates", payload -> 'routineTemplates');
  insert into public.schedules select * from jsonb_populate_recordset(null::public.schedules, payload -> 'schedules');
  insert into public."routineTriggers" select * from jsonb_populate_recordset(null::public."routineTriggers", payload -> 'routineTriggers');
  insert into public."routineRuns" select * from jsonb_populate_recordset(null::public."routineRuns", payload -> 'routineRuns');
  insert into public."sequenceTemplates" select * from jsonb_populate_recordset(null::public."sequenceTemplates", payload -> 'sequenceTemplates');
  insert into public."sequenceRuns" select * from jsonb_populate_recordset(null::public."sequenceRuns", payload -> 'sequenceRuns');
  insert into public."knowledgeItems" select * from jsonb_populate_recordset(null::public."knowledgeItems", payload -> 'knowledgeItems');
  insert into public.anomalies select * from jsonb_populate_recordset(null::public.anomalies, payload -> 'anomalies');
  insert into public.actions select * from jsonb_populate_recordset(null::public.actions, payload -> 'actions');
  insert into public."andonAlerts" select * from jsonb_populate_recordset(null::public."andonAlerts", payload -> 'andonAlerts');
  insert into public.comments select * from jsonb_populate_recordset(null::public.comments, payload -> 'comments');
  insert into public."productionOrders" select * from jsonb_populate_recordset(null::public."productionOrders", payload -> 'productionOrders');
  insert into public."materialStocks" select * from jsonb_populate_recordset(null::public."materialStocks", payload -> 'materialStocks');
  insert into public."stockMovements" select * from jsonb_populate_recordset(null::public."stockMovements", payload -> 'stockMovements');
  insert into public."gembaWalks" select * from jsonb_populate_recordset(null::public."gembaWalks", payload -> 'gembaWalks');
  insert into public."qualityChecks" select * from jsonb_populate_recordset(null::public."qualityChecks", payload -> 'qualityChecks');
  insert into public.favorites select * from jsonb_populate_recordset(null::public.favorites, payload -> 'favorites');
  insert into public.meetings select * from jsonb_populate_recordset(null::public.meetings, payload -> 'meetings');
  insert into public.handovers select * from jsonb_populate_recordset(null::public.handovers, payload -> 'handovers');
  insert into public.announcements select * from jsonb_populate_recordset(null::public.announcements, payload -> 'announcements');
  insert into public.presence select * from jsonb_populate_recordset(null::public.presence, payload -> 'presence');
  insert into public.leaves select * from jsonb_populate_recordset(null::public.leaves, payload -> 'leaves');
  insert into public.notifications select * from jsonb_populate_recordset(null::public.notifications, payload -> 'notifications');

  perform set_config('app.seeding', 'off', true);
  insert into public."auditLog" ("companyId", "actorId", event, resource, detail)
  values (c, payload ->> 'actorId', 'DEMO_ENVIRONMENT_RESET', 'settings', jsonb_build_object('users', jsonb_array_length(payload -> 'users')));
end $$;
revoke all on function public.seed_demo(jsonb) from public, anon, authenticated;
grant execute on function public.seed_demo(jsonb) to service_role;
