-- Requires shared Tournament Manager migrations through 20260916140000 and mobile push delivery.
BEGIN;
ALTER TABLE public.push_outbox DROP CONSTRAINT push_outbox_type_check;
ALTER TABLE public.push_outbox ADD CONSTRAINT push_outbox_type_check CHECK(type IN(
 'registration_complete','event_cancelled','partner_assigned','partner_entry_paid','partner_invite',
 'event_registration','payment_confirmation','payment_reminder','entry_withdrawn','entry_refunded',
 'draws_ready','division_changed','match_reminder','ranking_change','club_announcement',
 'registration_open','early_bird_ending','registration_closing','registration_closed',
 'schedule_published','schedule_changed','match_progression','opponent_confirmed','result_confirmed',
 'result_corrected','tournament_live','tournament_finished','event_updated'));
ALTER TABLE public.push_outbox ADD COLUMN not_before timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN expires_at timestamptz, ADD COLUMN obsolete boolean NOT NULL DEFAULT false;
CREATE INDEX push_outbox_due ON public.push_outbox(not_before) WHERE status='pending' AND NOT obsolete;

CREATE TABLE public.event_notification_follows (
 event_id bigint REFERENCES public.calendar(id) ON DELETE CASCADE, email text NOT NULL,
 following boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(event_id,email)
);
ALTER TABLE public.event_notification_follows ENABLE ROW LEVEL SECURITY;
-- Only RPC access: following never allows one player to subscribe another.
CREATE FUNCTION public.event_notification_participants(p_event bigint,p_division uuid DEFAULT NULL)
RETURNS TABLE(email text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT DISTINCT lower(trim(value)) FROM event_registrations r LEFT JOIN tournament_divisions v ON v.id=r.division_id
 CROSS JOIN LATERAL unnest(ARRAY[r.email,r.partner_email]) value
 WHERE r.event_id=p_event AND (p_division IS NULL OR r.division_id=p_division)
 AND r.status IS DISTINCT FROM 'withdrawn' AND v.cancelled_at IS NULL AND nullif(trim(value),'') IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM event_registrations withdrawn WHERE withdrawn.event_id=r.event_id AND withdrawn.division_id IS NOT DISTINCT FROM r.division_id AND withdrawn.status='withdrawn' AND lower(trim(withdrawn.email))=lower(trim(value))
 AND NOT EXISTS(SELECT 1 FROM event_registrations active WHERE active.event_id=r.event_id AND active.division_id IS NOT DISTINCT FROM r.division_id AND active.status IS DISTINCT FROM 'withdrawn' AND lower(trim(active.email))=lower(trim(value))));
$$;
CREATE FUNCTION public.get_event_notification_follow(p_event bigint) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('following',coalesce((SELECT following FROM event_notification_follows WHERE event_id=p_event AND email=lower(trim(auth.jwt()->>'email'))),false),
 'participating',EXISTS(SELECT 1 FROM event_notification_participants(p_event) p WHERE p.email=lower(trim(auth.jwt()->>'email'))));
