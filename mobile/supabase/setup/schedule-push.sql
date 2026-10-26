-- Run after deployment and after provisioning push_worker_url and push_worker_secret in Vault.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;
CREATE OR REPLACE FUNCTION public.dispatch_push_worker() RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE endpoint text; worker_secret text; request_id bigint;
BEGIN
 SELECT decrypted_secret INTO endpoint FROM vault.decrypted_secrets WHERE name='push_worker_url';
 SELECT decrypted_secret INTO worker_secret FROM vault.decrypted_secrets WHERE name='push_worker_secret';
 IF endpoint IS NULL OR worker_secret IS NULL THEN RAISE EXCEPTION 'Push worker Vault secrets are not configured'; END IF;
 SELECT net.http_post(url:=endpoint,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||worker_secret),body:='{}'::jsonb,timeout_milliseconds:=120000) INTO request_id;
 RETURN request_id;
END $$;
REVOKE ALL ON FUNCTION public.dispatch_push_worker() FROM PUBLIC,anon,authenticated;
SELECT cron.schedule('player-push-delivery','* * * * *','SELECT public.dispatch_push_worker();');
COMMIT;
