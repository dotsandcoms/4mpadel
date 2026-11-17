\set ON_ERROR_STOP on
\ir fixtures/legacy-permission-boundaries.sql
create sequence public.test_player_ids start 1000;
grant usage on sequence public.test_player_ids to authenticated,service_role;
alter table public.players alter column id set default nextval('public.test_player_ids');
alter table public.tournament_participants alter column id set default gen_random_uuid();

insert into auth.users(id,email) select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  'actor'||n||'@example.test' from generate_series(1,12) n;
insert into auth.sessions select id,id,null from auth.users;
insert into public.admin_sidebar_permissions(email,role,allowed_tabs,module_permissions) values
  ('actor4@example.test','custom',array['gallery'],'{"gallery":{"allowedAlbums":["10000000-0000-0000-0000-000000000001"]}}'),
  ('actor5@example.test','custom',array['gallery'],'{}'),
  ('actor6@example.test','custom',array['blog'],'{}'),
  ('actor7@example.test','custom',array['calendar'],'{}'),
  ('actor8@example.test','custom',array['settings'],'{}'),
  ('actor9@example.test','super_admin','{}','{}'),
  ('actor10@example.test','custom',array['coaches'],'{}'),
  ('actor11@example.test','custom',array['clubs'],'{}'),
  ('actor12@example.test','custom',array['event-mgmt'],'{"event-mgmt":{"allowedEvents":[101]}}');
insert into public.organisations(id,name) values
  ('20000000-0000-0000-0000-000000000001','Org A'),('20000000-0000-0000-0000-000000000002','Org B');
insert into public.organisation_members(organisation_id,user_email,role) values
  ('20000000-0000-0000-0000-000000000001','actor2@example.test','owner'),
  ('20000000-0000-0000-0000-000000000002','actor3@example.test','owner');
insert into public.calendar(id,event_name,organisation_id) values
  (101,'Event A','20000000-0000-0000-0000-000000000001'),(102,'Event B','20000000-0000-0000-0000-000000000002');
insert into public.clubs(id,name) values
  ('30000000-0000-0000-0000-000000000001','Club A'),('30000000-0000-0000-0000-000000000002','Club B');
insert into public.club_members(club_id,user_email,role) values
  ('30000000-0000-0000-0000-000000000001','actor2@example.test','owner'),
  ('30000000-0000-0000-0000-000000000002','actor3@example.test','owner');
insert into public.albums(id,title,is_active) values
  ('10000000-0000-0000-0000-000000000001','Private A',false),
  ('10000000-0000-0000-0000-000000000002','Private B',false),
  ('10000000-0000-0000-0000-000000000003','Published',true);
insert into public.gallery_images(id,album_id,caption) values
  ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Original');
insert into public.tournament_divisions(id,event_id,name) values
  ('50000000-0000-0000-0000-000000000001',101,'Division A'),
  ('50000000-0000-0000-0000-000000000002',102,'Division B');
insert into public.tournament_draws(id,division_id,name) select id,id,name from public.tournament_divisions;
insert into public.tournament_matches(id,division_id,status) select id,id,'pending' from public.tournament_divisions;
insert into public.settings(key,value) values('test','original');
insert into public.events(id,title) values(1,'Legacy event');
insert into public.blogs(id,title) values('60000000-0000-0000-0000-000000000001','Original');
insert into storage.objects(id,bucket_id,name,owner_id) values
  ('70000000-0000-0000-0000-000000000001','blog-images','original.jpg','00000000-0000-0000-0000-000000000006');

create temp table checks(label text);
grant insert,select on checks to anon,authenticated,service_role;
create function pg_temp.expect(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; insert into pg_temp.checks values(label); end $$;
create function pg_temp.identity(n int,session_n int default null) returns void language sql as $$
select set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-0000-0000-'||lpad(n::text,12,'0'),
  'session_id','00000000-0000-0000-0000-'||lpad(coalesce(session_n,n)::text,12,'0'),
  'email','actor'||n||'@example.test','role','authenticated')::text,false)::void $$;
create function pg_temp.affected(query text) returns int language plpgsql as $$
declare n int; begin execute query; get diagnostics n=row_count; return n; end $$;
create function pg_temp.denied(query text) returns boolean language plpgsql as $$
begin execute query; return false; exception when insufficient_privilege then return true; end $$;

