-- Requires the mobile push delivery/tournament notification migrations.
-- Broadcasts use the existing worker; this migration does not send any messages.
BEGIN;

ALTER TABLE public.push_outbox DROP CONSTRAINT push_outbox_type_check;
ALTER TABLE public.push_outbox ADD CONSTRAINT push_outbox_type_check CHECK (type IN (
 'registration_complete','event_cancelled','partner_assigned','partner_entry_paid','partner_invite',
 'event_registration','payment_confirmation','payment_reminder','entry_withdrawn','entry_refunded',
 'draws_ready','division_changed','match_reminder','ranking_change','club_announcement',
 'registration_open','early_bird_ending','registration_closing','registration_closed',
 'schedule_published','schedule_changed','match_progression','opponent_confirmed','result_confirmed',
 'result_corrected','tournament_live','tournament_finished','event_updated','pro_match_live','admin_broadcast'));

CREATE OR REPLACE FUNCTION public.notification_type_keys() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
 SELECT ARRAY['push_enabled','registration_complete','event_cancelled','partner_assigned','partner_entry_paid',
 'partner_invite','event_registration','payment_confirmation','payment_reminder','entry_withdrawn','entry_refunded',
 'draws_ready','division_changed','match_reminder','ranking_change','club_announcement','registration_open',
 'early_bird_ending','registration_closing','registration_closed','schedule_published','schedule_changed',
 'match_progression','opponent_confirmed','result_confirmed','result_corrected','tournament_live',
 'tournament_finished','event_updated','followed_events','quiet_hours_enabled','pro_match_live','admin_broadcast'];
$$;

