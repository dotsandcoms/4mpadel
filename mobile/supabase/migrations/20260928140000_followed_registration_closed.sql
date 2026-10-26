-- Explicit followers receive entry-closed milestones; late follows do not replay them.
BEGIN;
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
    AND NOT EXISTS(SELECT 1 FROM event_notification_participants(c.id) p WHERE p.email=ef.email) LOOP
    IF open_at IS NOT NULL AND f.created_at<=open_at THEN
     PERFORM plan_tournament_push(c.id,f.email,'opens',open_at::text,'registration_open','Registration is open','Entries are open for '||label||'.',base,jsonb_build_object('scheduled',true,'audience','follower','field','registration_opens_at','at',open_at),open_at,least(open_at+interval '24 hours',coalesce(close_at,open_at+interval '24 hours')));
    END IF;
    IF early_at IS NOT NULL AND state->>'early_bird_fee' IS NOT NULL THEN
     PERFORM plan_tournament_push(c.id,f.email,'early',early_at::text,'early_bird_ending','Early bird ends soon','Early bird entries for '||label||' end '||to_char(early_at AT TIME ZONE 'Africa/Johannesburg','DD Mon at HH24:MI')||' SAST.',base,jsonb_build_object('scheduled',true,'audience','follower','field','early_bird_ends_at','at',early_at),greatest(coalesce(open_at,'-infinity'),early_at-interval '24 hours'),least(early_at,coalesce(close_at,early_at)));
    END IF;
    IF close_at IS NOT NULL THEN
     PERFORM plan_tournament_push(c.id,f.email,'closing',close_at::text,'registration_closing','Entries close soon',label||' closes '||to_char(close_at AT TIME ZONE 'Africa/Johannesburg','DD Mon at HH24:MI')||' SAST. Complete your entry.',base,jsonb_build_object('scheduled',true,'audience','follower','field','registration_closes_at','at',close_at),greatest(coalesce(open_at,'-infinity'),close_at-interval '24 hours'),close_at);
    END IF;
    -- Explicit followers receive the closing milestone, including withdrawn players who opted in.
    -- A late follow must not replay a milestone that has already passed.
    IF close_at IS NOT NULL AND f.created_at<=close_at THEN
     PERFORM plan_tournament_push(c.id,f.email,'closed',close_at::text,'registration_closed','Registration closed','Entries for '||label||' have closed. Follow the tournament for draws and event updates.',base,jsonb_build_object('scheduled',true,'audience','follower','field','registration_closes_at','at',close_at),close_at,close_at+interval '12 hours');
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
   -- Merge edits during the settling period and name each changed field.
   IF old_state IS NOT NULL AND notification_event_details(old_state) IS DISTINCT FROM notification_event_details(state) THEN
    FOR participant IN SELECT email FROM event_notification_participants(c.id) UNION SELECT email FROM event_notification_follows WHERE event_id=c.id AND following LOOP
     PERFORM plan_event_change_push(c.id,participant.email,label,old_state,state);
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

CREATE OR REPLACE FUNCTION public.push_delivery_context(p_outbox uuid) RETURNS jsonb
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
    AND (j.type='registration_closed' OR NOT EXISTS(SELECT 1 FROM event_notification_participants(j.event_id) p WHERE p.email=o.email)) AND prefs->>'followed_events' IS DISTINCT FROM 'false';
  ELSIF j.data->>'audience' IN('participant','match') THEN
   valid:=valid AND EXISTS(SELECT 1 FROM event_notification_participants(j.event_id,nullif(j.data->>'division_id','')::uuid) p WHERE p.email=o.email);
  ELSIF j.data->>'audience'='interested' THEN
   valid:=valid AND (EXISTS(SELECT 1 FROM event_notification_participants(j.event_id) p WHERE p.email=o.email) OR (prefs->>'followed_events' IS DISTINCT FROM 'false' AND EXISTS(SELECT 1 FROM event_notification_follows WHERE event_id=j.event_id AND email=o.email AND following)));
  ELSIF j.data->>'audience'='unpaid' THEN
   valid:=valid AND EXISTS(SELECT 1 FROM event_registrations r LEFT JOIN tournament_divisions v ON v.id=r.division_id WHERE r.id=(j.data->>'registration_id')::uuid AND lower(trim(r.email))=o.email AND r.status IS DISTINCT FROM 'withdrawn' AND r.payment_status NOT IN('paid','comped','refunded') AND v.cancelled_at IS NULL AND least(coalesce(v.entries_close_at,c.registration_closes_at),coalesce(c.registration_closes_at,v.entries_close_at))=(j.data->>'deadline')::timestamptz);
  ELSIF j.data->>'audience'='award' THEN
   valid:=valid AND EXISTS(SELECT 1 FROM player_ranking_points a JOIN players p ON p.id=a.player_id WHERE a.id=(j.data->>'award_id')::uuid AND lower(trim(p.email))=o.email AND a.points=(j.data->>'points')::integer AND a.round_code=j.data->>'round' AND to_jsonb(a.reversal_of) IS NOT DISTINCT FROM nullif(j.data->'reversal','null'));
  END IF;
  IF j.type='registration_closed' AND j.data->>'audience'='follower' THEN valid:=valid AND EXISTS(SELECT 1 FROM event_notification_follows WHERE event_id=j.event_id AND email=o.email AND following AND created_at<=(j.data->>'at')::timestamptz); END IF;
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
  IF j.data ? 'event_details' THEN valid:=valid AND notification_event_details(to_jsonb(c))=j.data->'event_details';
  ELSIF j.data ? 'event_revision' THEN valid:=valid AND md5(jsonb_build_array(to_jsonb(c)->'start_date',to_jsonb(c)->'end_date',to_jsonb(c)->'venue',to_jsonb(c)->'registration_closes_at',to_jsonb(c)->'draw_released')::text)=j.data->>'event_revision'; END IF;
 END IF;
 IF valid IS DISTINCT FROM true THEN RETURN jsonb_build_object('skip','Tournament update is no longer relevant'); END IF;
 until_time:=greatest(o.not_before,notification_quiet_until(prefs));
 IF until_time>=coalesce(o.expires_at,o.created_at+interval '24 hours') THEN RETURN jsonb_build_object('skip','Update expires during quiet hours'); END IF;
 RETURN jsonb_build_object('defer_until',until_time,'preferences',prefs);
END $$;
COMMIT;
