-- Vérification de permission pour les fonctions Edge (clé de service uniquement) : même matrice que la RLS.
create or replace function public.auth_user_has_perm(p_auth uuid, p text) returns text
language sql stable security definer set search_path = '' as $$
  select u.id from public.users u join app.role_permissions rp on rp.role = u.role
  where u."authId" = p_auth and u.active and rp.permission = p
$$;
revoke all on function public.auth_user_has_perm(uuid, text) from public, anon, authenticated;
grant execute on function public.auth_user_has_perm(uuid, text) to service_role;
