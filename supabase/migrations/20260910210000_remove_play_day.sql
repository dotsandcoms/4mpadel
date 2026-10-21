-- Retain a removal marker so dates derived from event dates do not reappear.
ALTER TABLE public.event_play_days ADD COLUMN IF NOT EXISTS is_removed boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.remove_event_play_day(p_event_id bigint, p_play_date date)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE day_start timestamptz; day_end timestamptz;
BEGIN
    IF NOT COALESCE(public.can_manage_native_draw(p_event_id),false) THEN RAISE EXCEPTION 'You cannot manage this event'; END IF;
    IF p_play_date IS NULL THEN RAISE EXCEPTION 'Choose a play date'; END IF;
    day_start:=p_play_date::timestamp AT TIME ZONE 'Africa/Johannesburg';
    day_end:=(p_play_date+1)::timestamp AT TIME ZONE 'Africa/Johannesburg';
    PERFORM pg_advisory_xact_lock(hashtextextended('draw-courts:' || p_event_id::text,0));
    IF EXISTS(SELECT 1 FROM public.draw_matches m JOIN public.draws d ON d.id=m.draw_id WHERE d.event_id=p_event_id AND m.status<>'cancelled' AND m.scheduled_start<day_end AND COALESCE(m.scheduled_end,m.scheduled_start+interval '1 minute')>day_start)
       OR EXISTS(SELECT 1 FROM public.draws d CROSS JOIN LATERAL jsonb_array_elements(COALESCE(d.scoring_rules->'americano'->'fixtures','[]'::jsonb)) m WHERE d.event_id=p_event_id AND (m->>'scheduled_start')::timestamptz<day_end AND COALESCE((m->>'scheduled_end')::timestamptz,(m->>'scheduled_start')::timestamptz+interval '1 minute')>day_start) THEN
        RAISE EXCEPTION 'This day has scheduled matches. Move them to another day and save the schedule before removing it';
    END IF;
    INSERT INTO public.event_play_days(event_id,play_date,start_time,end_time,courts_count,is_active,is_removed)
    VALUES(p_event_id,p_play_date,'08:00','18:00',1,false,true)
    ON CONFLICT(event_id,play_date) DO UPDATE SET is_active=false,is_removed=true,updated_at=clock_timestamp();
END;
$$;
REVOKE ALL ON FUNCTION public.remove_event_play_day(bigint,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_event_play_day(bigint,date) TO authenticated;
