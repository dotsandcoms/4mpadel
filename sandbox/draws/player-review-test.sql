-- Staging-only regression. All temporary fixtures are rolled back.
BEGIN;
INSERT INTO public.tournament_divisions(id,event_id,name,sort_order,is_active)
VALUES ('44444444-4444-4444-8444-444444444444',90000001,'Transactional QA division',99,true);
INSERT INTO public.event_registrations(event_id,division_id,full_name,email,payment_status,status,is_test)
SELECT 90000001,'44444444-4444-4444-8444-444444444444','QA Player '||i,'qa-review-'||i||'@example.test',CASE WHEN i=1 THEN 'pending' ELSE 'paid' END,'active',true FROM generate_series(1,4) i;
SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated','email','brad@dotsandcoms.co.za','sub',(SELECT id FROM auth.users WHERE email='brad@dotsandcoms.co.za'))::text,true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE players jsonb; ids text[]; state jsonb; result jsonb; denied boolean:=false;
BEGIN
 SELECT jsonb_agg(jsonb_build_object('id',id,'name',full_name)),array_agg(id::text) INTO players,ids FROM (SELECT id,full_name FROM public.event_registrations WHERE division_id='44444444-4444-4444-8444-444444444444' ORDER BY email) p;
 state:=jsonb_build_object('players',players,'rounds',1,'points',24,'courts',1,'fixtures',jsonb_build_array(jsonb_build_object('id','qa-r1','round',1,'court',1,'wave',1,'one',jsonb_build_array(ids[1],ids[2]),'two',jsonb_build_array(ids[3],ids[4]),'score',null)));
 BEGIN
  PERFORM public.save_americano_draw(90000001,'44444444-4444-4444-8444-444444444444',state,'draft');
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%approved organiser exception%' THEN denied:=true; ELSE RAISE; END IF;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Unpaid entry was allowed without approval'; END IF;
 INSERT INTO public.draw_player_reviews(division_id,event_id,state,confirmed_by)
 VALUES('44444444-4444-4444-8444-444444444444',90000001,jsonb_build_object('exceptions',jsonb_build_object(ids[1],'Payment verified by organiser; awaiting reconciliation'),'excluded','[]'::jsonb),auth.uid());
 result:=public.save_americano_draw(90000001,'44444444-4444-4444-8444-444444444444',state,'draft');
 IF result->>'id' IS NULL THEN RAISE EXCEPTION 'Approved exception could not save'; END IF;
 IF (SELECT payment_status FROM public.event_registrations WHERE id::text=ids[1])<>'pending' THEN RAISE EXCEPTION 'Approval changed payment status'; END IF;
 PERFORM set_config('request.jwt.claims','{"role":"authenticated","email":"unapproved@example.test"}',true);
 IF EXISTS(SELECT 1 FROM public.draw_player_reviews) THEN RAISE EXCEPTION 'Unauthorised user can read reviews'; END IF;
END $$;
SELECT 'PASS: unpaid blocked, approved exception saved, payment unchanged, unauthorised review access denied; rolled back' AS result;
ROLLBACK;
