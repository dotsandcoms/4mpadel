-- Apply after the shared 20260814_player_push_notifications.sql migration.
BEGIN;
ALTER TABLE public.push_outbox DROP CONSTRAINT IF EXISTS push_outbox_type_check;
ALTER TABLE public.push_outbox ADD CONSTRAINT push_outbox_type_check CHECK (type IN (
 'registration_complete','event_cancelled','partner_assigned','partner_entry_paid','partner_invite',
 'event_registration','payment_confirmation','payment_reminder','entry_withdrawn','entry_refunded',
 'draws_ready','division_changed','match_reminder','ranking_change','club_announcement'));

CREATE OR REPLACE FUNCTION public.get_notification_preferences() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prefs jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
 SELECT notification_prefs INTO prefs FROM players WHERE lower(email)=lower(auth.jwt()->>'email') LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Complete your player profile first'; END IF;
 RETURN coalesce(prefs,'{}');
END $$;
CREATE OR REPLACE FUNCTION public.set_notification_pref(p_type text,p_enabled boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
 IF p_enabled IS NULL OR p_type IS NULL OR p_type NOT IN (
 'push_enabled','registration_complete','event_cancelled','partner_assigned','partner_entry_paid','partner_invite',
 'event_registration','payment_confirmation','payment_reminder','entry_withdrawn','entry_refunded',
 'draws_ready','division_changed','match_reminder','ranking_change','club_announcement') THEN RAISE EXCEPTION 'Invalid preference'; END IF;
 UPDATE players SET notification_prefs=jsonb_set(coalesce(notification_prefs,'{}'),ARRAY[p_type],to_jsonb(p_enabled),true)
 WHERE lower(email)=lower(auth.jwt()->>'email');
 IF NOT FOUND THEN RAISE EXCEPTION 'Complete your player profile first'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.get_notification_preferences() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_notification_pref(text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_notification_preferences(),public.set_notification_pref(text,boolean) TO authenticated;

-- Each device gets its own durable delivery and receipt. Token ownership is checked again at send time.
CREATE TABLE public.push_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), outbox_id uuid NOT NULL REFERENCES public.push_outbox(id) ON DELETE CASCADE,
 token_id uuid NOT NULL REFERENCES public.player_push_tokens(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','processing','accepted','sent','failed','skipped')),
 attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(), lease_id uuid,
 ticket_id text, error text, UNIQUE(outbox_id,token_id)
);
ALTER TABLE public.push_deliveries ENABLE ROW LEVEL SECURITY;
CREATE INDEX push_deliveries_due ON public.push_deliveries(available_at) WHERE status IN('pending','processing','accepted');
ALTER TABLE public.push_outbox ADD COLUMN expanded_at timestamptz;

CREATE OR REPLACE FUNCTION public.claim_push_deliveries() RETURNS SETOF public.push_deliveries
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 -- Do not deliver historical notifications when this worker is first deployed.
 UPDATE push_outbox SET status='skipped',error='Expired before delivery',expanded_at=now()
 WHERE status='pending' AND expanded_at IS NULL AND created_at<now()-interval '24 hours';
 WITH batch AS (SELECT id FROM push_outbox WHERE status='pending' AND expanded_at IS NULL ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED),
 expanded AS (UPDATE push_outbox o SET expanded_at=now() FROM batch b WHERE o.id=b.id RETURNING o.*)
 INSERT INTO push_deliveries(outbox_id,token_id)
 SELECT o.id,t.id FROM expanded o JOIN player_push_tokens t ON lower(t.email)=lower(o.email) AND t.token_kind='expo'
 ON CONFLICT DO NOTHING;
 UPDATE push_outbox o SET status='skipped',error='No registered Expo device'
 WHERE status='pending' AND expanded_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM push_deliveries d WHERE d.outbox_id=o.id);
 RETURN QUERY WITH due AS (
 SELECT id FROM push_deliveries WHERE status IN('pending','processing','accepted') AND available_at<=now()
 ORDER BY available_at LIMIT 20 FOR UPDATE SKIP LOCKED)
 UPDATE push_deliveries d SET status=CASE WHEN d.ticket_id IS NULL THEN 'processing' ELSE 'accepted' END,
 lease_id=gen_random_uuid(), attempts=attempts+1,available_at=now()+interval '5 minutes'
 FROM due WHERE d.id=due.id RETURNING d.*;
END $$;
REVOKE ALL ON FUNCTION public.claim_push_deliveries() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_push_deliveries() TO service_role;

