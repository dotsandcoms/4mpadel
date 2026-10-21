BEGIN;
CREATE TABLE public.pro_match_bookmarks (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 match_id integer NOT NULL CHECK(match_id>0), bookmarked boolean NOT NULL DEFAULT true,
 notify_enabled boolean NOT NULL DEFAULT false, notified_at timestamptz,
 outbox_id uuid REFERENCES public.push_outbox(id), metadata jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
 PRIMARY KEY(user_id,match_id)
);
ALTER TABLE public.pro_match_bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read their own match bookmarks" ON public.pro_match_bookmarks FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
REVOKE ALL ON public.pro_match_bookmarks FROM anon,authenticated;
GRANT SELECT ON public.pro_match_bookmarks TO authenticated;
GRANT ALL ON public.pro_match_bookmarks TO service_role;
CREATE INDEX pro_match_bookmarks_pending ON public.pro_match_bookmarks(expires_at,match_id) WHERE bookmarked AND notify_enabled AND notified_at IS NULL;

CREATE OR REPLACE FUNCTION public.notification_type_keys() RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT ARRAY['push_enabled','registration_complete','event_cancelled','partner_assigned','partner_entry_paid','partner_invite','event_registration','payment_confirmation','payment_reminder','entry_withdrawn','entry_refunded','draws_ready','division_changed','match_reminder','ranking_change','club_announcement','registration_open','early_bird_ending','registration_closing','registration_closed','schedule_published','schedule_changed','match_progression','opponent_confirmed','result_confirmed','result_corrected','tournament_live','tournament_finished','event_updated','followed_events','quiet_hours_enabled','pro_match_live'];
$$;
ALTER TABLE public.push_outbox DROP CONSTRAINT push_outbox_type_check;
ALTER TABLE public.push_outbox ADD CONSTRAINT push_outbox_type_check CHECK(type IN(
 'registration_complete','event_cancelled','partner_assigned','partner_entry_paid','partner_invite','event_registration','payment_confirmation','payment_reminder','entry_withdrawn','entry_refunded','draws_ready','division_changed','match_reminder','ranking_change','club_announcement','registration_open','early_bird_ending','registration_closing','registration_closed','schedule_published','schedule_changed','match_progression','opponent_confirmed','result_confirmed','result_corrected','tournament_live','tournament_finished','event_updated','pro_match_live'));

CREATE FUNCTION public.get_pro_match_bookmarks() RETURNS TABLE(match_id integer,notify_enabled boolean,metadata jsonb)
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT b.match_id,b.notify_enabled,b.metadata FROM public.pro_match_bookmarks b WHERE b.user_id=auth.uid() AND b.bookmarked ORDER BY b.created_at DESC;
$$;
CREATE FUNCTION public.set_pro_match_bookmark(p_match_id integer,p_enabled boolean,p_notify boolean DEFAULT false,p_metadata jsonb DEFAULT '{}') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); previous public.pro_match_bookmarks; expiry timestamptz; clean jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in to save a match'; END IF;
 IF p_match_id IS NULL OR p_match_id<=0 OR p_enabled IS NULL OR p_notify IS NULL OR p_metadata IS NULL OR jsonb_typeof(p_metadata)<>'object' THEN RAISE EXCEPTION 'Invalid match bookmark'; END IF;
 -- Serialize each user's saves so concurrent requests cannot bypass the pending-alert limit.
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,0));
 SELECT * INTO previous FROM public.pro_match_bookmarks WHERE user_id=uid AND match_id=p_match_id FOR UPDATE;
 IF p_enabled AND p_notify AND (previous.match_id IS NULL OR NOT previous.notify_enabled) AND
   (SELECT count(*) FROM public.pro_match_bookmarks WHERE user_id=uid AND bookmarked AND notify_enabled AND notified_at IS NULL AND expires_at>now())>=100 THEN RAISE EXCEPTION 'You can enable alerts for up to 100 upcoming matches'; END IF;
 clean:=jsonb_build_object('name',left(coalesce(p_metadata->>'name','Your saved match'),300),'tournament_name',left(coalesce(p_metadata->>'tournament_name','International padel'),160));
 expiry:=now()+interval '30 days';
 IF coalesce(p_metadata->>'date','')~'^\d{4}-\d{2}-\d{2}$' THEN
  BEGIN expiry:=least(now()+interval '45 days',greatest(now()+interval '1 day',(p_metadata->>'date')::date+interval '3 days')); EXCEPTION WHEN datetime_field_overflow THEN NULL; END;
 END IF;
 IF previous.outbox_id IS NOT NULL AND (NOT p_enabled OR NOT p_notify) THEN UPDATE public.push_outbox SET obsolete=true WHERE id=previous.outbox_id; END IF;
 INSERT INTO public.pro_match_bookmarks(user_id,match_id,bookmarked,notify_enabled,metadata,expires_at)
 VALUES(uid,p_match_id,p_enabled,p_enabled AND p_notify,clean,expiry)
 ON CONFLICT(user_id,match_id) DO UPDATE SET bookmarked=excluded.bookmarked,notify_enabled=excluded.notify_enabled,metadata=excluded.metadata,expires_at=excluded.expires_at;
END $$;

-- Only the trusted worker can report provider live status. One outbox entry per user/match, even across retries.
CREATE FUNCTION public.notify_pro_matches_live(p_match_ids integer[]) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE bookmark public.pro_match_bookmarks; recipient text; notice uuid; sent integer:=0;
BEGIN
 FOR bookmark IN SELECT * FROM public.pro_match_bookmarks WHERE match_id=ANY(p_match_ids) AND bookmarked AND notify_enabled AND notified_at IS NULL AND expires_at>now() FOR UPDATE SKIP LOCKED LOOP
  SELECT lower(trim(email)) INTO recipient FROM auth.users WHERE id=bookmark.user_id;
  IF recipient IS NULL THEN CONTINUE; END IF;
  notice:=public.enqueue_push(recipient,'pro_match_live','Your starred match is live',coalesce(bookmark.metadata->>'name','Your saved match')||' · '||coalesce(bookmark.metadata->>'tournament_name','International padel'),'/pro/match/'||bookmark.match_id,jsonb_build_object('pro_match_id',bookmark.match_id,'bookmark_user_id',bookmark.user_id));
  UPDATE public.push_outbox SET expires_at=now()+interval '15 minutes' WHERE id=notice;
  UPDATE public.pro_match_bookmarks SET notified_at=now(),outbox_id=notice WHERE user_id=bookmark.user_id AND match_id=bookmark.match_id;
  sent:=sent+1;
 END LOOP;
 RETURN sent;
END $$;
CREATE FUNCTION public.pro_match_alert_is_active(p_outbox uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.pro_match_bookmarks b JOIN public.push_outbox o ON o.id=b.outbox_id WHERE o.id=p_outbox AND b.bookmarked AND b.notify_enabled AND NOT o.obsolete AND o.expires_at>now());
$$;
REVOKE ALL ON FUNCTION public.get_pro_match_bookmarks(),public.set_pro_match_bookmark(integer,boolean,boolean,jsonb),public.notify_pro_matches_live(integer[]),public.pro_match_alert_is_active(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_pro_match_bookmarks(),public.set_pro_match_bookmark(integer,boolean,boolean,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_pro_matches_live(integer[]),public.pro_match_alert_is_active(uuid) TO service_role;
COMMIT;
