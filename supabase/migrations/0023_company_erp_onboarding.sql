-- Plusieurs entreprises (suite) :
-- - file d'envoi ERP : prise en charge des envois dus d'une seule entreprise (celle de l'administrateur appelant) ;
-- - paramètres : modèle de secteur appliqué par l'administrateur à la mise en route (null = pas encore choisi).

drop function if exists public.integration_claim_outbox(integer);
create or replace function public.integration_claim_outbox(p_limit integer, p_company text) returns setof public."integrationOutbox"
language sql security definer set search_path = '' as $$
  update public."integrationOutbox" o
     set status = 'sending', attempts = o.attempts + 1
   where o.id in (
     select id from public."integrationOutbox"
      where "companyId" = p_company
        and ((status in ('pending', 'failed') and "nextRetryAt" <= now())
          -- envoi interrompu (fonction arrêtée en cours de route) : repris après 10 minutes
          or (status = 'sending' and "updatedAt" < now() - interval '10 minutes'))
      order by "nextRetryAt"
      limit least(greatest(p_limit, 1), 50)
      for update skip locked)
  returning o.*
$$;
revoke all on function public.integration_claim_outbox(integer, text) from public, anon, authenticated;
grant execute on function public.integration_claim_outbox(integer, text) to service_role;

alter table public.settings add column "sectorTemplate" text
  check ("sectorTemplate" in ('generic', 'automotive', 'plastics', 'machining', 'food', 'electronics'));