CREATE OR REPLACE FUNCTION public.push_delivery_rollup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NEW.status IN('sent','failed','skipped') THEN
 UPDATE push_outbox o SET status=CASE
 WHEN EXISTS(SELECT 1 FROM push_deliveries d WHERE d.outbox_id=o.id AND d.status='sent') THEN 'sent'
 WHEN EXISTS(SELECT 1 FROM push_deliveries d WHERE d.outbox_id=o.id AND d.status='failed') THEN 'failed' ELSE 'skipped' END,
 sent_at=CASE WHEN EXISTS(SELECT 1 FROM push_deliveries d WHERE d.outbox_id=o.id AND d.status='sent') THEN now() ELSE NULL END
 WHERE o.id=NEW.outbox_id AND NOT EXISTS(SELECT 1 FROM push_deliveries d WHERE d.outbox_id=o.id AND d.status IN('pending','processing','accepted'));
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER push_delivery_rollup AFTER UPDATE ON public.push_deliveries FOR EACH ROW EXECUTE FUNCTION public.push_delivery_rollup();

-- State transitions, not client taps: rollbacks generate no notifications and unchanged saves generate none.
CREATE OR REPLACE FUNCTION public.notify_registration_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE event_name text; event_state text; prior jsonb := '{}'; kind text; partner text; self_email text; path text := '/calendar';
BEGIN
 IF TG_OP='UPDATE' THEN prior:=to_jsonb(OLD); END IF;
 SELECT calendar.event_name,calendar.event_status INTO event_name,event_state FROM calendar WHERE id=NEW.event_id;
 event_name:=coalesce(event_name,'your tournament');
 self_email:=lower(trim(NEW.email)); partner:=nullif(lower(trim(NEW.partner_email)),'');
 IF (TG_OP='INSERT' OR prior->>'status'='withdrawn') AND coalesce(NEW.status,'registered')<>'withdrawn' THEN
 kind:=CASE WHEN nullif(lower(trim(NEW.registered_by)),'') IS NOT NULL AND lower(trim(NEW.registered_by))<>self_email THEN 'partner_entry_paid' ELSE 'event_registration' END;
 PERFORM enqueue_push(self_email,kind,CASE WHEN kind='partner_entry_paid' THEN 'You’ve been entered' ELSE 'Entry successful' END,
 CASE WHEN kind='partner_entry_paid' THEN coalesce(NEW.partner_name,'Your partner')||' entered you into '||event_name||'.' ELSE 'Your entry for '||event_name||' has been received.' END,path);
 END IF;
 IF TG_OP='UPDATE' AND NEW.status='withdrawn' AND OLD.status IS DISTINCT FROM NEW.status AND event_state IS DISTINCT FROM 'cancelled' THEN
 PERFORM enqueue_push(self_email,'entry_withdrawn','Withdrawal confirmed','You have withdrawn from '||event_name||'.',path);
 partner:=nullif(lower(trim(OLD.partner_email)),'');
 IF partner IS NOT NULL AND partner<>self_email THEN
 PERFORM enqueue_push(partner,'entry_withdrawn','Partner withdrew',coalesce(OLD.full_name,'Your partner')||' withdrew from '||event_name||'.',path);
 END IF;
 END IF;
 IF NEW.payment_status='paid' AND prior->>'payment_status' IS DISTINCT FROM 'paid' THEN
 PERFORM enqueue_push(self_email,'payment_confirmation','Payment received','Your payment for '||event_name||' is confirmed.',path);
 END IF;
 IF NEW.payment_status='refunded' AND prior->>'payment_status' IS DISTINCT FROM 'refunded' THEN
 PERFORM enqueue_push(self_email,'entry_refunded','Entry refunded','Your entry for '||event_name||' has been refunded.',path);
 END IF;
 IF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM 'withdrawn' THEN
 IF NEW.division_id IS DISTINCT FROM OLD.division_id THEN
 PERFORM enqueue_push(self_email,'division_changed','Division updated','Your division at '||event_name||' is now '||coalesce(NEW.division,'updated')||'.',path);
 END IF;
 -- Notify the owner of the reciprocal row only, avoiding two pushes for each partner link.
 IF NEW.partner_email IS DISTINCT FROM OLD.partner_email AND event_state IS DISTINCT FROM 'cancelled' THEN
 PERFORM enqueue_push(self_email,'partner_assigned',CASE WHEN NEW.partner_email IS NULL THEN 'Partner removed' ELSE 'Partner confirmed' END,
 CASE WHEN NEW.partner_email IS NULL THEN 'Your entry for '||event_name||' no longer has a partner.' ELSE 'You’re playing with '||coalesce(NEW.partner_name,'your partner')||' at '||event_name||'.' END,path);
 END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER notify_registration_change AFTER INSERT OR UPDATE ON public.event_registrations FOR EACH ROW EXECUTE FUNCTION public.notify_registration_change();