$$;
CREATE FUNCTION public.set_event_notification_follow(p_event bigint,p_following boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR nullif(trim(auth.jwt()->>'email'),'') IS NULL THEN RAISE EXCEPTION 'Sign in to follow tournaments'; END IF;
 IF p_following IS NULL THEN RAISE EXCEPTION 'Choose a follow preference'; END IF;
 IF NOT EXISTS(SELECT 1 FROM calendar WHERE id=p_event AND is_visible IS DISTINCT FROM false AND (sanction_status IS NULL OR sanction_status='approved')) THEN RAISE EXCEPTION 'Event unavailable'; END IF;
 INSERT INTO event_notification_follows(event_id,email,following) VALUES(p_event,lower(trim(auth.jwt()->>'email')),p_following)
 ON CONFLICT(event_id,email) DO UPDATE SET following=excluded.following,created_at=CASE WHEN event_notification_follows.following<>excluded.following THEN now() ELSE event_notification_follows.created_at END;
END $$;
CREATE FUNCTION public.notification_type_keys() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
 SELECT ARRAY['push_enabled','registration_complete','event_cancelled','partner_assigned','partner_entry_paid','partner_invite','event_registration','payment_confirmation','payment_reminder','entry_withdrawn','entry_refunded','draws_ready','division_changed','match_reminder','ranking_change','club_announcement','registration_open','early_bird_ending','registration_closing','registration_closed','schedule_published','schedule_changed','match_progression','opponent_confirmed','result_confirmed','result_corrected','tournament_live','tournament_finished','event_updated','followed_events','quiet_hours_enabled'];
$$;
CREATE OR REPLACE FUNCTION public.set_notification_pref(p_type text,p_enabled boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
 IF p_enabled IS NULL OR p_type IS NULL OR NOT p_type=ANY(notification_type_keys()) THEN RAISE EXCEPTION 'Invalid preference'; END IF;
 UPDATE players SET notification_prefs=jsonb_set(coalesce(notification_prefs,'{}'),ARRAY[p_type],to_jsonb(p_enabled)) WHERE lower(trim(email))=lower(trim(auth.jwt()->>'email'));
 IF NOT FOUND THEN RAISE EXCEPTION 'Complete your player profile first'; END IF;
END $$;
CREATE FUNCTION public.set_notification_timing(p_minutes integer,p_start integer,p_end integer,p_timezone text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
 IF p_minutes IS NULL OR p_minutes NOT IN(15,30,60) OR p_start IS NULL OR p_end IS NULL OR p_start NOT BETWEEN 0 AND 23 OR p_end NOT BETWEEN 0 AND 23 OR p_start=p_end OR p_timezone IS NULL OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_timezone) THEN RAISE EXCEPTION 'Invalid reminder or quiet-hour settings'; END IF;
 UPDATE players SET notification_prefs=coalesce(notification_prefs,'{}')||jsonb_build_object('reminder_minutes',p_minutes,'quiet_start',p_start,'quiet_end',p_end,'timezone',p_timezone)
 WHERE lower(trim(email))=lower(trim(auth.jwt()->>'email'));
 IF NOT FOUND THEN RAISE EXCEPTION 'Complete your player profile first'; END IF;
END $$;

-- Actual entrants only: unlike tm_match_players, never recurse into possible feeder teams.
CREATE FUNCTION public.notification_match_recipients(p_match uuid) RETURNS TABLE(email text,entry_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH match AS(SELECT m.*,d.event_id,d.division_id,d.scoring_rules FROM draw_matches m JOIN draws d ON d.id=m.draw_id WHERE m.id=p_match),
 entrants AS(SELECT e.* FROM draw_entries e,match m WHERE e.id IN(m.entry_one_id,m.entry_two_id) AND e.status='active'),
 people AS(
 SELECT coalesce(p.email,e.snapshot->>'registration_email') email,e.id entry_id FROM entrants e LEFT JOIN players p ON p.id=e.player_one_id
 UNION SELECT coalesce(p.email,e.snapshot->>'partner_email'),e.id FROM entrants e LEFT JOIN players p ON p.id=e.player_two_id
 UNION SELECT CASE WHEN pid LIKE '%:partner' THEN r.partner_email ELSE r.email END,NULL::uuid
 FROM match m CROSS JOIN LATERAL jsonb_array_elements(coalesce(m.scoring_rules->'americano'->'fixtures','[]')) f
 CROSS JOIN LATERAL jsonb_array_elements_text(coalesce(f->'one','[]')||coalesce(f->'two','[]')) pid
 JOIN event_registrations r ON r.id::text=replace(pid,':partner','') WHERE f->>'id'=m.americano_fixture_key AND r.status IS DISTINCT FROM 'withdrawn')
 SELECT DISTINCT lower(trim(p.email)),p.entry_id FROM people p,match m
 WHERE nullif(trim(p.email),'') IS NOT NULL AND EXISTS(SELECT 1 FROM event_notification_participants(m.event_id,m.division_id) a WHERE a.email=lower(trim(p.email)));
$$;
CREATE FUNCTION public.notification_match_state(p_match uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('event_id',d.event_id,'division_id',d.division_id,'draw_id',d.id,
 'status',m.status,'one',m.entry_one_id,'two',m.entry_two_id,'winner',m.winner_entry_id,'round',m.round_label,
 'start',s.published_assignments->m.id::text->>'scheduled_start','court',s.published_assignments->m.id::text->>'court_name',
 'one_name',a.team_name,'two_name',b.team_name,'recipients',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.email),'[]') FROM notification_match_recipients(m.id) r),
 'scores',CASE WHEN m.americano_fixture_key IS NOT NULL THEN (SELECT f->'score' FROM jsonb_array_elements(coalesce(d.scoring_rules->'americano'->'fixtures','[]')) f WHERE f->>'id'=m.americano_fixture_key)
 ELSE (SELECT coalesce(jsonb_agg(jsonb_build_array(entry_one_games,entry_two_games) ORDER BY set_number),'[]') FROM draw_match_sets WHERE match_id=m.id) END)
 FROM draw_matches m JOIN draws d ON d.id=m.draw_id LEFT JOIN tournament_schedules s ON s.event_id=d.event_id
 LEFT JOIN draw_entries a ON a.id=m.entry_one_id LEFT JOIN draw_entries b ON b.id=m.entry_two_id WHERE m.id=p_match;
$$;
CREATE TABLE public.notification_match_snapshots(match_id uuid PRIMARY KEY REFERENCES draw_matches(id) ON DELETE CASCADE,state jsonb NOT NULL);
INSERT INTO notification_match_snapshots SELECT m.id,notification_match_state(m.id) FROM draw_matches m;
ALTER TABLE public.notification_match_snapshots ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.notification_event_snapshots(event_id bigint PRIMARY KEY REFERENCES calendar(id) ON DELETE CASCADE,state jsonb NOT NULL);
INSERT INTO notification_event_snapshots SELECT id,to_jsonb(c) FROM calendar c;
ALTER TABLE public.notification_event_snapshots ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.tournament_notification_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id bigint NOT NULL REFERENCES calendar(id) ON DELETE CASCADE,
 email text NOT NULL,topic text NOT NULL,revision text NOT NULL,fire_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,
 active boolean NOT NULL DEFAULT true,fired_revision text,outbox_id uuid REFERENCES push_outbox(id),
 type text NOT NULL,title text NOT NULL,body text NOT NULL,path text NOT NULL,data jsonb NOT NULL,
 UNIQUE(event_id,email,topic)
);
ALTER TABLE public.tournament_notification_jobs ENABLE ROW LEVEL SECURITY;
CREATE INDEX tournament_notification_jobs_due ON public.tournament_notification_jobs(fire_at) WHERE active;

