-- Staging regression: run in SQL Editor; every save is rolled back.
BEGIN;
SET LOCAL ROLE authenticated;
DO $$
DECLARE who text; player_rows jsonb; ids text[]; state jsonb; result jsonb; existing public.draws;
BEGIN
 FOREACH who IN ARRAY ARRAY['brad@dotsandcoms.co.za','markstillerman@gmail.com'] LOOP
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','email',who)::text,true);
  IF (SELECT count(*) FROM public.event_registrations WHERE event_id=90000001)<>64 THEN RAISE EXCEPTION 'Approved tester cannot read sample registrations: %',who; END IF;
 END LOOP;
 SELECT jsonb_agg(jsonb_build_object('id',id::text,'name',full_name)),array_agg(id::text) INTO player_rows,ids FROM (SELECT id,full_name FROM public.event_registrations WHERE division_id='11111111-1111-4111-8111-111111111111' ORDER BY id LIMIT 4) p;
 state:=jsonb_build_object('players',player_rows,'rounds',1,'points',24,'courts',1,'fixtures',jsonb_build_array(jsonb_build_object('id','r1-m1','round',1,'court',1,'wave',1,'one',jsonb_build_array(ids[1],ids[2]),'two',jsonb_build_array(ids[3],ids[4]),'score',null)));
 SELECT * INTO existing FROM public.draws WHERE division_id='11111111-1111-4111-8111-111111111111' AND draw_kind='main';
 IF existing.status IS NOT NULL AND existing.status<>'draft' THEN RAISE EXCEPTION 'Test needs an editable Ladies draw'; END IF;
 result:=public.save_americano_draw(90000001,'11111111-1111-4111-8111-111111111111',state,'draft',existing.updated_at);
 IF result->>'id' IS NULL THEN RAISE EXCEPTION 'Americano save returned no draw'; END IF;
 PERFORM set_config('request.jwt.claims','{"role":"authenticated","email":"unapproved@example.test"}',true);
 IF EXISTS(SELECT 1 FROM public.event_registrations WHERE event_id=90000001) THEN RAISE EXCEPTION 'Unapproved tester can read sample registrations'; END IF;
END $$;
SELECT 'PASS: both testers read registrations; Americano saved; unapproved user denied; test writes rolled back' AS result;
ROLLBACK;