-- Prove the fixture reproduces the live bug before correcting it.
set role authenticated;
select pg_temp.identity(1);
select pg_temp.expect(pg_temp.affected('update public.settings set value=''unsafe''')=1,'reproduced ordinary-account admin write');
select pg_temp.expect(has_function_privilege(current_user,'public.enqueue_push(text,text,text,text,text,jsonb)','execute'),'reproduced worker RPC client grant');
reset role;

\ir ../supabase/migrations/20261110102648_permission_boundaries_for_legacy_admin_and_worker_access.sql

set role authenticated;
select pg_temp.identity(1);
select pg_temp.expect(pg_temp.affected('update public.settings set value=''blocked''')=0,'ordinary account cannot change settings');
select pg_temp.expect(pg_temp.affected('update public.events set title=''blocked''')=0,'ordinary account cannot change legacy events');
select pg_temp.expect(pg_temp.affected('update public.blogs set title=''blocked''')=0,'ordinary account cannot change blog');
select pg_temp.expect(pg_temp.affected('update public.clubs set name=''blocked''')=0,'ordinary account cannot change clubs');
select pg_temp.expect(pg_temp.affected('update public.calendar set event_name=''blocked''')=0,'ordinary account cannot change calendar');
select pg_temp.expect(pg_temp.affected('update public.tournament_divisions set name=''blocked''')=0,'ordinary account cannot change divisions');
select pg_temp.expect((select count(*)=1 from public.albums),'ordinary account sees only published albums');
select pg_temp.expect(pg_temp.affected('update public.albums set title=''blocked''')=0,'ordinary account cannot change albums');
select pg_temp.expect(pg_temp.denied('insert into public.rankedin_cache(url) values(''poison'')'),'ordinary account cannot poison RankedIn cache');
select pg_temp.expect(pg_temp.denied('insert into public.rankedin_results_cache(event_id) values(101)'),'ordinary account cannot poison event results cache');
select pg_temp.expect(pg_temp.denied('insert into public.player_matches(rankedin_id) values(''poison'')'),'ordinary account cannot poison match cache');
select pg_temp.expect(pg_temp.denied('insert into public.whatsapp_queue(status) values(''pending'')'),'ordinary account cannot send WhatsApp queue jobs');
select pg_temp.expect(pg_temp.denied('insert into public.coach_applications(status) values(''approved'')'),'ordinary account cannot self-approve as coach');
select pg_temp.expect(not pg_temp.denied('insert into public.coach_applications(status) values(''pending'')'),'pending coach application remains available');
select pg_temp.expect(pg_temp.denied('insert into storage.objects(bucket_id,name) values(''gallery'',''foreign.jpg'')'),'ordinary account cannot upload gallery content');
select pg_temp.expect(pg_temp.affected('delete from storage.objects where bucket_id=''blog-images''')=0,'ordinary account cannot delete blog images');
select pg_temp.expect(pg_temp.denied('select public.upsert_tournament_participant(102,''Intruder'',''victim@example.test'',''Open'',null,true)'),'participant-paid RPC rejects ordinary user');
select pg_temp.expect(pg_temp.denied('select public.enqueue_push(''victim@example.test'',''test'',''bad'',''bad'',null,''{}'')'),'direct push enqueue denied');