CREATE FUNCTION public.plan_tournament_push(p_event bigint,p_email text,p_topic text,p_revision text,p_type text,p_title text,p_body text,p_path text,p_data jsonb,p_fire timestamptz,p_expire timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE previous public.tournament_notification_jobs;
BEGIN
 IF nullif(trim(p_email),'') IS NULL OR p_expire<=now() OR p_fire IS NULL THEN RETURN; END IF;
 SELECT * INTO previous FROM tournament_notification_jobs WHERE event_id=p_event AND email=lower(trim(p_email)) AND topic=p_topic FOR UPDATE;
 IF previous.revision IS DISTINCT FROM p_revision AND previous.outbox_id IS NOT NULL THEN UPDATE push_outbox SET obsolete=true WHERE id=previous.outbox_id AND status<>'sent'; END IF;
 INSERT INTO tournament_notification_jobs(event_id,email,topic,revision,type,title,body,path,data,fire_at,expires_at)
 VALUES(p_event,lower(trim(p_email)),p_topic,p_revision,p_type,p_title,p_body,p_path,p_data,p_fire,p_expire)
 ON CONFLICT(event_id,email,topic) DO UPDATE SET revision=excluded.revision,type=excluded.type,title=excluded.title,body=excluded.body,path=excluded.path,data=excluded.data,fire_at=excluded.fire_at,expires_at=excluded.expires_at,active=true;
END $$;

-- Quiet-hour end is calculated with the user's IANA zone, including DST boundaries.
CREATE FUNCTION public.notification_quiet_until(p_prefs jsonb,p_now timestamptz DEFAULT now()) RETURNS timestamptz
LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE zone text:=coalesce(p_prefs->>'timezone','Africa/Johannesburg'); local_time timestamp; start_hour int:=coalesce((p_prefs->>'quiet_start')::int,22); end_hour int:=coalesce((p_prefs->>'quiet_end')::int,7); hour int;
BEGIN
 IF p_prefs->>'quiet_hours_enabled' IS DISTINCT FROM 'true' THEN RETURN p_now; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=zone) THEN zone:='Africa/Johannesburg'; END IF;
 local_time:=p_now AT TIME ZONE zone; hour:=extract(hour FROM local_time);
 IF (start_hour<end_hour AND hour>=start_hour AND hour<end_hour) OR (start_hour>end_hour AND (hour>=start_hour OR hour<end_hour)) THEN
 RETURN (date_trunc('day',local_time)+make_interval(hours=>end_hour)+CASE WHEN start_hour>end_hour AND hour>=start_hour THEN interval '1 day' ELSE interval '0' END) AT TIME ZONE zone;
 END IF;
 RETURN p_now;
