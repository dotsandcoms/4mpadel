BEGIN;
INSERT INTO public.tournament_divisions(id,event_id,name,sort_order,is_active) VALUES('55555555-5555-4555-8555-555555555555',90000001,'Team Americano QA',5,true);
DO $$ DECLARE rid text; payload text := '{"variant":"team","players":[{"id":"reg1","name":"A0"},{"id":"reg1:partner","name":"B0"},{"id":"reg2","name":"A1"},{"id":"reg2:partner","name":"B1"},{"id":"reg3","name":"A2"},{"id":"reg3:partner","name":"B2"}],"teams":[{"id":"team-1","name":"A0 / B0","players":["reg1","reg1:partner"]},{"id":"team-2","name":"A1 / B1","players":["reg2","reg2:partner"]},{"id":"team-3","name":"A2 / B2","players":["reg3","reg3:partner"]}],"rounds":3,"points":24,"courts":1,"fixtures":[{"id":"r1-m1","round":1,"court":1,"wave":1,"one":["reg2","reg2:partner"],"two":["reg3","reg3:partner"],"score":null},{"id":"r2-m1","round":2,"court":1,"wave":1,"one":["reg1","reg1:partner"],"two":["reg3","reg3:partner"],"score":null},{"id":"r3-m1","round":3,"court":1,"wave":1,"one":["reg1","reg1:partner"],"two":["reg2","reg2:partner"],"score":null}],"rests":[{"round":1,"team_id":"team-1"},{"round":2,"team_id":"team-2"},{"round":3,"team_id":"team-3"}]}'; BEGIN
FOR i IN 1..3 LOOP
INSERT INTO public.event_registrations(event_id,division_id,full_name,email,partner_name,partner_email,payment_status,status,is_test) VALUES(90000001,'55555555-5555-4555-8555-555555555555','QA A'||i,'qa-a'||i||'@example.test','QA B'||i,'qa-b'||i||'@example.test','paid','active',true) RETURNING id::text INTO rid;
payload:=replace(payload,'reg'||i,rid);
END LOOP;
PERFORM set_config('test.team_payload',payload,true); END $$;
SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated','email','brad@dotsandcoms.co.za','sub',(SELECT id FROM auth.users WHERE email='brad@dotsandcoms.co.za'))::text,true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE s jsonb:=current_setting('test.team_payload')::jsonb; result jsonb; bad jsonb; rejected boolean:=false; BEGIN
result:=public.save_americano_draw(90000001,'55555555-5555-4555-8555-555555555555',s,'draft');
IF result->'scoring_rules'->'americano'->>'variant'<>'team' THEN RAISE EXCEPTION 'Variant not retained'; END IF;
result:=public.save_americano_draw(90000001,'55555555-5555-4555-8555-555555555555',s,'published',(result->>'updated_at')::timestamptz);
bad:=jsonb_set(s,'{fixtures,0,score}','[20,20]');
BEGIN PERFORM public.save_americano_draw(90000001,'55555555-5555-4555-8555-555555555555',bad,'in_progress',(result->>'updated_at')::timestamptz); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
IF NOT rejected THEN RAISE EXCEPTION 'Invalid score accepted'; END IF;
s:=jsonb_set(s,'{fixtures,0,score}','[17,7]');
result:=public.save_americano_draw(90000001,'55555555-5555-4555-8555-555555555555',s,'in_progress',(result->>'updated_at')::timestamptz);
IF result->'scoring_rules'->'americano'->'fixtures'->0->'score'<>'[17,7]'::jsonb THEN RAISE EXCEPTION 'Score not retained'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: three fixed teams, draft, publication, score validation and results. Test rows rolled back.' AS result;