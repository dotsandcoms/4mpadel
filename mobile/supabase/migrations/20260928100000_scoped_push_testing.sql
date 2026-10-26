-- Scope test delivery without consuming other players' pending notifications.
BEGIN;
CREATE OR REPLACE FUNCTION public.claim_push_deliveries(p_recipient_emails text[])
RETURNS SETOF public.push_deliveries
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 UPDATE push_outbox SET status='skipped',error='Expired before delivery',expanded_at=now()
 WHERE status='pending' AND expanded_at IS NULL AND created_at<now()-interval '24 hours'
 AND (p_recipient_emails IS NULL OR lower(trim(email))=ANY(p_recipient_emails));
 WITH batch AS (
   SELECT id FROM push_outbox WHERE status='pending' AND expanded_at IS NULL
   AND (p_recipient_emails IS NULL OR lower(trim(email))=ANY(p_recipient_emails))
   ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED
 ), expanded AS (
   UPDATE push_outbox o SET expanded_at=now() FROM batch b WHERE o.id=b.id RETURNING o.*
 )
 INSERT INTO push_deliveries(outbox_id,token_id)
 SELECT o.id,t.id FROM expanded o JOIN player_push_tokens t
 ON lower(t.email)=lower(o.email) AND t.token_kind='expo'
 ON CONFLICT DO NOTHING;
 UPDATE push_outbox o SET status='skipped',error='No registered Expo device'
 WHERE status='pending' AND expanded_at IS NOT NULL
 AND (p_recipient_emails IS NULL OR lower(trim(o.email))=ANY(p_recipient_emails))
 AND NOT EXISTS(SELECT 1 FROM push_deliveries d WHERE d.outbox_id=o.id);
 RETURN QUERY WITH due AS (
   SELECT d.id FROM push_deliveries d JOIN push_outbox o ON o.id=d.outbox_id
   WHERE d.status IN('pending','processing','accepted') AND d.available_at<=now()
   AND (p_recipient_emails IS NULL OR lower(trim(o.email))=ANY(p_recipient_emails))
   ORDER BY d.available_at LIMIT 20 FOR UPDATE OF d SKIP LOCKED
 )
 UPDATE push_deliveries d SET status=CASE WHEN d.ticket_id IS NULL THEN 'processing' ELSE 'accepted' END,
 lease_id=gen_random_uuid(), attempts=attempts+1,available_at=now()+interval '5 minutes'
 FROM due WHERE d.id=due.id RETURNING d.*;
END $$;
REVOKE ALL ON FUNCTION public.claim_push_deliveries(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_push_deliveries(text[]) TO service_role;

-- Retain the existing no-argument API for unrestricted delivery.
CREATE OR REPLACE FUNCTION public.claim_push_deliveries() RETURNS SETOF public.push_deliveries
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT * FROM public.claim_push_deliveries(NULL::text[]);
$$;
COMMIT;