END $$;
CREATE OR REPLACE FUNCTION public.refresh_tournament_notifications() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_column
DECLARE c record; participant record; f record; r record; m record; j record; old_state jsonb; state jsonb; base text; label text; kind text; body text; revision text; at_time timestamptz; close_at timestamptz; open_at timestamptz; early_at timestamptz; prefs jsonb; minutes int; notify_id uuid; count_sent int:=0; old_start text; new_start text;
BEGIN
 IF NOT pg_try_advisory_xact_lock(hashtextextended('tournament-notifications',0)) THEN RETURN 0; END IF;
 -- Recompute scheduled intents on every run. Changed dates, withdrawals and unfollows deactivate old jobs.
 UPDATE tournament_notification_jobs SET active=false WHERE data->>'scheduled'='true';
 FOR c IN SELECT cal.* FROM calendar cal WHERE coalesce(cal.end_date,cal.start_date,current_date)>=current_date-7 AND cal.is_visible IS DISTINCT FROM false AND (cal.sanction_status IS NULL OR cal.sanction_status='approved') AND (
 EXISTS(SELECT 1 FROM event_registrations r WHERE r.event_id=cal.id AND r.status IS DISTINCT FROM 'withdrawn') OR
 EXISTS(SELECT 1 FROM event_notification_follows f WHERE f.event_id=cal.id AND f.following)) LOOP
  base:='/events/'||c.id; label:=coalesce(c.event_name,'Your tournament');
  SELECT s.state INTO old_state FROM notification_event_snapshots s WHERE s.event_id=c.id;
  state:=to_jsonb(c);
  IF c.event_status IS DISTINCT FROM 'cancelled' THEN
   open_at:=nullif(state->>'registration_opens_at','')::timestamptz;
   close_at:=nullif(state->>'registration_closes_at','')::timestamptz;
   early_at:=nullif(state->>'early_bird_ends_at','')::timestamptz;
   FOR f IN SELECT ef.email,ef.created_at FROM event_notification_follows ef WHERE ef.event_id=c.id AND ef.following
    AND NOT EXISTS(SELECT 1 FROM event_notification_participants(c.id) p WHERE p.email=ef.email)
    AND NOT EXISTS(SELECT 1 FROM event_registrations er WHERE er.event_id=c.id AND lower(trim(er.email))=ef.email AND er.status='withdrawn') LOOP
    IF open_at IS NOT NULL AND f.created_at<=open_at THEN
     PERFORM plan_tournament_push(c.id,f.email,'opens',open_at::text,'registration_open','Registration is open','Entries are open for '||label||'.',base,jsonb_build_object('scheduled',true,'audience','follower','field','registration_opens_at','at',open_at),open_at,least(open_at+interval '24 hours',coalesce(close_at,open_at+interval '24 hours')));
    END IF;
    IF early_at IS NOT NULL AND state->>'early_bird_fee' IS NOT NULL THEN
     PERFORM plan_tournament_push(c.id,f.email,'early',early_at::text,'early_bird_ending','Early bird ends soon','Early bird entries for '||label||' end '||to_char(early_at AT TIME ZONE 'Africa/Johannesburg','DD Mon at HH24:MI')||' SAST.',base,jsonb_build_object('scheduled',true,'audience','follower','field','early_bird_ends_at','at',early_at),greatest(coalesce(open_at,'-infinity'),early_at-interval '24 hours'),least(early_at,coalesce(close_at,early_at)));
    END IF;
    IF close_at IS NOT NULL THEN
     PERFORM plan_tournament_push(c.id,f.email,'closing',close_at::text,'registration_closing','Entries close soon',label||' closes '||to_char(close_at AT TIME ZONE 'Africa/Johannesburg','DD Mon at HH24:MI')||' SAST. Complete your entry.',base,jsonb_build_object('scheduled',true,'audience','follower','field','registration_closes_at','at',close_at),greatest(coalesce(open_at,'-infinity'),close_at-interval '24 hours'),close_at);
    END IF;
   END LOOP;
   -- Per-division deadlines take precedence. Paid/comped entries never receive payment reminders.
   FOR r IN SELECT er.*,least(coalesce(v.entries_close_at,close_at),coalesce(close_at,v.entries_close_at)) deadline
    FROM event_registrations er LEFT JOIN tournament_divisions v ON v.id=er.division_id
    WHERE er.event_id=c.id AND er.status IS DISTINCT FROM 'withdrawn' AND er.payment_status NOT IN('paid','comped','refunded') AND (v.cancelled_at IS NULL) LOOP
    IF r.deadline IS NOT NULL THEN
     PERFORM plan_tournament_push(c.id,r.email,'payment:'||r.id,r.deadline::text,'payment_reminder','Complete your entry','Payment for '||label||' — '||coalesce(r.division,'your division')||' is due '||to_char(r.deadline AT TIME ZONE 'Africa/Johannesburg','DD Mon at HH24:MI')||' SAST.',base,jsonb_build_object('scheduled',true,'audience','unpaid','registration_id',r.id,'deadline',r.deadline),r.deadline-interval '24 hours',r.deadline);
    END IF;
   END LOOP;
   FOR participant IN SELECT * FROM event_notification_participants(c.id) LOOP
    IF close_at IS NOT NULL AND EXISTS(SELECT 1 FROM event_registrations er WHERE er.event_id=c.id AND (lower(trim(er.email))=participant.email OR lower(trim(er.partner_email))=participant.email) AND er.status IS DISTINCT FROM 'withdrawn' AND er.payment_status IN('paid','comped')) THEN
     PERFORM plan_tournament_push(c.id,participant.email,'closed',close_at::text,'registration_closed','Registration closed','Entries for '||label||' have closed. View your team entry and tournament updates.',base,jsonb_build_object('scheduled',true,'audience','participant','field','registration_closes_at','at',close_at),close_at,close_at+interval '12 hours');
    END IF;
   END LOOP;
   -- A changed event gets one combined update. Times are informational until draws/results are actually published.
   IF old_state IS NOT NULL AND (old_state->'start_date',old_state->'end_date',old_state->'venue',old_state->'registration_closes_at',old_state->'draw_released') IS DISTINCT FROM (state->'start_date',state->'end_date',state->'venue',state->'registration_closes_at',state->'draw_released') THEN
    revision:=md5(jsonb_build_array(state->'start_date',state->'end_date',state->'venue',state->'registration_closes_at',state->'draw_released')::text);
    FOR participant IN SELECT email FROM event_notification_participants(c.id) UNION SELECT email FROM event_notification_follows WHERE event_id=c.id AND following LOOP
     PERFORM plan_tournament_push(c.id,participant.email,'event-update',revision,'event_updated','Tournament details changed',label||' has updated dates, venue or entry details. Review the latest information.',base,jsonb_build_object('audience','interested','event_revision',revision),now()+interval '60 seconds',now()+interval '24 hours');
    END LOOP;
   END IF;
  END IF;
  INSERT INTO notification_event_snapshots VALUES(c.id,state) ON CONFLICT(event_id) DO UPDATE SET state=excluded.state;
  -- Published match state is separate from private scheduling revisions.
  FOR m IN SELECT dm.*,d.status draw_status,d.division_id FROM draw_matches dm JOIN draws d ON d.id=dm.draw_id
   JOIN tournament_divisions v ON v.id=d.division_id WHERE d.event_id=c.id AND d.status IN('published','in_progress','completed') AND v.cancelled_at IS NULL LOOP
   state:=notification_match_state(m.id);
   SELECT s.state INTO old_state FROM notification_match_snapshots s WHERE s.match_id=m.id;
   revision:=md5(state::text);
   IF c.event_status IS DISTINCT FROM 'cancelled' THEN
    FOR participant IN SELECT * FROM notification_match_recipients(m.id) LOOP
     prefs:=push_preferences_for_email(participant.email); minutes:=coalesce((prefs->>'reminder_minutes')::int,30);
     at_time:=nullif(state->>'start','')::timestamptz;
     new_start:=CASE WHEN at_time IS NULL THEN 'Time to be confirmed' ELSE to_char(at_time AT TIME ZONE 'Africa/Johannesburg','DD Mon at HH24:MI')||' SAST' END;
     base:='/events/'||c.id||'?division='||m.division_id||'&match='||m.id;
     IF at_time>now() AND m.status IN('pending','scheduled') AND (m.entry_one_id IS NOT NULL AND m.entry_two_id IS NOT NULL OR m.americano_fixture_key IS NOT NULL) THEN
      PERFORM plan_tournament_push(c.id,participant.email,'reminder:'||m.id,md5(state::text||minutes),'match_reminder','Your match is coming up',coalesce(m.round_label,'Your match')||' at '||new_start||' on '||coalesce(state->>'court','your assigned court')||'.',base,jsonb_build_object('scheduled',true,'audience','match','match_id',m.id,'state',revision,'reminder_minutes',minutes),at_time-make_interval(mins=>minutes),at_time);
      -- One next-day briefing per player per event: only their first scheduled match of that day.
      IF NOT EXISTS(SELECT 1 FROM draw_matches other JOIN draws od ON od.id=other.draw_id WHERE od.event_id=c.id AND other.id<>m.id AND other.status IN('pending','scheduled') AND EXISTS(SELECT 1 FROM notification_match_recipients(other.id) op WHERE op.email=participant.email) AND (notification_match_state(other.id)->>'start')::timestamptz<at_time AND ((notification_match_state(other.id)->>'start')::timestamptz AT TIME ZONE 'Africa/Johannesburg')::date=(at_time AT TIME ZONE 'Africa/Johannesburg')::date) THEN
       PERFORM plan_tournament_push(c.id,participant.email,'tomorrow:'||(at_time AT TIME ZONE 'Africa/Johannesburg')::date,revision,'tournament_live','Your tournament day',label||': your first scheduled match is '||new_start||' on '||coalesce(state->>'court','your assigned court')||'.',base,jsonb_build_object('scheduled',true,'audience','match','match_id',m.id,'state',revision),(((at_time AT TIME ZONE 'Africa/Johannesburg')::date-1)+time '18:00') AT TIME ZONE 'Africa/Johannesburg',at_time);
      END IF;
     END IF;
     IF old_state IS DISTINCT FROM state THEN
      kind:=NULL; body:=NULL;
      IF m.status IN('completed','walkover','retired') AND old_state IS NOT NULL AND (old_state->>'status' NOT IN('completed','walkover','retired') OR (old_state->'winner',old_state->'scores') IS DISTINCT FROM (state->'winner',state->'scores')) THEN
       kind:=CASE WHEN old_state->>'status' IN('completed','walkover','retired') THEN 'result_corrected' ELSE 'result_confirmed' END;
       body:=coalesce(m.round_label,'Your match')||' at '||label||CASE WHEN kind='result_corrected' THEN ' has a corrected result.' ELSE ' has a confirmed result.' END;
      ELSIF m.status='in_progress' AND old_state->>'status' IS DISTINCT FROM 'in_progress' THEN
       kind:='tournament_live'; body:=coalesce(m.round_label,'Your match')||' at '||label||' is now live.';
      ELSIF m.status='cancelled' AND old_state->>'status' IS DISTINCT FROM 'cancelled' THEN
       kind:='schedule_changed'; body:=coalesce(m.round_label,'Your match')||' at '||label||' has been cancelled. Check your updated schedule.';
      ELSIF m.status IN('pending','scheduled') THEN
       IF (state->'start',state->'court') IS DISTINCT FROM (old_state->'start',old_state->'court') AND at_time IS NOT NULL THEN
        kind:=CASE WHEN old_state->>'start' IS NULL THEN 'schedule_published' ELSE 'schedule_changed' END;
        old_start:=CASE WHEN old_state->>'start' IS NULL THEN NULL ELSE to_char((old_state->>'start')::timestamptz AT TIME ZONE 'Africa/Johannesburg','DD Mon HH24:MI')||' on '||coalesce(old_state->>'court','court TBC') END;
        body:=coalesce(m.round_label,'Your match')||': '||CASE WHEN old_start IS NULL THEN '' ELSE old_start||' → ' END||new_start||' on '||coalesce(state->>'court','court TBC')||'.';
       ELSIF old_state IS NOT NULL AND (old_state->'one',old_state->'two') IS DISTINCT FROM(state->'one',state->'two') THEN
        IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(old_state->'recipients','[]')) person WHERE person->>'email'=participant.email) THEN
         kind:='match_progression'; body:='Your next round is '||coalesce(m.round_label,'confirmed')||' at '||label||'. '||new_start||'.';
        ELSIF m.entry_one_id IS NOT NULL AND m.entry_two_id IS NOT NULL THEN
         kind:='opponent_confirmed'; body:='Your opponent for '||coalesce(m.round_label,'your match')||' is '||coalesce(CASE WHEN participant.entry_id=m.entry_one_id THEN state->>'two_name' ELSE state->>'one_name' END,'now confirmed')||'.';
        END IF;
       END IF;
      END IF;
      IF kind IS NOT NULL THEN
       PERFORM plan_tournament_push(c.id,participant.email,'match-update:'||m.id,revision,kind,CASE kind WHEN 'result_confirmed' THEN 'Result confirmed' WHEN 'result_corrected' THEN 'Result corrected' WHEN 'schedule_published' THEN 'Your schedule is ready' WHEN 'schedule_changed' THEN 'Match schedule changed' WHEN 'match_progression' THEN 'Your next round' WHEN 'tournament_live' THEN 'Your match is live' ELSE 'Opponent confirmed' END,body,base,jsonb_build_object('audience','match','match_id',m.id,'state',revision),now()+interval '60 seconds',CASE WHEN kind IN('schedule_published','schedule_changed','opponent_confirmed','match_progression') AND at_time>now() THEN least(at_time,now()+interval '24 hours') ELSE now()+interval '24 hours' END);
      END IF;
     END IF;
    END LOOP;
   END IF;
   INSERT INTO notification_match_snapshots VALUES(m.id,state) ON CONFLICT(match_id) DO UPDATE SET state=excluded.state;
  END LOOP;
 END LOOP;
 -- Withdrawn/cancelled/replaced reminders are removed from both delivery and inbox.
 UPDATE push_outbox o SET obsolete=true FROM tournament_notification_jobs j WHERE o.id=j.outbox_id AND (NOT j.active OR j.expires_at<=now());
 FOR j IN SELECT * FROM tournament_notification_jobs WHERE active AND fire_at<=now() AND expires_at>now() AND fired_revision IS DISTINCT FROM revision ORDER BY fire_at LIMIT 500 FOR UPDATE SKIP LOCKED LOOP
  notify_id:=enqueue_push(j.email,j.type,j.title,j.body,j.path,j.data||jsonb_build_object('job_id',j.id,'revision',j.revision,'event_id',j.event_id));
  UPDATE push_outbox SET expires_at=j.expires_at WHERE id=notify_id;
  UPDATE tournament_notification_jobs SET outbox_id=notify_id,fired_revision=revision WHERE id=j.id;
  count_sent:=count_sent+1;
 END LOOP;
 RETURN count_sent;
