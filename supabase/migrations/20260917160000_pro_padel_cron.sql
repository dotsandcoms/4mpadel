-- Credentials are provisioned separately in Vault, never committed here.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create or replace function public.refresh_pro_padel(refresh_scope text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  endpoint text;
  cron_secret text;
  request_id bigint;
begin
  if refresh_scope is null or refresh_scope not in ('rankings', 'tour', 'fixtures') then
    raise exception 'Invalid Pro Padel refresh scope';
  end if;
  select decrypted_secret into endpoint from vault.decrypted_secrets where name = 'pro_padel_refresh_url';
  select decrypted_secret into cron_secret from vault.decrypted_secrets where name = 'pro_padel_cron_secret';
  if endpoint is null or cron_secret is null then
    raise exception 'Pro Padel refresh secrets are not configured';
  end if;
  select net.http_post(
    url := endpoint,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || cron_secret),
    body := jsonb_build_object('scope', refresh_scope),
    timeout_milliseconds := 120000
  ) into request_id;
  return request_id;
end;
$$;

revoke all on function public.refresh_pro_padel(text) from public, anon, authenticated;
-- Jobs run as the database owner. Names make reapplication update existing jobs.
select cron.schedule('pro-padel-rankings', '0 5 * * *', $job$select public.refresh_pro_padel('rankings');$job$);
select cron.schedule('pro-padel-tour', '10 5 * * *', $job$select public.refresh_pro_padel('tour');$job$);
select cron.schedule('pro-padel-fixtures', '20 5 * * *', $job$select public.refresh_pro_padel('fixtures');$job$);
commit;
