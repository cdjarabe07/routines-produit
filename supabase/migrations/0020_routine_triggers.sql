-- Routines déclenchées par un événement (changement de série, démarrage d'OF, changement d'outil…) :
-- une planification « à la demande » n'a pas d'occurrence au calendrier ; chaque déclenchement en crée une,
-- au créneau (heure) du déclenchement. Déclenchement manuel, ou automatique au démarrage d'un ordre de fabrication.

alter table public.schedules drop constraint schedules_recurrence_check;
alter table public.schedules add constraint schedules_recurrence_check
  check (recurrence in ('once', 'daily', 'weekdays', 'weekly', 'monthly', 'on_demand'));
alter table public.schedules
  add column "triggerOn" text check ("triggerOn" in ('order_start')),
  add constraint schedules_trigger_check check ("triggerOn" is null or recurrence = 'on_demand'),
  add constraint schedules_on_demand_slots_check check (recurrence <> 'on_demand' or "everyHours" is null);

create table public."routineTriggers" (
  id text primary key default gen_random_uuid()::text,
  "scheduleId" text not null references public.schedules (id),
  date date not null,
  slot text not null check (slot ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  reason text not null check (char_length(reason) between 2 and 200),
  "orderId" text references public."productionOrders" (id),
  -- Absent pour un déclenchement automatique hors session (intégration ERP)
  "triggeredBy" text references public.users (id),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("scheduleId", date, slot)
);
create index "routineTriggers_date" on public."routineTriggers" (date);

create trigger touch before insert or update on public."routineTriggers" for each row execute function app.touch();
create trigger routine_trigger_rate before insert on public."routineTriggers" for each row
  execute function app.rate_limit('triggeredBy', '30', '10 minutes');

alter table public."routineTriggers" enable row level security;
revoke all on public."routineTriggers" from anon;
grant select, insert on public."routineTriggers" to authenticated;
-- Visible si la planification l'est (la sous-requête applique la RLS de schedules)
create policy read_visible on public."routineTriggers" for select to authenticated
  using (exists (select 1 from public.schedules s where s.id = "scheduleId"));
-- Déclenché aujourd'hui, en son nom, sur une planification à la demande active, par qui exécute, planifie ou pilote la production
create policy trigger_allowed on public."routineTriggers" for insert to authenticated with check (
  "triggeredBy" = app.current_user_id()
  and date = app.today()
  and (app.has_perm('routine.execute') or app.has_perm('schedule.manage') or app.has_perm('production.update'))
  and exists (select 1 from public.schedules s where s.id = "scheduleId" and s.status = 'active' and s.recurrence = 'on_demand')
);

-- Les personnes concernées sont prévenues ; le déclenchement est tracé
create or replace function app.on_routine_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  s record;
  users text[];
begin
  if current_setting('app.seeding', true) = 'on' then return new; end if;
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
revoke all on function app.on_routine_trigger() from public;
create trigger routine_trigger_notify after insert on public."routineTriggers" for each row execute function app.on_routine_trigger();

-- Démarrage d'un ordre de fabrication (application ou ERP) : déclenche les routines prévues à cet effet sur sa ligne
create or replace function app.on_order_start() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  tz text := coalesce((select st.timezone from public.settings st limit 1), 'Europe/Paris');
begin
  if current_setting('app.seeding', true) = 'on' then return new; end if;
  if new.status = 'in_progress' and (tg_op = 'INSERT' or old.status is distinct from 'in_progress') then
    insert into public."routineTriggers" ("scheduleId", date, slot, reason, "orderId", "triggeredBy")
    select s.id, app.today(), to_char(now() at time zone tz, 'HH24:MI'), left('Démarrage OF ' || new.reference, 200), new.id,
           app.current_user_id()
    from public.schedules s
    where s.status = 'active' and s.recurrence = 'on_demand' and s."triggerOn" = 'order_start'
      and (s."lineId" is null or s."lineId" = new."lineId")
    on conflict ("scheduleId", date, slot) do nothing;
  end if;
  return new;
end $$;
revoke all on function app.on_order_start() from public;
create trigger order_start_routines after insert or update of status on public."productionOrders"
  for each row execute function app.on_order_start();

-- Créneau d'une exécution : pour une planification à la demande, il doit correspondre à un déclenchement
create or replace function app.check_run_slot() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  s record;
  start_min integer;
  slot_min integer;
begin
  select time, recurrence, "everyHours", "endTime" into s from public.schedules where id = new."scheduleId";
  if s.recurrence = 'on_demand' then
    if new.slot is null or not exists (
      select 1 from public."routineTriggers" t where t."scheduleId" = new."scheduleId" and t.date = new.date and t.slot = new.slot
    ) then
      raise exception 'Aucun déclenchement pour ce créneau' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.slot is null then
    if s."everyHours" is not null then
      raise exception 'Créneau manquant pour une planification répétée dans la journée' using errcode = '23514';
    end if;
    return new;
  end if;
  if s."everyHours" is null or new.slot < s.time or new.slot > s."endTime" then
    raise exception 'Créneau hors de la planification' using errcode = '23514';
  end if;
  start_min := split_part(s.time, ':', 1)::integer * 60 + split_part(s.time, ':', 2)::integer;
  slot_min := split_part(new.slot, ':', 1)::integer * 60 + split_part(new.slot, ':', 2)::integer;
  if (slot_min - start_min) % (s."everyHours" * 60) <> 0 then
    raise exception 'Créneau hors de la planification' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Notification de commentaire sur une exécution : le lien mène au bon créneau (fonction reprise de 0013, seul ce lien change)
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
        where u.active and u.role <> 'admin' and (u."lineId" is null or u."lineId" = r."lineId");
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
        -- Invités déjà prévenus : informés d'un changement de date, d'heure ou de lieu
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