END $$;
-- Finalisation and points awards are authoritative; planned calendar dates are never publication signals.
CREATE FUNCTION public.notify_tournament_finalisation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE recipient record; event_name text;
BEGIN
 IF TG_OP='UPDATE' AND NEW.fingerprint IS NOT DISTINCT FROM OLD.fingerprint THEN RETURN NEW; END IF;
 SELECT c.event_name INTO event_name FROM calendar c WHERE c.id=NEW.event_id;
 FOR recipient IN SELECT * FROM event_notification_participants(NEW.event_id,NEW.division_id) LOOP
  PERFORM plan_tournament_push(NEW.event_id,recipient.email,'finished:'||NEW.division_id,NEW.fingerprint,'tournament_finished','Your results are ready',coalesce(event_name,'Your tournament')||' has confirmed your division’s final results.','/events/'||NEW.event_id||'?division='||NEW.division_id||'&tab=Results',jsonb_build_object('audience','participant','division_id',NEW.division_id,'finalisation',NEW.fingerprint),now()+interval '60 seconds',now()+interval '24 hours');
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER notify_tournament_finalisation AFTER INSERT OR UPDATE ON public.tournament_finalisations FOR EACH ROW EXECUTE FUNCTION public.notify_tournament_finalisation();
CREATE FUNCTION public.notify_ranking_award() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE recipient text; event_name text;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.points,NEW.round_code,NEW.reversal_of) IS NOT DISTINCT FROM(OLD.points,OLD.round_code,OLD.reversal_of) THEN RETURN NEW; END IF;
 SELECT email INTO recipient FROM players WHERE id=NEW.player_id;
 SELECT c.event_name INTO event_name FROM calendar c WHERE c.id=NEW.event_id;
 PERFORM plan_tournament_push(NEW.event_id,recipient,'ranking:'||NEW.id,md5(jsonb_build_array(NEW.points,NEW.round_code,NEW.reversal_of)::text),'ranking_change','Tournament points updated',coalesce(event_name,'Your tournament')||': your points award is now '||NEW.points||'.','/events/'||NEW.event_id||'?division='||NEW.division_id||'&tab=Results',jsonb_build_object('audience','award','award_id',NEW.id,'points',NEW.points,'round',NEW.round_code,'reversal',NEW.reversal_of),now()+interval '60 seconds',now()+interval '24 hours');
 RETURN NEW;