CREATE OR REPLACE FUNCTION public.notify_player_created() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF nullif(trim(NEW.email),'') IS NOT NULL THEN
 PERFORM enqueue_push(NEW.email,'registration_complete','Registration complete','Your 4M Padel player profile is ready.','/(tabs)/profile');
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER notify_player_created AFTER INSERT ON public.players FOR EACH ROW EXECUTE FUNCTION public.notify_player_created();

CREATE OR REPLACE FUNCTION public.notify_event_cancelled() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE recipient text; event_id_value bigint; event_name text;
BEGIN
 IF TG_TABLE_NAME='calendar' THEN
 IF NEW.event_status IS DISTINCT FROM 'cancelled' OR OLD.event_status='cancelled' THEN RETURN NEW; END IF;
 event_id_value:=NEW.id; event_name:=NEW.event_name;
 ELSE
 IF NEW.cancelled_at IS NULL OR OLD.cancelled_at IS NOT NULL THEN RETURN NEW; END IF;
 event_id_value:=NEW.event_id; SELECT calendar.event_name||' — '||NEW.name INTO event_name FROM calendar WHERE id=event_id_value;
 END IF;
 FOR recipient IN SELECT DISTINCT lower(trim(email)) FROM (
 SELECT r.email FROM event_registrations r WHERE r.event_id=event_id_value AND (TG_TABLE_NAME='calendar' OR r.status IS DISTINCT FROM 'withdrawn') AND (TG_TABLE_NAME='calendar' OR r.division_id::text=NEW.id::text)
 UNION SELECT r.partner_email FROM event_registrations r WHERE r.event_id=event_id_value AND (TG_TABLE_NAME='calendar' OR r.status IS DISTINCT FROM 'withdrawn') AND (TG_TABLE_NAME='calendar' OR r.division_id::text=NEW.id::text)
 ) recipients WHERE nullif(trim(email),'') IS NOT NULL LOOP
 PERFORM enqueue_push(recipient,'event_cancelled','Event cancelled',event_name||' has been cancelled. Open the app for details.','/calendar');
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER notify_event_cancelled AFTER UPDATE ON public.calendar FOR EACH ROW EXECUTE FUNCTION public.notify_event_cancelled();
CREATE TRIGGER notify_division_cancelled AFTER UPDATE ON public.tournament_divisions FOR EACH ROW EXECUTE FUNCTION public.notify_event_cancelled();

CREATE OR REPLACE FUNCTION public.notify_draw_published() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE recipient text; event_name text;
BEGIN
 IF NEW.status='published' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'published') THEN
 SELECT calendar.event_name INTO event_name FROM calendar WHERE id=NEW.event_id;
 FOR recipient IN SELECT DISTINCT lower(trim(email)) FROM (
 SELECT email FROM event_registrations WHERE division_id=NEW.division_id AND status IS DISTINCT FROM 'withdrawn'
 UNION SELECT partner_email FROM event_registrations WHERE division_id=NEW.division_id AND status IS DISTINCT FROM 'withdrawn') r WHERE nullif(trim(email),'') IS NOT NULL LOOP
 PERFORM enqueue_push(recipient,'draws_ready','Draws are ready','The draw for '||coalesce(event_name,'your tournament')||' is ready.','/calendar');
 END LOOP;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER notify_draw_published AFTER INSERT OR UPDATE ON public.draws FOR EACH ROW EXECUTE FUNCTION public.notify_draw_published();
