-- Révocation des sessions d'un compte (jetons de rafraîchissement) : réservée au serveur.
-- Les jetons d'accès déjà émis expirent d'eux-mêmes (1 h) ; un compte désactivé perd immédiatement l'accès aux données (RLS).
create or replace function public.revoke_user_sessions(p_auth uuid) returns void
language sql security definer set search_path = '' as $$
  delete from auth.sessions where user_id = p_auth
$$;
revoke all on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;

-- Désactivation d'un compte : bannissement Supabase Auth et fermeture des sessions
create or replace function app.user_rules() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('app.seeding', true) = 'on' or auth.uid() is null then return new; end if;
  if new."authId" is distinct from old."authId" then raise exception 'Identifiant d’authentification non modifiable' using errcode = '42501'; end if;
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
