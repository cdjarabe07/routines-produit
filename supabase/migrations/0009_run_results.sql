-- Saisie des résultats d'une routine : fusion ATOMIQUE d'un seul résultat.
-- - pas de perte de saisie quand deux enregistrements se croisent (deux tâches cochées rapidement, deux tablettes) ;
-- - auteur et heure imposés par le serveur (le client ne peut pas attribuer une saisie à quelqu'un d'autre).
-- SECURITY INVOKER : la RLS (execute_own) et les triggers de routineRuns s'appliquent comme pour une requête directe.
create or replace function public.record_run_result(p_run text, p_key text, p_result jsonb) returns public."routineRuns"
language plpgsql security invoker set search_path = '' as $$
declare r public."routineRuns";
begin
  if p_key is null or char_length(p_key) not between 1 and 200 then raise exception 'Référence de tâche invalide' using errcode = '22023'; end if;
  if p_result is not null and (jsonb_typeof(p_result) <> 'object' or pg_column_size(p_result) > 20000) then
    raise exception 'Résultat invalide' using errcode = '22023';
  end if;
  perform set_config('app.run_result', 'on', true);
  update public."routineRuns"
     set results = case
       when p_result is null then results - p_key
       else results || jsonb_build_object(p_key, (p_result - 'at' - 'by') || jsonb_build_object('at', now(), 'by', app.current_user_id()))
     end
   where id = p_run
  returning * into r;
  perform set_config('app.run_result', 'off', true);
  if r.id is null then raise exception 'Exécution introuvable ou non modifiable' using errcode = 'P0002'; end if;
  return r;
end $$;
revoke all on function public.record_run_result(text, text, jsonb) from public, anon;
grant execute on function public.record_run_result(text, text, jsonb) to authenticated;

-- Les résultats ne se modifient plus que par cette fonction
create or replace function app.run_results_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('app.seeding', true) = 'on' or auth.uid() is null then return new; end if;
  if new.results is distinct from old.results and coalesce(current_setting('app.run_result', true), '') <> 'on' then
    raise exception 'Les résultats se saisissent tâche par tâche' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger run_results_guard before update on public."routineRuns" for each row execute function app.run_results_guard();