-- Every historical overload must reject an arbitrary target profile.
do $$ declare f record; query text; begin
for f in select p.proname,p.oid,p.proargtypes,p.proargnames from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in('create_player_profile','create_player_profile_pay_later') loop
  select 'select public.'||f.proname||'('||string_agg(case when f.proargnames[ordinality]='p_email' then '''victim@example.test''::text' else 'null::'||format_type(type_oid,null) end,',' order by ordinality)||')'
    into query from unnest(f.proargtypes) with ordinality as a(type_oid,ordinality);
  if position('You can only create your own profile.' in pg_get_functiondef(f.oid))=0 then raise exception 'Profile guard missing: %',pg_get_functiondef(f.oid); end if;
  perform pg_temp.expect(pg_temp.denied(query),'profile overload denies foreign email: '||f.oid::regprocedure::text);
  perform pg_temp.expect(pg_temp.denied(replace(query,'''victim@example.test''::text','null::text')),'profile overload denies missing email: '||f.oid::regprocedure::text);
  perform pg_temp.expect(not has_function_privilege('anon',f.oid,'execute'),'profile overload denies anonymous execute: '||f.oid::regprocedure::text);
end loop; end $$;
select pg_temp.expect(not pg_temp.denied('select public.create_player_profile(''actor1@example.test''::text,''Own name''::text,''123456789''::text)'),'own legacy profile creation remains allowed');

-- The actor only owns Org A / Club A.
select pg_temp.identity(2);
select pg_temp.expect(pg_temp.affected('update public.calendar set event_name=''Edited A'' where id=101')=1,'organisation owner can edit own event');
select pg_temp.expect(pg_temp.affected('update public.calendar set event_name=''Blocked B'' where id=102')=0,'organisation owner cannot edit foreign event');
select pg_temp.expect(pg_temp.affected('update public.clubs set name=''Edited A'' where id=''30000000-0000-0000-0000-000000000001''')=1,'club owner can edit own club');
select pg_temp.expect(pg_temp.affected('update public.clubs set name=''Blocked B'' where id=''30000000-0000-0000-0000-000000000002''')=0,'club owner cannot edit foreign club');
select pg_temp.expect(pg_temp.denied('insert into public.club_organisations(club_id,organisation_id) values(''30000000-0000-0000-0000-000000000002'',''20000000-0000-0000-0000-000000000001'')'),'cannot take over foreign club by linking it');
select pg_temp.expect(pg_temp.denied('update public.calendar set organisation_id=''20000000-0000-0000-0000-000000000002'' where id=101'),'scoped event editor cannot transfer event ownership');
select pg_temp.expect(pg_temp.affected('update public.tournament_draws set name=''Edited A'' where division_id=''50000000-0000-0000-0000-000000000001''')=1,'own legacy draw edit allowed');
select pg_temp.expect(pg_temp.affected('update public.tournament_draws set name=''Blocked B'' where division_id=''50000000-0000-0000-0000-000000000002''')=0,'foreign legacy draw edit denied');
select pg_temp.expect(pg_temp.affected('update public.tournament_matches set status=''finished'' where division_id=''50000000-0000-0000-0000-000000000002''')=0,'foreign legacy match edit denied');
select pg_temp.expect(not pg_temp.denied('select public.upsert_tournament_participant(101,''Own player'',''player@example.test'',''Open'',null,true)'),'own event participant sync allowed');
select pg_temp.expect(pg_temp.denied('select public.upsert_tournament_participant(102,''Foreign player'',''player@example.test'',''Open'',null,true)'),'foreign participant sync denied');

select pg_temp.identity(4);
select pg_temp.expect((select count(*)=2 from public.albums),'album editor sees assigned unpublished album and public album');
select pg_temp.expect(pg_temp.affected('update public.albums set title=''Assigned edit'' where id=''10000000-0000-0000-0000-000000000001''')=1,'assigned album edit allowed');
select pg_temp.expect(pg_temp.affected('update public.albums set title=''Blocked'' where id=''10000000-0000-0000-0000-000000000002''')=0,'foreign unpublished album denied');
select pg_temp.expect(pg_temp.denied('insert into public.albums(id,title) values(gen_random_uuid(),''Unassigned'')'),'restricted album editor cannot create unassigned album');
select pg_temp.expect(pg_temp.affected('update public.gallery_images set caption=''Edited''')=1,'assigned album image edit allowed');
select pg_temp.expect(not pg_temp.denied('insert into storage.objects(bucket_id,name) values(''gallery'',''albums/10000000-0000-0000-0000-000000000001/new.jpg'')'),'assigned UUID gallery path upload allowed');
select pg_temp.expect(pg_temp.denied('insert into storage.objects(bucket_id,name) values(''gallery'',''albums/10000000-0000-0000-0000-000000000002/new.jpg'')'),'foreign UUID gallery path upload denied');
select pg_temp.expect(pg_temp.denied('insert into storage.objects(bucket_id,name) values(''gallery'',''legacy-title/overwrite.jpg'')'),'scoped editor cannot overwrite unowned legacy path');

select pg_temp.identity(5);
select pg_temp.expect(not pg_temp.denied('insert into public.albums(id,title) values(gen_random_uuid(),''New album'')'),'full Gallery admin can create album');
select pg_temp.expect(pg_temp.affected('update public.settings set value=''blocked''')=0,'Gallery tab does not grant Settings');
select pg_temp.identity(6);
select pg_temp.expect(pg_temp.affected('update public.blogs set title=''Blog edit''')=1,'Blog admin can edit blog');
select pg_temp.expect(pg_temp.affected('update storage.objects set name=''edited.jpg'' where bucket_id=''blog-images''')=1,'Blog admin can update blog image');
select pg_temp.identity(7);
select pg_temp.expect(pg_temp.affected('update public.calendar set event_name=''Calendar admin''')=2,'Calendar admin retains full calendar scope');
select pg_temp.expect(not pg_temp.denied('insert into storage.objects(bucket_id,name) values(''gallery'',''posters/new.jpg'')'),'Calendar admin can upload poster');
select pg_temp.expect(not pg_temp.denied('insert into public.rankedin_results_cache(event_id) values(101)'),'Calendar admin result-sync remains allowed');
select pg_temp.identity(8);
select pg_temp.expect(pg_temp.affected('update public.settings set value=''authorised''')=1,'Settings admin can edit settings');
select pg_temp.identity(10);
select pg_temp.expect(not pg_temp.denied('insert into public.coach_applications(status) values(''approved'')'),'Coaches admin can approve coach');
select pg_temp.identity(11);
select pg_temp.expect(pg_temp.affected('update public.clubs set name=''Clubs admin''')=2,'Clubs admin retains full clubs scope');
select pg_temp.identity(12);
select pg_temp.expect(pg_temp.affected('update public.calendar set event_name=''Assigned event'' where id=101')=1,'explicit event assignment allowed');
select pg_temp.expect(pg_temp.affected('update public.calendar set event_name=''Foreign event'' where id=102')=0,'explicit event assignment does not grant foreign event');

-- Session revocation, deletion and bans also deny a previously privileged actor.
select pg_temp.identity(9,1);
select pg_temp.expect(pg_temp.affected('update public.settings set value=''wrong session''')=0,'session belonging to another account rejected');
reset role;
update auth.sessions set not_after=now()-interval '1 minute' where user_id='00000000-0000-0000-0000-000000000009';
set role authenticated;
select pg_temp.identity(9);
select pg_temp.expect(pg_temp.affected('update public.settings set value=''expired''')=0,'expired admin session rejected');
reset role;
update auth.sessions set not_after=null where user_id='00000000-0000-0000-0000-000000000009';
update auth.users set banned_until=now()+interval '1 hour' where email='actor9@example.test';
set role authenticated;
select pg_temp.expect(pg_temp.affected('update public.settings set value=''banned''')=0,'banned admin rejected');
reset role;
update auth.users set banned_until=null,deleted_at=now() where email='actor9@example.test';
set role authenticated;
select pg_temp.expect(pg_temp.affected('update public.settings set value=''deleted''')=0,'deleted admin rejected');
reset role;

set role anon;
select pg_temp.expect((select count(*)=1 from public.albums),'anonymous published catalogue read preserved');
select pg_temp.expect(pg_temp.denied('insert into public.rankedin_cache(url) values(''poison'')'),'anonymous cache poison denied');
select pg_temp.expect(not pg_temp.denied('insert into public.coach_applications(status) values(''pending'')'),'anonymous pending coach application preserved');
select pg_temp.expect(pg_temp.denied('insert into public.coach_applications(status) values(''approved'')'),'anonymous coach approval denied');
reset role;
set role service_role;
select pg_temp.expect(not pg_temp.denied('insert into public.rankedin_cache(url) values(''trusted worker'')'),'trusted worker cache write preserved');
select pg_temp.expect(has_function_privilege(current_user,'public.enqueue_push(text,text,text,text,text,jsonb)','execute'),'worker enqueue execute preserved');
reset role;
do $$ declare t text; begin
  foreach t in array array['push_deliveries','event_notification_follows','tournament_notification_jobs','notification_event_snapshots','notification_match_snapshots'] loop
    perform pg_temp.expect(not has_table_privilege('authenticated','public.'||t,'select'),'worker table client read denied: '||t);
    perform pg_temp.expect(not has_table_privilege('anon','public.'||t,'select'),'worker table anonymous read denied: '||t);
    perform pg_temp.expect(has_table_privilege('service_role','public.'||t,'insert'),'worker table server insert preserved: '||t);
  end loop;
  foreach t in array array['player_devices','player_push_tokens','event_activity_log'] loop
    perform pg_temp.expect(has_table_privilege('authenticated','public.'||t,'select'),'own scoped read grant preserved: '||t);
    perform pg_temp.expect(not has_table_privilege('authenticated','public.'||t,'insert'),'direct record forgery denied: '||t);
    perform pg_temp.expect(not has_table_privilege('authenticated','public.'||t,'update'),'direct record rewrite denied: '||t);
  end loop;
end $$;
select 'Permission boundary DB: '||count(*)||' assertions passed' from checks;