END $$;
CREATE TRIGGER notify_ranking_award AFTER INSERT OR UPDATE ON public.player_ranking_points FOR EACH ROW EXECUTE FUNCTION public.notify_ranking_award();

CREATE FUNCTION public.push_delivery_context(p_outbox uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.push_outbox; j public.tournament_notification_jobs; c public.calendar; prefs jsonb; until_time timestamptz; valid boolean:=true; m jsonb;
BEGIN
 SELECT * INTO o FROM push_outbox WHERE id=p_outbox;
 IF o.id IS NULL OR o.obsolete OR o.expires_at<=now() THEN RETURN jsonb_build_object('skip','Notification superseded or expired'); END IF;
 prefs:=push_preferences_for_email(o.email);
 IF o.data->>'followed_event'='true' AND (prefs->>'followed_events'='false' OR NOT EXISTS(SELECT 1 FROM event_notification_follows WHERE event_id=(o.data->>'event_id')::bigint AND email=o.email AND following)) THEN RETURN jsonb_build_object('skip','Event no longer followed'); END IF;
 IF o.data ? 'job_id' THEN
  SELECT * INTO j FROM tournament_notification_jobs WHERE id=(o.data->>'job_id')::uuid;
  SELECT * INTO c FROM calendar WHERE id=j.event_id;
  valid:=j.id IS NOT NULL AND j.active AND j.revision=o.data->>'revision' AND j.expires_at>now() AND c.is_visible IS DISTINCT FROM false AND (c.sanction_status IS NULL OR c.sanction_status='approved') AND c.event_status IS DISTINCT FROM 'cancelled';
  IF j.data->>'audience'='follower' THEN
   valid:=valid AND EXISTS(SELECT 1 FROM event_notification_follows WHERE event_id=j.event_id AND email=o.email AND following)
    AND NOT EXISTS(SELECT 1 FROM event_notification_participants(j.event_id) p WHERE p.email=o.email) AND prefs->>'followed_events' IS DISTINCT FROM 'false';
  ELSIF j.data->>'audience' IN('participant','match') THEN
   valid:=valid AND EXISTS(SELECT 1 FROM event_notification_participants(j.event_id,nullif(j.data->>'division_id','')::uuid) p WHERE p.email=o.email);
  ELSIF j.data->>'audience'='interested' THEN
   valid:=valid AND (EXISTS(SELECT 1 FROM event_notification_participants(j.event_id) p WHERE p.email=o.email) OR (prefs->>'followed_events' IS DISTINCT FROM 'false' AND EXISTS(SELECT 1 FROM event_notification_follows WHERE event_id=j.event_id AND email=o.email AND following)));
  ELSIF j.data->>'audience'='unpaid' THEN
   valid:=valid AND EXISTS(SELECT 1 FROM event_registrations r LEFT JOIN tournament_divisions v ON v.id=r.division_id WHERE r.id=(j.data->>'registration_id')::uuid AND lower(trim(r.email))=o.email AND r.status IS DISTINCT FROM 'withdrawn' AND r.payment_status NOT IN('paid','comped','refunded') AND v.cancelled_at IS NULL AND least(coalesce(v.entries_close_at,c.registration_closes_at),coalesce(c.registration_closes_at,v.entries_close_at))=(j.data->>'deadline')::timestamptz);
  ELSIF j.data->>'audience'='award' THEN
   valid:=valid AND EXISTS(SELECT 1 FROM player_ranking_points a JOIN players p ON p.id=a.player_id WHERE a.id=(j.data->>'award_id')::uuid AND lower(trim(p.email))=o.email AND a.points=(j.data->>'points')::integer AND a.round_code=j.data->>'round' AND to_jsonb(a.reversal_of) IS NOT DISTINCT FROM nullif(j.data->'reversal','null'));
  END IF;
  IF j.type='early_bird_ending' THEN valid:=valid AND c.early_bird_fee IS NOT NULL AND (c.registration_closes_at IS NULL OR c.registration_closes_at>now()); END IF;
  IF j.type IN('registration_open','registration_closing') THEN valid:=valid AND (c.registration_closes_at IS NULL OR c.registration_closes_at>now()); END IF;
  IF j.data ? 'field' THEN valid:=valid AND nullif(to_jsonb(c)->>(j.data->>'field'),'')::timestamptz=(j.data->>'at')::timestamptz; END IF;
  IF j.data ? 'match_id' THEN
   m:=notification_match_state((j.data->>'match_id')::uuid);
   valid:=valid AND md5(m::text)=j.data->>'state' AND EXISTS(SELECT 1 FROM notification_match_recipients((j.data->>'match_id')::uuid) p WHERE p.email=o.email)
    AND EXISTS(SELECT 1 FROM draw_matches mm JOIN draws d ON d.id=mm.draw_id JOIN tournament_divisions v ON v.id=d.division_id WHERE mm.id=(j.data->>'match_id')::uuid AND d.status IN('published','in_progress','completed') AND v.cancelled_at IS NULL);
   IF j.type='match_reminder' THEN valid:=valid AND coalesce((prefs->>'reminder_minutes')::int,30)=(j.data->>'reminder_minutes')::int AND (m->>'start')::timestamptz>now() AND m->>'status' IN('pending','scheduled'); END IF;
  END IF;
  IF j.data ? 'finalisation' THEN valid:=valid AND EXISTS(SELECT 1 FROM tournament_finalisations tf WHERE tf.event_id=j.event_id AND tf.division_id=(j.data->>'division_id')::uuid AND tf.fingerprint=j.data->>'finalisation'); END IF;
  IF j.data ? 'event_revision' THEN valid:=valid AND md5(jsonb_build_array(to_jsonb(c)->'start_date',to_jsonb(c)->'end_date',to_jsonb(c)->'venue',to_jsonb(c)->'registration_closes_at',to_jsonb(c)->'draw_released')::text)=j.data->>'event_revision'; END IF;
 END IF;
 IF valid IS DISTINCT FROM true THEN RETURN jsonb_build_object('skip','Tournament update is no longer relevant'); END IF;
 until_time:=greatest(o.not_before,notification_quiet_until(prefs));
 IF until_time>=coalesce(o.expires_at,o.created_at+interval '24 hours') THEN RETURN jsonb_build_object('skip','Update expires during quiet hours'); END IF;
 RETURN jsonb_build_object('defer_until',until_time,'preferences',prefs);
END $$;

CREATE OR REPLACE FUNCTION public.get_player_notifications() RETURNS TABLE(id uuid,type text,title text,body text,path text,created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT o.id,o.type,o.title,o.body,o.path,o.created_at FROM push_outbox o
 WHERE auth.uid() IS NOT NULL AND lower(o.email)=lower(trim(auth.jwt()->>'email')) AND NOT o.obsolete AND o.not_before<=now()
 ORDER BY o.created_at DESC LIMIT 50;
$$;

-- Deep links expose public match details only; no recipient emails or private scheduling drafts.
CREATE FUNCTION public.get_tournament_notification_matches(p_event bigint,p_division uuid DEFAULT NULL,p_match uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(row ORDER BY row->>'start',row->>'round'),'[]') FROM (
 SELECT (notification_match_state(m.id)-'recipients')||jsonb_build_object('id',m.id,'division_name',v.name) row
 FROM draw_matches m JOIN draws d ON d.id=m.draw_id JOIN tournament_divisions v ON v.id=d.division_id JOIN calendar c ON c.id=d.event_id
 WHERE d.event_id=p_event AND d.status IN('published','in_progress','completed') AND c.is_visible IS DISTINCT FROM false AND (c.sanction_status IS NULL OR c.sanction_status='approved')
 AND (p_division IS NULL OR d.division_id=p_division) AND (p_match IS NULL OR m.id=p_match)
 ORDER BY m.scheduled_start NULLS LAST,m.round_number,m.id LIMIT 200) matches;
$$;

-- Lock down every new helper, including those whose default EXECUTE grant would expose recipient emails.
DO $$ DECLARE fn regprocedure; BEGIN
 FOR fn IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN(
 'event_notification_participants','get_event_notification_follow','set_event_notification_follow','notification_type_keys','set_notification_timing',
 'notification_match_recipients','notification_match_state','plan_tournament_push','notification_quiet_until','refresh_tournament_notifications',
 'notify_tournament_finalisation','notify_ranking_award','push_delivery_context','get_tournament_notification_matches') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',fn);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.get_event_notification_follow(bigint),public.set_event_notification_follow(bigint,boolean),public.set_notification_timing(integer,integer,integer,text),public.get_tournament_notification_matches(bigint,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_tournament_notifications(),public.push_delivery_context(uuid) TO service_role;
GRANT ALL ON public.tournament_notification_jobs,public.notification_event_snapshots,public.notification_match_snapshots TO service_role;

CREATE OR REPLACE FUNCTION public.claim_push_deliveries() RETURNS SETOF public.push_deliveries
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 -- Do not deliver historical notifications when this worker is first deployed.
 UPDATE push_outbox SET status='skipped',error='Expired before delivery',expanded_at=now()
 WHERE status='pending' AND expanded_at IS NULL AND created_at<now()-interval '24 hours';
 WITH batch AS (SELECT id FROM push_outbox WHERE status='pending' AND expanded_at IS NULL AND NOT obsolete AND not_before<=now() AND (expires_at IS NULL OR expires_at>now()) ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED),
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

CREATE FUNCTION public.get_tournament_notification_points(p_event bigint,p_division uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('division',v.name,'points',a.points,'round',a.round_code)),'[]')
 FROM player_ranking_points a JOIN players p ON p.id=a.player_id JOIN tournament_divisions v ON v.id=a.division_id
 WHERE auth.uid() IS NOT NULL AND lower(trim(p.email))=lower(trim(auth.jwt()->>'email')) AND a.event_id=p_event AND (p_division IS NULL OR a.division_id=p_division);
$$;
REVOKE ALL ON FUNCTION public.get_tournament_notification_points(bigint,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tournament_notification_points(bigint,uuid) TO authenticated;
CREATE FUNCTION public.notification_ranking_state(p_rows jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(row ORDER BY row::text),'[]') FROM (
 SELECT jsonb_build_object('org',r->>'org','age_group',r->>'age_group','match_type',r->>'match_type','rank',r->>'rank','points',r->>'points') row
 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_rows)='array' THEN p_rows ELSE '[]'::jsonb END) r) rankings;
