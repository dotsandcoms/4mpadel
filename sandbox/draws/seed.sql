-- STAGING ONLY: cefmzkwabdqqoagxhekc. Never run against production.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.calendar WHERE id=90000001 AND slug IS DISTINCT FROM 'draw-sandbox') THEN RAISE EXCEPTION 'Sandbox event ID already used'; END IF;
END $$;
INSERT INTO public.calendar(id,event_name,event_dates,city,sapa_status,venue,slug,start_date,end_date,start_time,end_time,courts_count,is_visible,is_manual,allow_payments,licences_required)
VALUES(90000001,'Draw Sandbox Championship','11–13 September 2026','Sample city','Unranked','Sample courts','draw-sandbox','2026-09-11','2026-09-13','08:00','20:00',4,false,true,false,false)
ON CONFLICT(id) DO NOTHING;
INSERT INTO public.tournament_divisions(id,event_id,name,sort_order,is_active) VALUES
('11111111-1111-4111-8111-111111111111',90000001,'Ladies Open',1,true),
('22222222-2222-4222-8222-222222222222',90000001,'Mens Open',2,true),
('33333333-3333-4333-8333-333333333333',90000001,'Mixed Open',3,true)
ON CONFLICT(id) DO NOTHING;
INSERT INTO public.event_registrations(event_id,division_id,full_name,email,partner_name,partner_email,payment_status,status,is_test)
SELECT 90000001,d.id,d.name||' Player '||i, 'sample-'||d.sort_order||'-'||i||'@example.test',
CASE WHEN d.sort_order>1 THEN 'Partner '||i END,CASE WHEN d.sort_order>1 THEN 'partner-'||d.sort_order||'-'||i||'@example.test' END,'paid','active',true
FROM public.tournament_divisions d CROSS JOIN LATERAL generate_series(1,CASE WHEN d.sort_order=2 THEN 32 ELSE 16 END) i
WHERE d.event_id=90000001 AND NOT EXISTS(SELECT 1 FROM public.event_registrations e WHERE e.division_id=d.id AND e.email='sample-'||d.sort_order||'-'||i||'@example.test');
INSERT INTO public.event_play_days(event_id,play_date,start_time,end_time,courts_count,match_duration_minutes,minimum_break_minutes,is_active)
SELECT 90000001,date,'08:00','20:00',4,60,10,true FROM unnest(ARRAY['2026-09-11'::date,'2026-09-12'::date,'2026-09-13'::date]) date
ON CONFLICT(event_id,play_date) DO NOTHING;
INSERT INTO public.admin_sidebar_permissions(email,role) VALUES ('brad@dotsandcoms.co.za','custom'),('markstillerman@gmail.com','custom') ON CONFLICT(email) DO NOTHING;
CREATE OR REPLACE FUNCTION public.get_draw_sandbox() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL AND lower(email) IN ('brad@dotsandcoms.co.za','markstillerman@gmail.com')) THEN RAISE EXCEPTION 'Sign in with an approved, confirmed sandbox account'; END IF;
 RETURN jsonb_build_object('event',(SELECT to_jsonb(c)||jsonb_build_object('title',c.event_name) FROM public.calendar c WHERE id=90000001),'divisions',(SELECT jsonb_agg(d ORDER BY sort_order) FROM public.tournament_divisions d WHERE event_id=90000001),'registrations',(SELECT jsonb_agg(e) FROM public.event_registrations e WHERE event_id=90000001));
END $$;
REVOKE ALL ON FUNCTION public.get_draw_sandbox() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_draw_sandbox() TO authenticated;
