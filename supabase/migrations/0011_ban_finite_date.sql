-- Correctif : Supabase Auth ne sait pas lire banned_until = 'infinity' (échec de l'API d'administration
-- « Database error finding users »). Un compte désactivé est banni jusqu'à une date lointaine mais finie.
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
    update auth.users set banned_until = now() + interval '100 years' where id = new."authId";
    delete from auth.sessions where user_id = new."authId";
  elsif not old.active and new.active and new."authId" is not null then
    update auth.users set banned_until = null where id = new."authId";
  end if;
  return new;
end $$;

update auth.users set banned_until = now() + interval '100 years' where banned_until = 'infinity';
