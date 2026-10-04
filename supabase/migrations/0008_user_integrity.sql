-- Profil utilisateur : champs gérés exclusivement par le serveur.
-- - email : identique à l'email du compte d'authentification (création par la fonction admin-users) ;
-- - lastSignInAt : écrit uniquement par record_sign_in() ;
-- - createdAt : jamais modifiable.
create or replace function app.user_rules() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('app.seeding', true) = 'on' or auth.uid() is null then return new; end if;
  if new."authId" is distinct from old."authId" then raise exception 'Identifiant d’authentification non modifiable' using errcode = '42501'; end if;
  if new.email is distinct from old.email then
    raise exception 'L’adresse email d’un compte ne peut pas être modifiée depuis l’application' using errcode = '42501';
  end if;
  if new."createdAt" is distinct from old."createdAt" then raise exception 'Le champ createdAt ne peut pas être modifié' using errcode = '42501'; end if;
  if new."lastSignInAt" is distinct from old."lastSignInAt" and coalesce(current_setting('app.sign_in', true), '') <> 'on' then
    raise exception 'La dernière connexion est enregistrée par le serveur' using errcode = '42501';
  end if;
  if old."authId" = auth.uid() and (new.role <> old.role or new.active <> old.active) then
    raise exception 'Vous ne pouvez pas modifier votre propre rôle ni désactiver votre compte' using errcode = '42501';
  end if;
  if old.active and not new.active and new."authId" is not null then
    update auth.users set banned_until = 'infinity' where id = new."authId";
    delete from auth.sessions where user_id = new."authId";
  elsif not old.active and new.active and new."authId" is not null then
    update auth.users set banned_until = null where id = new."authId";
  end if;
  return new;
end $$;

create or replace function public.record_sign_in() returns void
language plpgsql security definer set search_path = '' as $$
declare me text := app.current_user_id();
begin
  if me is null then raise exception 'Compte inactif ou inconnu' using errcode = '42501'; end if;
  perform set_config('app.sign_in', 'on', true);
  update public.users set "lastSignInAt" = now() where id = me;
  perform set_config('app.sign_in', 'off', true);
  perform app.audit('USER_LOGIN', 'users', me);
end $$;
revoke all on function public.record_sign_in() from public, anon;
grant execute on function public.record_sign_in() to authenticated;

-- L'environnement (demo / production) conditionne la réinitialisation : il ne se modifie qu'en base (migration),
-- jamais depuis l'application, même par un administrateur.
create trigger settings_freeze before update on public.settings for each row execute function app.freeze_columns('environment', 'createdAt');

-- Lien de notification : chemin interne uniquement (refuse « //hote » et « /\hote », interprétés comme un autre site)
alter table public.notifications drop constraint if exists notifications_link_check;
alter table public.notifications add constraint notifications_link_check
  check (link is null or (link ~ '^/($|[^/\\])' and char_length(link) <= 300));