CREATE TABLE public.push_broadcasts (
 id uuid PRIMARY KEY,
 created_by uuid NOT NULL,
 created_by_email text NOT NULL,
 title text NOT NULL,
 body text NOT NULL,
 path text NOT NULL,
 audience jsonb NOT NULL,
 recipient_count integer NOT NULL,
 queued_count integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.push_broadcasts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_broadcasts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.push_broadcasts TO service_role;
ALTER TABLE public.push_outbox ADD COLUMN broadcast_id uuid REFERENCES public.push_broadcasts(id);
CREATE UNIQUE INDEX push_outbox_broadcast_recipient ON public.push_outbox(broadcast_id, lower(email))
 WHERE broadcast_id IS NOT NULL;

CREATE SCHEMA IF NOT EXISTS private;
CREATE FUNCTION private.require_broadcast_admin() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF auth.uid() IS NULL OR nullif(trim(auth.jwt()->>'email'),'') IS NULL THEN
  RAISE EXCEPTION 'Sign in to manage broadcasts' USING ERRCODE = '42501';
 END IF;
 IF NOT (public.is_super_admin(lower(trim(auth.jwt()->>'email'))) OR EXISTS (
  SELECT 1 FROM public.admin_sidebar_permissions p
  WHERE lower(p.email) = lower(trim(auth.jwt()->>'email')) AND 'email-broadcast' = ANY(p.allowed_tabs)
 )) THEN
  RAISE EXCEPTION 'Broadcast permission required' USING ERRCODE = '42501';
 END IF;
END $$;

-- One resolver serves preview and send. Include single-row team partners, exclude
-- withdrawn entries, normalise emails, and never expose device tokens to the admin UI.
CREATE FUNCTION private.push_broadcast_audience(
 p_event_ids bigint[], p_player_ids bigint[], p_payment text, p_partner text, p_excluded_emails text[]
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM private.require_broadcast_admin();
 IF p_payment IS NULL OR p_payment NOT IN ('all','paid','pending') OR
    p_partner IS NULL OR p_partner NOT IN ('all','has_partner','solo') THEN
  RAISE EXCEPTION 'Invalid audience filter';
 END IF;
 IF coalesce(cardinality(p_event_ids),0) > 100 OR coalesce(cardinality(p_player_ids),0) > 1000
    OR coalesce(cardinality(p_excluded_emails),0) > 10000 THEN
  RAISE EXCEPTION 'Audience selection is too large';
 END IF;
 WITH registrations AS (
  SELECT r.* FROM public.event_registrations r
  WHERE r.event_id = ANY(p_event_ids) AND lower(coalesce(r.status,'')) <> 'withdrawn'
   AND (p_payment = 'all' OR (p_payment = 'paid') = (lower(coalesce(r.payment_status,'pending')) = 'paid'))
   AND (p_partner = 'all' OR (p_partner = 'has_partner') =
       (nullif(trim(r.partner_name),'') IS NOT NULL OR nullif(trim(r.partner_email),'') IS NOT NULL))
 ), candidates AS (
  SELECT lower(trim(address)) email FROM registrations r
  CROSS JOIN LATERAL unnest(ARRAY[r.email,r.partner_email]) address
  WHERE NOT EXISTS (
   SELECT 1 FROM public.event_registrations w WHERE w.event_id = r.event_id
    AND w.division_id IS NOT DISTINCT FROM r.division_id AND lower(w.status) = 'withdrawn'
    AND lower(trim(w.email)) = lower(trim(address))
    AND NOT EXISTS (SELECT 1 FROM public.event_registrations a WHERE a.event_id = w.event_id
     AND a.division_id IS NOT DISTINCT FROM w.division_id AND lower(trim(a.email)) = lower(trim(w.email))
     AND lower(coalesce(a.status,'')) <> 'withdrawn')
  )
  UNION
  SELECT lower(trim(t.email)) FROM public.tournament_participants t
  WHERE t.event_id = ANY(p_event_ids) AND p_payment = 'all' AND p_partner = 'all'
   AND NOT EXISTS (SELECT 1 FROM public.event_registrations w WHERE w.event_id = t.event_id
    AND lower(trim(w.email)) = lower(trim(t.email)) AND lower(w.status) = 'withdrawn'
    AND NOT EXISTS (SELECT 1 FROM public.event_registrations a WHERE a.event_id = w.event_id
     AND lower(trim(a.email)) = lower(trim(w.email)) AND lower(coalesce(a.status,'')) <> 'withdrawn'))
  UNION
  SELECT lower(trim(p.email)) FROM public.players p WHERE p.id = ANY(p_player_ids)
 ), recipients AS (
  SELECT c.email, coalesce(nullif(p.name,''), c.email) name,
   CASE WHEN p.notification_prefs->>'push_enabled' = 'false' OR p.notification_prefs->>'admin_broadcast' = 'false'
    THEN 'disabled' WHEN NOT EXISTS (SELECT 1 FROM public.player_push_tokens t
     WHERE lower(trim(t.email)) = c.email AND t.token_kind = 'expo') THEN 'no_device' ELSE 'ready' END availability
  FROM candidates c
  LEFT JOIN LATERAL (SELECT player.name, player.notification_prefs FROM public.players player
   WHERE lower(trim(player.email)) = c.email ORDER BY player.id LIMIT 1) p ON true
  WHERE c.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
   AND NOT EXISTS (SELECT 1 FROM unnest(p_excluded_emails) excluded WHERE lower(trim(excluded)) = c.email)
 ) SELECT jsonb_build_object(
  'total', count(*), 'ready', count(*) FILTER (WHERE availability = 'ready'),
  'disabled', count(*) FILTER (WHERE availability = 'disabled'),
  'no_device', count(*) FILTER (WHERE availability = 'no_device'),
  'fingerprint', md5(coalesce(string_agg(email || ':' || availability, ',' ORDER BY email),'')),
  'recipients', coalesce(jsonb_agg(to_jsonb(recipients) ORDER BY email),'[]'::jsonb)
 ) INTO result FROM recipients;
 RETURN result;
END $$;

CREATE FUNCTION public.admin_push_broadcast_events() RETURNS TABLE(id bigint, event_name text, start_date date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 PERFORM private.require_broadcast_admin();
 RETURN QUERY SELECT c.id,c.event_name,c.start_date::date FROM public.calendar c ORDER BY c.start_date DESC NULLS LAST,c.id;
END $$;

CREATE FUNCTION public.admin_push_broadcast_players(p_search text) RETURNS TABLE(id bigint, name text, email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 PERFORM private.require_broadcast_admin();
 IF length(trim(coalesce(p_search,''))) < 2 THEN RETURN; END IF;
 RETURN QUERY SELECT p.id,p.name,lower(trim(p.email)) FROM public.players p
 WHERE nullif(trim(p.email),'') IS NOT NULL AND
  (strpos(lower(coalesce(p.name,'')),lower(trim(p_search))) > 0 OR strpos(lower(p.email),lower(trim(p_search))) > 0)
 ORDER BY p.name,p.id LIMIT 30;
END $$;

CREATE FUNCTION public.preview_push_broadcast(
 p_event_ids bigint[] DEFAULT '{}', p_player_ids bigint[] DEFAULT '{}',
 p_payment text DEFAULT 'all', p_partner text DEFAULT 'all', p_excluded_emails text[] DEFAULT '{}'
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT private.push_broadcast_audience(p_event_ids,p_player_ids,p_payment,p_partner,p_excluded_emails);
$$;

CREATE FUNCTION public.send_push_broadcast(
 p_request_id uuid, p_title text, p_body text, p_path text, p_fingerprint text,
 p_event_ids bigint[] DEFAULT '{}', p_player_ids bigint[] DEFAULT '{}',
 p_payment text DEFAULT 'all', p_partner text DEFAULT 'all', p_excluded_emails text[] DEFAULT '{}'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE audience jsonb; selection jsonb; existing public.push_broadcasts; total integer; ready integer;
BEGIN
 PERFORM private.require_broadcast_admin();
 IF p_request_id IS NULL OR nullif(trim(p_title),'') IS NULL OR nullif(trim(p_body),'') IS NULL
  OR length(trim(p_title)) > 80 OR length(trim(p_body)) > 500 THEN
  RAISE EXCEPTION 'Enter a title (up to 80 characters) and message (up to 500 characters)';
 END IF;
 IF p_path IS NULL OR NOT (p_path IN ('/calendar','/(tabs)/rankings','/(tabs)/explore','/(tabs)/profile','/pro/live')
  OR p_path ~ '^/events/[1-9][0-9]*$') THEN RAISE EXCEPTION 'Choose a supported app destination'; END IF;
 IF p_path LIKE '/events/%' AND NOT EXISTS (SELECT 1 FROM public.calendar c WHERE c.id::text = split_part(p_path,'/',3)
  AND c.is_visible IS DISTINCT FROM false AND (c.sanction_status IS NULL OR c.sanction_status = 'approved')) THEN
  RAISE EXCEPTION 'Choose a published event destination';
 END IF;
 selection := jsonb_build_object('event_ids',p_event_ids,'player_ids',p_player_ids,
  'payment',p_payment,'partner',p_partner,'excluded_emails',p_excluded_emails);
 -- Serialise retries of the same request, including concurrent double clicks.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 SELECT * INTO existing FROM public.push_broadcasts WHERE id = p_request_id;
 IF FOUND THEN
  IF existing.created_by <> auth.uid() OR existing.title <> trim(p_title) OR existing.body <> trim(p_body)
   OR existing.path <> p_path OR existing.audience <> selection THEN RAISE EXCEPTION 'Request already used for another broadcast'; END IF;
  RETURN jsonb_build_object('id',existing.id,'total',existing.recipient_count,'queued',existing.queued_count,'reused',true);
 END IF;
 audience := private.push_broadcast_audience(p_event_ids,p_player_ids,p_payment,p_partner,p_excluded_emails);
 total := (audience->>'total')::integer; ready := (audience->>'ready')::integer;
 IF total = 0 THEN RAISE EXCEPTION 'Select at least one recipient'; END IF;
 IF total > 10000 THEN RAISE EXCEPTION 'Limit broadcasts to 10,000 recipients'; END IF;
 IF ready = 0 THEN RAISE EXCEPTION 'No selected recipients can receive push notifications'; END IF;
 IF p_fingerprint IS DISTINCT FROM audience->>'fingerprint' THEN
  RAISE EXCEPTION 'Audience changed. Refresh the preview and review the recipients before sending.';
 END IF;
 INSERT INTO public.push_broadcasts(id,created_by,created_by_email,title,body,path,audience,recipient_count,queued_count)
 VALUES (p_request_id,auth.uid(),lower(trim(auth.jwt()->>'email')),trim(p_title),trim(p_body),p_path,selection,total,ready);
 INSERT INTO public.push_outbox(email,type,title,body,path,data,status,error,broadcast_id)
 SELECT r->>'email','admin_broadcast',trim(p_title),trim(p_body),p_path,
  jsonb_build_object('broadcast_id',p_request_id),CASE WHEN r->>'availability' = 'ready' THEN 'pending' ELSE 'skipped' END,
  CASE r->>'availability' WHEN 'disabled' THEN 'Disabled in notification settings' WHEN 'no_device' THEN 'No registered Expo device' END,
  p_request_id FROM jsonb_array_elements(audience->'recipients') r;
 RETURN jsonb_build_object('id',p_request_id,'total',total,'queued',ready,'reused',false);
END $$;

CREATE FUNCTION public.list_push_broadcasts() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM private.require_broadcast_admin();
 SELECT coalesce(jsonb_agg(to_jsonb(history) ORDER BY history.created_at DESC),'[]'::jsonb) INTO result FROM (
  SELECT b.id,b.title,b.body,b.path,b.created_at,b.created_by_email,b.recipient_count,b.queued_count,
   count(o.id) FILTER (WHERE o.status = 'pending') pending,
   count(o.id) FILTER (WHERE o.status = 'sent') sent,
   count(o.id) FILTER (WHERE o.status = 'failed') failed,
   count(o.id) FILTER (WHERE o.status = 'skipped') skipped
  FROM (SELECT * FROM public.push_broadcasts ORDER BY created_at DESC LIMIT 20) b
  LEFT JOIN public.push_outbox o ON o.broadcast_id = b.id GROUP BY b.id,b.title,b.body,b.path,b.created_at,
   b.created_by_email,b.recipient_count,b.queued_count
 ) history;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION private.require_broadcast_admin(),
 private.push_broadcast_audience(bigint[],bigint[],text,text,text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_push_broadcast_events(), public.admin_push_broadcast_players(text),
 public.preview_push_broadcast(bigint[],bigint[],text,text,text[]),
 public.send_push_broadcast(uuid,text,text,text,text,bigint[],bigint[],text,text,text[]), public.list_push_broadcasts()
 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_push_broadcast_events(), public.admin_push_broadcast_players(text),
 public.preview_push_broadcast(bigint[],bigint[],text,text,text[]),
 public.send_push_broadcast(uuid,text,text,text,text,bigint[],bigint[],text,text,text[]), public.list_push_broadcasts()
 TO authenticated;
COMMENT ON TABLE public.push_broadcasts IS 'Admin push campaign audit. Access only through permission-checked RPCs.';
NOTIFY pgrst, 'reload schema';
COMMIT;
