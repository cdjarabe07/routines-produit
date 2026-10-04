-- Test d'étanchéité entre entreprises, à exécuter dans l'éditeur SQL du projet « routine-produit ».
-- Tout est annulé à la fin (l'exception finale annule la transaction) : aucune donnée n'est conservée.
-- Résultat attendu dans le message d'erreur « RESULTAT {...} » :
--   A_voit_* : uniquement Alpha ; A_modifie/supprime_ligne_Beta : 0 ; A_insert_force_Beta_rattache_a : Alpha ;
--   A_deplace_vers_Beta : refusé ; B_voit_lignes : uniquement Ligne Beta ; notif_mdp : Alpha 1, Beta 0.
do $$
declare
  a_auth uuid := gen_random_uuid();
  b_auth uuid := gen_random_uuid();
  ca text; cb text;
  la text; lb text;
  res jsonb := '{}';
  n int;
  forced text;
begin
  perform public.authorize_account_creation('alpha.admin@test.invalid');
  perform public.authorize_account_creation('beta.admin@test.invalid');
  insert into auth.users (id, email, aud, role) values (a_auth, 'alpha.admin@test.invalid', 'authenticated', 'authenticated');
  insert into auth.users (id, email, aud, role) values (b_auth, 'beta.admin@test.invalid', 'authenticated', 'authenticated');
  ca := public.create_company('Alpha', 'plastics');
  cb := public.create_company('Beta', 'food');
  insert into public.users (name, email, role, "authId", "companyId") values ('Admin Alpha', 'alpha.admin@test.invalid', 'admin', a_auth, ca);
  insert into public.users (name, email, role, "authId", "companyId") values ('Admin Beta', 'beta.admin@test.invalid', 'admin', b_auth, cb);
  insert into public.lines (code, name, "companyId") values ('A1', 'Ligne Alpha', ca) returning id into la;
  insert into public.lines (code, name, "companyId") values ('B1', 'Ligne Beta', cb) returning id into lb;

  -- Connecté en tant qu'administrateur d'Alpha
  perform set_config('request.jwt.claims', json_build_object('sub', a_auth, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := res || jsonb_build_object(
    'A_voit_lignes', (select json_agg(name) from public.lines),
    'A_voit_utilisateurs', (select json_agg(name) from public.users),
    'A_voit_entreprises', (select json_agg(name) from public.companies),
    'A_voit_settings', (select json_agg("plantName") from public.settings),
    'A_today_ok', (app.today() is not null));
  update public.lines set name = 'piraté' where id = lb;
  get diagnostics n = row_count;
  res := res || jsonb_build_object('A_modifie_ligne_Beta', n);
  delete from public.lines where id = lb;
  get diagnostics n = row_count;
  res := res || jsonb_build_object('A_supprime_ligne_Beta', n);
  insert into public.lines (code, name, "companyId") values ('X', 'Tentative', cb) returning "companyId" into forced;
  res := res || jsonb_build_object('A_insert_force_Beta_rattache_a',
    case when forced = ca then 'Alpha' when forced = cb then 'BETA (FUITE)' else forced end);
  begin
    update public.lines set "companyId" = cb where id = la;
    res := res || jsonb_build_object('A_deplace_vers_Beta', 'ACCEPTÉ (FUITE)');
  exception when others then
    res := res || jsonb_build_object('A_deplace_vers_Beta', 'refusé : ' || sqlerrm);
  end;
  execute 'reset role';

  -- Connecté en tant qu'administrateur de Beta
  perform set_config('request.jwt.claims', json_build_object('sub', b_auth, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := res || jsonb_build_object('B_voit_lignes', (select json_agg(name) from public.lines));
  execute 'reset role';

  -- Mot de passe oublié d'un compte Alpha : seuls les administrateurs d'Alpha sont prévenus
  perform set_config('request.jwt.claims', '', true);
  perform public.request_access_help('alpha.admin@test.invalid');
  res := res || jsonb_build_object('notif_mdp_par_entreprise',
    (select json_object_agg(c.name, (select count(*) from public.notifications x where x."companyId" = c.id))
     from public.companies c where c.id in (ca, cb)));

  raise exception 'RESULTAT %', res;
end $$;