$$;
REVOKE ALL ON FUNCTION public.notification_ranking_state(jsonb) FROM PUBLIC;
CREATE FUNCTION public.notify_published_rankings() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF notification_ranking_state(to_jsonb(NEW)->'rankings') IS DISTINCT FROM notification_ranking_state(to_jsonb(OLD)->'rankings') AND nullif(trim(NEW.email),'') IS NOT NULL THEN
  PERFORM enqueue_push(NEW.email,'ranking_change','Ranking update','Your published rankings have changed. Open Rankings to see your latest position.','/(tabs)/rankings');
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER notify_published_rankings AFTER UPDATE ON public.players FOR EACH ROW EXECUTE FUNCTION public.notify_published_rankings();
REVOKE ALL ON FUNCTION public.notify_published_rankings() FROM PUBLIC;
CREATE OR REPLACE FUNCTION public.notify_registration_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE event_name text; event_state text; prior jsonb := '{}'; kind text; partner text; self_email text; path text := '/events/'||NEW.event_id::text;
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

CREATE OR REPLACE FUNCTION public.notify_single_row_partner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE event_name text;
BEGIN
 IF nullif(trim(NEW.partner_email),'') IS NOT NULL AND lower(NEW.partner_email)<>lower(NEW.email)
 AND NEW.status IS DISTINCT FROM 'withdrawn'
 AND NOT EXISTS(SELECT 1 FROM event_registrations r WHERE r.event_id=NEW.event_id AND r.division_id IS NOT DISTINCT FROM NEW.division_id AND lower(r.email)=lower(NEW.partner_email) AND r.status IS DISTINCT FROM 'withdrawn') THEN
 SELECT calendar.event_name INTO event_name FROM calendar WHERE id=NEW.event_id;
 PERFORM enqueue_push(NEW.partner_email,'partner_entry_paid','You’ve been entered',coalesce(NEW.full_name,'Your partner')||' entered you into '||coalesce(event_name,'a tournament')||'.','/events/'||NEW.event_id::text);
 END IF;
 RETURN NEW;
