-- ============================================================
-- Jeu de démonstration : chargement atomique, réservé au serveur (clé de service).
-- Appelé uniquement par la fonction Edge « demo-seed », qui vérifie l'appelant
-- et refuse toute réinitialisation hors environnement de démonstration.
-- Le journal d'audit n'est JAMAIS effacé.
-- ============================================================

create or replace function public.seed_demo(payload jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.settings where environment = 'production') then
    raise exception 'Réinitialisation interdite : environnement de production' using errcode = '42501';
  end if;
  perform set_config('app.seeding', 'on', true);

  -- Données d'activité : effacées puis rechargées
  delete from public.notifications where true; delete from public.favorites where true; delete from public.comments where true;
  delete from public."stockMovements" where true; delete from public."qualityChecks" where true; delete from public.actions where true;
  delete from public.anomalies where true; delete from public."routineRuns" where true; delete from public.schedules where true;
  delete from public."sequenceRuns" where true; delete from public."andonAlerts" where true; delete from public.meetings where true;
  delete from public.handovers where true; delete from public.announcements where true; delete from public.presence where true;
  delete from public.leaves where true; delete from public."gembaWalks" where true; delete from public."productionOrders" where true;
  delete from public."materialStocks" where true; delete from public."knowledgeItems" where true; delete from public."routineTemplates" where true;
  delete from public."sequenceTemplates" where true; delete from public.checklists where true;

  -- Organisation : mise à jour sans toucher aux comptes d'authentification existants
  insert into public.workshops select * from jsonb_populate_recordset(null::public.workshops, payload -> 'workshops')
    on conflict (id) do update set name = excluded.name;
  insert into public.lines select * from jsonb_populate_recordset(null::public.lines, payload -> 'lines')
    on conflict (id) do update set code = excluded.code, name = excluded.name, description = excluded.description, "workshopId" = excluded."workshopId";
  insert into public.workstations select * from jsonb_populate_recordset(null::public.workstations, payload -> 'workstations')
    on conflict (id) do update set code = excluded.code, name = excluded.name, process = excluded.process, "lineId" = excluded."lineId",
      "mapX" = excluded."mapX", "mapY" = excluded."mapY", active = excluded.active;
  update public.teams set "leaderId" = null where true;
  insert into public.teams select id, name, shift, "lineId", null, active, "createdAt", "updatedAt"
    from jsonb_populate_recordset(null::public.teams, payload -> 'teams')
    on conflict (id) do update set name = excluded.name, shift = excluded.shift, "lineId" = excluded."lineId", active = excluded.active;
  insert into public.users select * from jsonb_populate_recordset(null::public.users, payload -> 'users')
    on conflict (id) do update set name = excluded.name, email = excluded.email, role = excluded.role, "lineId" = excluded."lineId",
      "zoneLabel" = excluded."zoneLabel", shift = excluded.shift, "teamId" = excluded."teamId", "workstationId" = excluded."workstationId",
      active = excluded.active, "authId" = coalesce(public.users."authId", excluded."authId");
  update public.teams t set "leaderId" = x."leaderId"
    from jsonb_populate_recordset(null::public.teams, payload -> 'teams') x where x.id = t.id;
  insert into public.settings select * from jsonb_populate_recordset(null::public.settings, payload -> 'settings')
    on conflict (id) do update set "plantName" = excluded."plantName", "andonEscalationMinutes" = excluded."andonEscalationMinutes",
      "routineLateToleranceMinutes" = excluded."routineLateToleranceMinutes", environment = 'demo';

  insert into public.checklists select * from jsonb_populate_recordset(null::public.checklists, payload -> 'checklists');
  insert into public."routineTemplates" select * from jsonb_populate_recordset(null::public."routineTemplates", payload -> 'routineTemplates');
  insert into public.schedules select * from jsonb_populate_recordset(null::public.schedules, payload -> 'schedules');
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
  insert into public."auditLog" ("actorId", event, resource, detail)
  values (payload ->> 'actorId', 'DEMO_ENVIRONMENT_RESET', 'settings', jsonb_build_object('users', jsonb_array_length(payload -> 'users')));
end $$;

revoke all on function public.seed_demo(jsonb) from public, anon, authenticated;
grant execute on function public.seed_demo(jsonb) to service_role;
