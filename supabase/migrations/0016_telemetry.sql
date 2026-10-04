-- ============================================================
-- Suivi technique : erreurs survenues dans le navigateur et fréquentation des écrans.
-- - Aucune identité de personne : seul le rôle est conservé (erreurs, fréquentation).
-- - Écriture uniquement par les fonctions ci-dessous (contrôles et plafonds) ; lecture par l'administration.
-- ============================================================

create table public."errorReports" (
  id text primary key default gen_random_uuid()::text,
  day date not null,
  fingerprint text not null check (char_length(fingerprint) = 32),
  message text not null check (char_length(message) between 1 and 500),
  stack text check (char_length(stack) <= 4000),
  route text not null check (char_length(route) between 1 and 200),
  source text not null check (source in ('window', 'promise', 'react')),
  role text,
  "appVersion" text check (char_length("appVersion") <= 40),
  "userAgent" text check (char_length("userAgent") <= 300),
  count integer not null default 1 check (count >= 1),
  "firstAt" timestamptz not null default now(),
  "lastAt" timestamptz not null default now(),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique (day, fingerprint)
);
create index "errorReports_day" on public."errorReports" (day desc);

create table public."usageDaily" (
  day date not null,
  route text not null check (route ~ '^/[A-Za-z0-9/:_-]{0,150}$'),
  role text not null,
  views integer not null default 0 check (views >= 0),
  "updatedAt" timestamptz not null default now(),
  primary key (day, route, role)
);

alter table public."errorReports" enable row level security;
alter table public."usageDaily" enable row level security;
revoke all on public."errorReports" from anon, authenticated;
revoke all on public."usageDaily" from anon, authenticated;
grant select on public."errorReports" to authenticated;
grant select on public."usageDaily" to authenticated;
create policy read_admin on public."errorReports" for select to authenticated using (app.has_perm('settings.manage'));
create policy read_admin on public."usageDaily" for select to authenticated using (app.has_perm('settings.manage'));

/** Erreur du navigateur : regroupée par jour et par empreinte (message, premier appel de la pile, écran), puis comptée. */
create or replace function public.report_client_error(
  p_message text, p_stack text, p_route text, p_source text, p_version text, p_agent text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  msg text := left(coalesce(nullif(trim(p_message), ''), 'Erreur sans message'), 500);
  rt text := left(coalesce(nullif(trim(p_route), ''), '/'), 200);
  d date := app.today();
  fp text;
begin
  if not app.is_member() or p_source is null or p_source not in ('window', 'promise', 'react') then return; end if;
  fp := md5(msg || '|' || split_part(coalesce(p_stack, ''), E'\n', 2) || '|' || rt);
  -- Plafond quotidien d'erreurs distinctes : au-delà, seules les répétitions déjà connues sont comptées
  if not exists (select 1 from public."errorReports" e where e.day = d and e.fingerprint = fp)
     and (select count(*) from public."errorReports" e where e.day = d) >= 200 then
    return;
  end if;
  insert into public."errorReports" (day, fingerprint, message, stack, route, source, role, "appVersion", "userAgent")
  values (d, fp, msg, left(p_stack, 4000), rt, p_source, app.user_role(), left(p_version, 40), left(p_agent, 300))
  on conflict (day, fingerprint) do update
    set count = least(public."errorReports".count + 1, 1000000), "lastAt" = now(), "updatedAt" = now();
end $$;

/** Ouverture d'un écran : compteur du jour par écran (modèle d'adresse, sans identifiant) et par rôle. */
create or replace function public.track_screen_view(p_route text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r text := app.user_role();
  d date := app.today();
begin
  if r is null or p_route is null or p_route !~ '^/[A-Za-z0-9/:_-]{0,150}$' then return; end if;
  -- Plafond quotidien de lignes : protège la table contre des adresses inventées en masse
  if not exists (select 1 from public."usageDaily" u where u.day = d and u.route = p_route and u.role = r)
     and (select count(*) from public."usageDaily" u where u.day = d) >= 1000 then
    return;
  end if;
  insert into public."usageDaily" (day, route, role, views) values (d, p_route, r, 1)
  on conflict (day, route, role) do update set views = least(public."usageDaily".views + 1, 1000000), "updatedAt" = now();
end $$;

revoke all on function public.report_client_error(text, text, text, text, text, text) from public, anon;
revoke all on function public.track_screen_view(text) from public, anon;
grant execute on function public.report_client_error(text, text, text, text, text, text) to authenticated;
grant execute on function public.track_screen_view(text) to authenticated;
