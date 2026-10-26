-- STAGING CANDIDATE ONLY. Requires claims.sql and applications.sql.
-- This file sends no email. A trusted worker must explicitly claim and finish.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE club_preview_private.claim_notifications
  DROP CONSTRAINT claim_notifications_delivery_status_check,
  ADD CONSTRAINT claim_notifications_delivery_status_check CHECK(delivery_status IN ('pending','processing','sent','failed','uncertain','simulated')),
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN attempt_token uuid,
  ADD COLUMN lease_expires_at timestamptz,
  ADD COLUMN finished_at timestamptz,
  ADD COLUMN last_error text,
  ADD COLUMN provider_message_id text;
ALTER TABLE club_preview_private.application_notifications
  DROP CONSTRAINT application_notifications_delivery_status_check,
  ADD CONSTRAINT application_notifications_delivery_status_check CHECK(delivery_status IN ('pending','processing','sent','failed','uncertain','simulated')),
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN attempt_token uuid,
  ADD COLUMN lease_expires_at timestamptz,
  ADD COLUMN finished_at timestamptz,
  ADD COLUMN last_error text,
  ADD COLUMN provider_message_id text;

CREATE FUNCTION public.preview_claim_club_notification(p_kind text,p_lease_seconds integer DEFAULT 120,p_synthetic_only boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE table_name text; id_column text; job jsonb; token uuid := gen_random_uuid();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  IF p_kind NOT IN ('claim','application') OR p_kind IS NULL OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 600 OR p_synthetic_only IS NULL THEN
    RAISE EXCEPTION 'Invalid notification lease' USING ERRCODE='22023'; END IF;
  table_name := p_kind || '_notifications';
  id_column := CASE p_kind WHEN 'claim' THEN 'claim_id' ELSE 'club_id' END;
  -- A crashed/expired worker might have sent the message. Never auto-resend it.
  EXECUTE format('UPDATE club_preview_private.%I SET delivery_status=''uncertain'',finished_at=clock_timestamp(),last_error=''Delivery lease expired; reconcile with provider before any resend'' WHERE %I IN (SELECT %I FROM club_preview_private.%I WHERE delivery_status=''processing'' AND lease_expires_at<=clock_timestamp() AND (NOT $1 OR lower(recipient) LIKE ''%%@example.invalid'') FOR UPDATE SKIP LOCKED)',table_name,id_column,id_column,table_name) USING p_synthetic_only;
  EXECUTE format('WITH next_job AS (SELECT %I FROM club_preview_private.%I WHERE delivery_status=''pending'' AND (NOT $3 OR lower(recipient) LIKE ''%%@example.invalid'') ORDER BY created_at,%I FOR UPDATE SKIP LOCKED LIMIT 1)
    UPDATE club_preview_private.%I n SET delivery_status=''processing'',attempt_count=n.attempt_count+1,attempt_token=$1,lease_expires_at=clock_timestamp()+make_interval(secs=>$2),finished_at=NULL,last_error=NULL
    FROM next_job j WHERE n.%I=j.%I RETURNING to_jsonb(n)',id_column,table_name,id_column,table_name,id_column,id_column)
    INTO job USING token,p_lease_seconds,p_synthetic_only;
  IF job IS NULL THEN RETURN NULL; END IF;
  RETURN job || jsonb_build_object('kind',p_kind,'id',job->>id_column,'idempotency_key','club-'||p_kind||'-'||(job->>id_column));
END $$;

CREATE FUNCTION public.preview_finish_club_notification(p_kind text,p_id uuid,p_attempt_token uuid,p_outcome text,p_error text DEFAULT NULL,p_provider_message_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE table_name text; id_column text; job jsonb; final_outcome text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('claim','application') OR p_outcome IS NULL OR p_outcome NOT IN ('sent','failed','uncertain','simulated') OR p_attempt_token IS NULL OR p_id IS NULL THEN
    RAISE EXCEPTION 'Invalid notification result' USING ERRCODE='22023'; END IF;
  table_name:=p_kind||'_notifications'; id_column:=CASE p_kind WHEN 'claim' THEN 'claim_id' ELSE 'club_id' END;
  EXECUTE format('SELECT to_jsonb(n) FROM club_preview_private.%I n WHERE %I=$1 FOR UPDATE',table_name,id_column) INTO job USING p_id;
  IF job IS NULL OR (job->>'attempt_token')::uuid IS DISTINCT FROM p_attempt_token THEN RAISE EXCEPTION 'Stale notification attempt' USING ERRCODE='40001'; END IF;
  p_provider_message_id:=nullif(btrim(p_provider_message_id),'');
  IF p_outcome='sent' AND p_provider_message_id IS NULL THEN RAISE EXCEPTION 'Confirmed provider message ID required' USING ERRCODE='22023'; END IF;
  IF job->>'delivery_status'=p_outcome THEN
    IF p_outcome='sent' AND job->>'provider_message_id' IS DISTINCT FROM p_provider_message_id THEN RAISE EXCEPTION 'Provider result changed' USING ERRCODE='40001'; END IF;
    RETURN job;
  END IF;
  IF job->>'delivery_status'<>'processing' THEN RAISE EXCEPTION 'Notification already finished' USING ERRCODE='40001'; END IF;
  final_outcome:=CASE WHEN (job->>'lease_expires_at')::timestamptz<=clock_timestamp() THEN 'uncertain' ELSE p_outcome END;
  EXECUTE format('UPDATE club_preview_private.%I n SET delivery_status=$1,finished_at=clock_timestamp(),last_error=$2,provider_message_id=$4 WHERE %I=$3 RETURNING to_jsonb(n)',table_name,id_column)
    INTO job USING final_outcome,CASE WHEN final_outcome<>p_outcome THEN 'Delivery lease expired; result requires reconciliation' ELSE left(p_error,2000) END,p_id,p_provider_message_id;
  RETURN job;
END $$;

-- Only explicitly known not-sent failures may be retried. Ambiguous results and
-- sent messages require operator/provider reconciliation outside this RPC.
CREATE FUNCTION public.preview_retry_club_notification(p_kind text,p_id uuid,p_attempt_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE table_name text; id_column text; job jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('claim','application') OR p_id IS NULL OR p_attempt_token IS NULL THEN RAISE EXCEPTION 'Invalid retry' USING ERRCODE='22023'; END IF;
  table_name:=p_kind||'_notifications'; id_column:=CASE p_kind WHEN 'claim' THEN 'claim_id' ELSE 'club_id' END;
  EXECUTE format('UPDATE club_preview_private.%I n SET delivery_status=''pending'',lease_expires_at=NULL WHERE %I=$1 AND attempt_token=$2 AND delivery_status=''failed'' RETURNING to_jsonb(n)',table_name,id_column) INTO job USING p_id,p_attempt_token;
  IF job IS NULL THEN RAISE EXCEPTION 'Only a matching definitely-failed attempt can be retried' USING ERRCODE='40001'; END IF;
  RETURN job;
END $$;
REVOKE ALL ON FUNCTION public.preview_claim_club_notification(text,integer,boolean),public.preview_finish_club_notification(text,uuid,uuid,text,text,text),public.preview_retry_club_notification(text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preview_claim_club_notification(text,integer,boolean),public.preview_finish_club_notification(text,uuid,uuid,text,text,text),public.preview_retry_club_notification(text,uuid,uuid) TO service_role;
COMMIT;
