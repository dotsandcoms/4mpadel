// Generates a transaction-only integration test for the reviewed staging clone.
// Run ONLY with the staging-pinned CLI workdir; never against production.
import { writeFileSync, readFileSync } from 'node:fs';
const dir = '/private/tmp/4m-supabase-staging.V95sMZ';
if (readFileSync(`${dir}/supabase/.temp/project-ref`, 'utf8').trim() !== 'cefmzkwabdqqoagxhekc') throw Error('Wrong target');
const statements = [];
const add = s => statements.push(s);
const assert = (condition, message) => add(`DO $$ BEGIN IF NOT (${condition}) THEN RAISE EXCEPTION '${message}'; END IF; END $$;`);
const identity = email => add(`SELECT set_config('request.jwt.claims', '${JSON.stringify({sub:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',email,role:'authenticated'})}', true);`);
add(`BEGIN;
SET LOCAL statement_timeout = '30s';
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.calendar) OR EXISTS (SELECT 1 FROM public.admin_sidebar_permissions) THEN RAISE EXCEPTION 'Requires empty staging clone'; END IF;
END $$;
INSERT INTO public.organisations(id,name,slug,contact_email) VALUES ('11111111-1111-1111-1111-111111111111','Test organisation','staging-test','org@example.invalid');
INSERT INTO public.clubs(id,name) VALUES ('22222222-2222-2222-2222-222222222222','Test club');
INSERT INTO public.organisation_members(organisation_id,user_email,role) VALUES ('11111111-1111-1111-1111-111111111111','org@example.invalid','admin');
INSERT INTO public.club_members(club_id,user_email,role) VALUES ('22222222-2222-2222-2222-222222222222','club@example.invalid','admin');
INSERT INTO public.calendar(id,event_dates,event_name,city,sapa_status,venue) OVERRIDING SYSTEM VALUE
SELECT n,'2026-09-08','Staging event '||n,'Test city','None','Test venue' FROM generate_series(900001,900005) n;
UPDATE public.calendar SET organisation_id='11111111-1111-1111-1111-111111111111' WHERE id=900003;
UPDATE public.calendar SET club_id='22222222-2222-2222-2222-222222222222' WHERE id=900004;
UPDATE public.calendar SET organiser_email='organiser@example.invalid', event_co_admins=ARRAY['coadmin@example.invalid'] WHERE id=900005;
INSERT INTO public.tournament_divisions(event_id,name) SELECT id,'Test division' FROM public.calendar;
INSERT INTO public.event_activity_log(event_id,action,summary) SELECT id,'test','Synthetic activity' FROM public.calendar;
INSERT INTO public.event_creation_audit(event_id,creator_email) SELECT id,'test@example.invalid' FROM public.calendar ON CONFLICT(event_id) DO NOTHING;
INSERT INTO public.admin_sidebar_permissions(email,role,allowed_tabs,module_permissions) VALUES
 ('assigned@example.invalid','custom',ARRAY['event-mgmt'],'{"event-mgmt":{"allowedEvents":[900001,"900002"]}}'),
 ('unrelated@example.invalid','custom',ARRAY['gallery'],'{}'),
 ('malformed@example.invalid','custom',ARRAY['event-mgmt'],'{"event-mgmt":{"allowedEvents":"all"}}'),
 ('empty@example.invalid','custom',ARRAY['event-mgmt'],'{"event-mgmt":{"allowedEvents":[]}}'),
 ('super@example.invalid','super_admin',ARRAY[]::text[],'{}');
SET LOCAL ROLE authenticated;`);
for (const [name, allowed] of [['assigned',[900001,900002]],['unrelated',[]],['malformed',[]],['empty',[]],['player',[]],['org',[900003]],['club',[900004]],['organiser',[900005]],['coadmin',[900005]],['super',[900001,900002,900003,900004,900005]]]) {
 identity(`${name}@example.invalid`);
 for (let id=900001;id<=900006;id++) assert(`admin_rebuild_security.can_access_event(${id}) IS ${allowed.includes(id)?'TRUE':'FALSE'}`, `${name} scope ${id}`);
 assert(`(SELECT count(DISTINCT event_id) FROM public.event_activity_log) = ${allowed.length}`,`${name} activity visibility`);
 assert(`(SELECT count(*) FROM public.event_creation_audit) = ${allowed.length}`,`${name} attribution visibility`);
 add(`DO $$ DECLARE n int; BEGIN UPDATE public.tournament_divisions SET details='${name} edit'; GET DIAGNOSTICS n=ROW_COUNT; IF n<>${allowed.length} THEN RAISE EXCEPTION '${name} update boundary'; END IF; END $$;`);
}
identity('assigned@example.invalid');
add(`DO $$ DECLARE n int; new_id uuid; BEGIN
 DELETE FROM public.tournament_divisions WHERE event_id=900003; GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'Cross-event delete'; END IF;
 BEGIN INSERT INTO public.tournament_divisions(event_id,name) VALUES(900003,'Denied'); RAISE EXCEPTION 'Cross-event insert'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.tournament_divisions SET event_id=900003 WHERE event_id=900001; RAISE EXCEPTION 'Cross-event move'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 INSERT INTO public.tournament_divisions(event_id,name) VALUES(900001,'Allowed') RETURNING id INTO new_id;
 DELETE FROM public.tournament_divisions WHERE id=new_id; GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'Assigned insert/delete failed'; END IF;
 BEGIN
   UPDATE public.tournament_divisions SET ranking_category=1 WHERE event_id=900001;
   RAISE EXCEPTION 'Ranking protection failed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Only super admins can change division ranking tags' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claims','{}',true);`);
assert(`admin_rebuild_security.can_access_event(900001) IS FALSE`,'Missing claims');
add(`RESET ROLE; SET LOCAL ROLE anon; SELECT set_config('request.jwt.claims','{"role":"anon"}',true);`);
assert(`(SELECT count(*) FROM public.tournament_divisions)=5`,'Public division reads');
add(`DO $$ DECLARE n int; BEGIN UPDATE public.tournament_divisions SET details='Anon edit'; GET DIAGNOSTICS n=ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'Anonymous write'; END IF; END $$;
RESET ROLE; SET LOCAL ROLE service_role;
DO $$ DECLARE n int; BEGIN UPDATE public.tournament_divisions SET details='Service edit'; GET DIAGNOSTICS n=ROW_COUNT; IF n<>5 THEN RAISE EXCEPTION 'Service writes'; END IF; END $$;
RESET ROLE;
SELECT 'PASS: actual-schema role, scope, mutation, log and ranking-trigger checks' AS result;
ROLLBACK;`);
writeFileSync(`${dir}/staging-checks.sql`, statements.join('\n'), {mode:0o600});
console.log('Generated transaction-only staging checks.');
const body = name => readFileSync(new URL(name, import.meta.url), 'utf8').replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, '');
writeFileSync(`${dir}/staging-rollback-check.sql`, `BEGIN;
${body('rollback.sql')}
DO $$ BEGIN IF to_regnamespace('admin_rebuild_security') IS NOT NULL THEN RAISE EXCEPTION 'Rollback schema remains'; END IF; END $$;
${body('apply.sql')}
DO $$ BEGIN IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND policyname LIKE 'Rebuild %') <> 8 THEN RAISE EXCEPTION 'Reapply policies missing'; END IF; END $$;
SELECT 'PASS: rollback and reapply against actual schema; outer transaction rolled back' AS result;
ROLLBACK;`, {mode:0o600});
