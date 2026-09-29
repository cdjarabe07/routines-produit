-- ============================================================
-- Notifications et journal d'audit écrits par le serveur.
-- Les clients ne peuvent ni créer de notification pour autrui, ni écrire ou effacer le journal.
-- ============================================================

create or replace function app.notify(p_users text[], p_kind text, p_title text, p_link text) returns void
language plpgsql security definer set search_path = '' as $$
declare me text := app.current_user_id();
begin
  insert into public.notifications ("userId", kind, title, link)
  select distinct u, p_kind, left(p_title, 300), p_link
  from unnest(p_users) u
  where u is not null and u is distinct from me and exists (select 1 from public.users x where x.id = u and x.active);
end $$;

create or replace function app.audit(p_event text, p_resource text, p_id text, p_detail jsonb default '{}') returns void
language sql security definer set search_path = '' as $$
  insert into public."auditLog" ("actorId", event, resource, "resourceId", detail)
  values (app.current_user_id(), p_event, p_resource, p_id, coalesce(p_detail, '{}'))
$$;

/** Invités effectifs d'une réunion : responsable, invités directs, membres actifs des équipes invitées. */
create or replace function app.meeting_invitees(m public.meetings) returns text[]
language sql stable security definer set search_path = '' as $$
  select array(
    select m."organizerId" union select unnest(m."participantIds")
    union select u.id from public.users u where u.active and u."teamId" = any (m."teamIds"))
$$;

create or replace function app.on_change() returns trigger language plpgsql security definer set search_path = '' as $$
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
        where u.active and u.role <> 'admin' and (u."lineId" is null or u."lineId" = r."lineId");
      perform app.notify(users, 'andon_raised', 'Andon ' || new.type || ' — ' || r.name, '/andon/' || new.id);
    elsif new.status <> old.status then
      perform app.audit(case new.status when 'acknowledged' then 'ANDON_ACKNOWLEDGED' when 'in_progress' then 'ANDON_IN_PROGRESS' else 'ANDON_RESOLVED' end,
        'andonAlerts', new.id, jsonb_build_object('from', old.status, 'to', new.status));
    end if;

  when 'anomalies' then
    if tg_op = 'INSERT' then
      perform app.audit('ANOMALY_CREATED', 'anomalies', new.id, jsonb_build_object('severity', new.severity, 'category', new.category));
      if new.severity = 'critical' then
        select array_agg(u.id) into users from public.users u where u.active and u.role in ('line_leader', 'manager');
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
          else (select '/app/routines/' || x."scheduleId" || '/' || x.date from public."routineRuns" x where x.id = new."targetId")
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

do $$
declare t text;
begin
  foreach t in array array['actions', 'andonAlerts', 'anomalies', 'comments', 'schedules', 'routineTemplates', 'routineRuns', 'users', 'settings', 'checklists', 'knowledgeItems']
  loop
    execute format('create trigger on_change after insert or update on public.%I for each row execute function app.on_change()', t);
  end loop;
end $$;
create trigger on_change after insert or update or delete on public.meetings for each row execute function app.on_change();

-- ---------- Fonctions appelables par l'application ----------

/** Connexion : dernière activité et événement d'audit (déclaré par l'application, voir SECURITY_ARCHITECTURE.md §7). */
create or replace function public.record_sign_in() returns void
language plpgsql security definer set search_path = '' as $$
declare me text := app.current_user_id();
begin
  if me is null then raise exception 'Compte inactif ou inconnu' using errcode = '42501'; end if;
  update public.users set "lastSignInAt" = now() where id = me;
  perform app.audit('USER_LOGIN', 'users', me);
end $$;

create or replace function public.record_sign_out() returns void
language sql security definer set search_path = '' as $$
  select app.audit('USER_LOGOUT', 'users', app.current_user_id()) where app.current_user_id() is not null
$$;

/**
 * « Mot de passe oublié » : prévient les administrateurs. Même réponse que le compte existe ou non.
 * Limité à 3 demandes par identifiant et par heure, 30 par heure au total.
 */
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
  insert into public.notifications ("userId", kind, title, link)
  select u.id, 'access_request', 'Mot de passe oublié : ' || target.name || ' demande une réinitialisation', '/admin/utilisateurs?utilisateur=' || target.id
  from public.users u join app.role_permissions rp on rp.role = u.role and rp.permission = 'user.manage' where u.active;
end $$;

revoke all on function public.record_sign_in() from public, anon;
revoke all on function public.record_sign_out() from public, anon;
grant execute on function public.record_sign_in() to authenticated;
grant execute on function public.record_sign_out() to authenticated;
revoke all on function public.request_access_help(text) from public;
grant execute on function public.request_access_help(text) to anon, authenticated;

-- Les fonctions internes ne sont pas appelables directement par l'API (schéma app non exposé),
-- et celles qui écrivent ne sont exécutables que par le serveur.
revoke all on function app.notify(text[], text, text, text) from public, anon, authenticated;
revoke all on function app.audit(text, text, text, jsonb) from public, anon, authenticated;