CREATE OR REPLACE FUNCTION public.push_preferences_for_email(p_email text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce((SELECT notification_prefs FROM players WHERE lower(trim(email))=lower(trim(p_email)) LIMIT 1),'{}'::jsonb);
$$;
REVOKE ALL ON FUNCTION public.push_preferences_for_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.push_preferences_for_email(text) TO service_role;

-- Single-row team entries (including organiser entries) also notify the partner.
-- Deferral lets a batch insert create reciprocal rows before checking for duplicates.
CREATE OR REPLACE FUNCTION public.notify_single_row_partner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE event_name text;
BEGIN
 IF nullif(trim(NEW.partner_email),'') IS NOT NULL AND lower(NEW.partner_email)<>lower(NEW.email)
 AND NEW.status IS DISTINCT FROM 'withdrawn'
 AND NOT EXISTS(SELECT 1 FROM event_registrations r WHERE r.event_id=NEW.event_id AND r.division_id IS NOT DISTINCT FROM NEW.division_id AND lower(r.email)=lower(NEW.partner_email) AND r.status IS DISTINCT FROM 'withdrawn') THEN
 SELECT calendar.event_name INTO event_name FROM calendar WHERE id=NEW.event_id;
 PERFORM enqueue_push(NEW.partner_email,'partner_entry_paid','You’ve been entered',coalesce(NEW.full_name,'Your partner')||' entered you into '||coalesce(event_name,'a tournament')||'.','/calendar');
 END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER notify_single_row_partner AFTER INSERT ON public.event_registrations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.notify_single_row_partner();
CREATE OR REPLACE FUNCTION public.register_push_token(
    p_token text,
    p_platform text,
    p_token_kind text DEFAULT 'expo',
    p_app_version text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email text := lower(trim(auth.jwt() ->> 'email'));
    v_player_id bigint;
BEGIN
    IF v_email IS NULL OR v_email = '' THEN
        RAISE EXCEPTION 'Not signed in';
    END IF;
    IF p_token IS NULL OR length(trim(p_token)) < 8 THEN
        RAISE EXCEPTION 'Invalid push token';
    END IF;
    IF p_platform NOT IN ('ios', 'android') THEN
        RAISE EXCEPTION 'platform must be ios or android';
    END IF;
    IF p_token_kind NOT IN ('expo', 'apns', 'fcm') THEN
        RAISE EXCEPTION 'token_kind must be expo, apns, or fcm';
    END IF;

    SELECT id INTO v_player_id
    FROM public.players
    WHERE lower(trim(email)) = v_email
    LIMIT 1;

    INSERT INTO public.player_push_tokens (email, player_id, token, token_kind, platform, app_version)
    VALUES (v_email, v_player_id, trim(p_token), p_token_kind, p_platform, p_app_version)
    ON CONFLICT (token) DO UPDATE SET
        email = EXCLUDED.email,
        player_id = EXCLUDED.player_id,
        token_kind = EXCLUDED.token_kind,
        platform = EXCLUDED.platform,
        app_version = EXCLUDED.app_version,
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.unregister_push_token(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email text := lower(trim(auth.jwt() ->> 'email'));
BEGIN
    IF v_email IS NULL OR v_email = '' THEN
        RAISE EXCEPTION 'Not signed in';
    END IF;
    DELETE FROM public.player_push_tokens
    WHERE token = trim(p_token)
      AND lower(trim(email)) = v_email;
END;
$$;


DROP POLICY "Own push tokens" ON public.player_push_tokens;
CREATE POLICY "Own push tokens" ON public.player_push_tokens FOR ALL TO authenticated
 USING (lower(email)=lower(auth.jwt()->>'email')) WITH CHECK (lower(email)=lower(auth.jwt()->>'email'));
REVOKE ALL ON FUNCTION public.register_push_token(text,text,text,text),public.unregister_push_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_push_token(text,text,text,text),public.unregister_push_token(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_player_notifications() RETURNS TABLE(id uuid,type text,title text,body text,path text,created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT o.id,o.type,o.title,o.body,o.path,o.created_at FROM push_outbox o
 WHERE auth.uid() IS NOT NULL AND lower(o.email)=lower(auth.jwt()->>'email')
 ORDER BY o.created_at DESC LIMIT 50;
$$;
REVOKE ALL ON FUNCTION public.get_player_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_player_notifications() TO authenticated;
CREATE OR REPLACE FUNCTION public.enqueue_push(
    p_email text,
    p_type text,
    p_title text,
    p_body text,
    p_path text DEFAULT NULL,
    p_data jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email text := lower(trim(p_email));
    v_pref text;
    v_status text := 'pending';
    v_id uuid;
BEGIN
    IF v_email IS NULL OR v_email = '' THEN
        RAISE EXCEPTION 'email is required';
    END IF;

    SELECT CASE WHEN notification_prefs->>'push_enabled'='false' THEN 'false' ELSE notification_prefs->>p_type END
    INTO v_pref
    FROM public.players
    WHERE lower(trim(email)) = v_email
    LIMIT 1;

    IF v_pref = 'false' THEN
        v_status := 'skipped';
    END IF;

    INSERT INTO public.push_outbox (email, type, title, body, path, data, status)
    VALUES (v_email, p_type, p_title, p_body, p_path, COALESCE(p_data, '{}'::jsonb), v_status)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

GRANT ALL ON public.push_deliveries TO service_role;
REVOKE ALL ON FUNCTION public.enqueue_push(text,text,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_push(text,text,text,text,text,jsonb) TO service_role;
COMMIT;