END $$;

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
 PERFORM enqueue_push(recipient,'event_cancelled','Event cancelled',event_name||' has been cancelled. Open the app for details.','/events/'||event_id_value::text);
 END LOOP;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.notify_draw_published() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE recipient text; event_name text;
BEGIN
 IF NEW.status='published' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'published') THEN
 SELECT calendar.event_name INTO event_name FROM calendar WHERE id=NEW.event_id;
 FOR recipient IN SELECT DISTINCT lower(trim(email)) FROM (
 SELECT email FROM event_registrations WHERE division_id=NEW.division_id AND status IS DISTINCT FROM 'withdrawn'
 UNION SELECT partner_email FROM event_registrations WHERE division_id=NEW.division_id AND status IS DISTINCT FROM 'withdrawn') r WHERE nullif(trim(email),'') IS NOT NULL LOOP
 PERFORM enqueue_push(recipient,'draws_ready','Draws are ready','The draw for '||coalesce(event_name,'your tournament')||' is ready.','/events/'||NEW.event_id::text||'?division='||NEW.division_id::text||'&tab=Draws');
 END LOOP;
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION public.notify_followed_event_cancelled() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE follower record;
BEGIN
 IF NEW.event_status='cancelled' AND OLD.event_status IS DISTINCT FROM 'cancelled' THEN
 FOR follower IN SELECT f.email FROM event_notification_follows f WHERE f.event_id=NEW.id AND f.following
 AND NOT EXISTS(SELECT 1 FROM event_registrations r WHERE r.event_id=NEW.id AND f.email IN(lower(trim(r.email)),lower(trim(r.partner_email)))) LOOP
 PERFORM enqueue_push(follower.email,'event_cancelled','Event cancelled',coalesce(NEW.event_name,'The tournament you follow')||' has been cancelled.','/events/'||NEW.id,jsonb_build_object('followed_event',true,'event_id',NEW.id));
 END LOOP;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER notify_followed_event_cancelled AFTER UPDATE ON public.calendar FOR EACH ROW EXECUTE FUNCTION public.notify_followed_event_cancelled();
REVOKE ALL ON FUNCTION public.notify_followed_event_cancelled() FROM PUBLIC;
COMMIT;
