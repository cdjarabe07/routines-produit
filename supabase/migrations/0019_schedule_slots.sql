-- Planifications répétées dans la journée (toutes les N heures, de « time » à « endTime ») et récurrence mensuelle.
-- Une exécution par créneau : la clé d'unicité devient (planification, date, créneau).

alter table public.schedules
  add column "everyHours" integer check ("everyHours" between 1 and 12),
  add column "endTime" text check ("endTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add constraint schedules_slots_check check (
    ("everyHours" is null and "endTime" is null) or ("everyHours" is not null and "endTime" > time)
  );

alter table public.schedules drop constraint schedules_recurrence_check;
alter table public.schedules add constraint schedules_recurrence_check
  check (recurrence in ('once', 'daily', 'weekdays', 'weekly', 'monthly'));

alter table public."routineRuns"
  add column slot text check (slot ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

alter table public."routineRuns" drop constraint "routineRuns_scheduleId_date_key";
create unique index "routineRuns_occurrence" on public."routineRuns" ("scheduleId", date, coalesce(slot, ''));

-- Le créneau doit appartenir à la planification (et être absent pour une planification à créneau unique)
create or replace function app.check_run_slot() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  s record;
  start_min integer;
  slot_min integer;
begin
  select time, "everyHours", "endTime" into s from public.schedules where id = new."scheduleId";
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
revoke all on function app.check_run_slot() from public;

create trigger run_slot before insert on public."routineRuns" for each row execute function app.check_run_slot();

-- Le créneau ne change plus une fois l'exécution démarrée
drop trigger run_freeze on public."routineRuns";
create trigger run_freeze before update on public."routineRuns" for each row
  execute function app.freeze_columns('scheduleId', 'templateId', 'date', 'slot', 'assigneeId', 'startedAt', 'createdAt');
