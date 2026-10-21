-- Apply ONLY to 4M Padel Staging, cefmzkwabdqqoagxhekc.
CREATE OR REPLACE FUNCTION public.expand_draw_sandbox(p_division_id uuid, p_count integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.tournament_divisions; current_count integer; i integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL AND lower(email) IN ('brad@dotsandcoms.co.za','markstillerman@gmail.com')) THEN RAISE EXCEPTION 'Approved sandbox login required'; END IF;
 IF p_count < 2 OR p_count > 256 OR p_count IS NULL THEN RAISE EXCEPTION 'Choose 2 to 256 test entries'; END IF;
 SELECT * INTO d FROM public.tournament_divisions WHERE id=p_division_id AND event_id=90000001 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sandbox division required'; END IF;
 IF EXISTS(SELECT 1 FROM public.draws WHERE division_id=d.id AND status<>'draft') THEN RAISE EXCEPTION 'Restart the published sandbox draw before changing its size'; END IF;
 SELECT count(*) INTO current_count FROM public.event_registrations WHERE division_id=d.id AND event_id=90000001 AND status <> 'withdrawn';
 FOR i IN current_count+1..p_count LOOP
  INSERT INTO public.event_registrations(event_id,division_id,full_name,email,partner_name,partner_email,payment_status,status,is_test)
  VALUES(90000001,d.id,d.name||' Player '||i,'sample-'||d.sort_order||'-'||i||'@example.test',CASE WHEN d.sort_order>1 THEN 'Partner '||i END,CASE WHEN d.sort_order>1 THEN 'partner-'||d.sort_order||'-'||i||'@example.test' END,'paid','active',true);
 END LOOP;
 RETURN (SELECT jsonb_agg(e) FROM public.event_registrations e WHERE event_id=90000001);
END $$;
REVOKE ALL ON FUNCTION public.expand_draw_sandbox(uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expand_draw_sandbox(uuid,integer) TO authenticated;
