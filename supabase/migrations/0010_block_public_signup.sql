-- Inscription publique : refusée par la base, indépendamment du réglage du tableau de bord.
-- Un compte d'authentification ne peut être créé que pour un email autorisé juste avant par une fonction serveur
-- (admin-users, demo-seed : clé de service). Autorisation à usage unique, valable 2 minutes.
create table if not exists app.account_provisioning (
  email text primary key,
  expires_at timestamptz not null
);
alter table app.account_provisioning enable row level security;

create or replace function public.authorize_account_creation(p_email text) returns void
language sql security definer set search_path = '' as $$
  insert into app.account_provisioning (email, expires_at) values (lower(trim(p_email)), now() + interval '2 minutes')
  on conflict (email) do update set expires_at = excluded.expires_at
$$;
revoke all on function public.authorize_account_creation(text) from public, anon, authenticated;
grant execute on function public.authorize_account_creation(text) to service_role;

create or replace function app.block_unprovisioned_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from app.account_provisioning where expires_at < now();
  delete from app.account_provisioning where email = lower(new.email);
  if not found then
    raise exception 'Inscription publique désactivée : les comptes sont créés par un administrateur' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function app.block_unprovisioned_signup() from public, anon, authenticated;

drop trigger if exists block_public_signup on auth.users;
create trigger block_public_signup before insert on auth.users for each row execute function app.block_unprovisioned_signup();
