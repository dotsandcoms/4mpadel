\set ON_ERROR_STOP on
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create schema private;
create schema messaging;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
create function auth.email() returns text language sql stable as $$select auth.jwt()->>'email'$$;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz,is_anonymous boolean default false);
create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
create table public.players(id bigint primary key,email text,name text,approved boolean,image_url text,home_club text);
create view public.players_public as select id,name,approved,image_url,home_club from public.players where approved=true;
create table public.local_player_follows(user_id uuid,player_id bigint,created_at timestamptz default now(),primary key(user_id,player_id));
alter table public.local_player_follows enable row level security;
grant select on public.local_player_follows to authenticated;
create policy own_follows on public.local_player_follows to authenticated using(user_id=auth.uid());
grant usage on schema auth to authenticated;
grant execute on function auth.uid(),auth.jwt(),auth.email() to authenticated;
create table messaging.blocks(user_id uuid,blocked_id uuid,primary key(user_id,blocked_id));

-- @active_actor_helper@
\ir ../supabase/migrations/20261020091314_player_follower_counts.sql
\ir ../supabase/migrations/20261021091413_player_follower_lists.sql
\ir ../supabase/migrations/20261111063524_public_player_follower_directory.sql

create temporary table checks(label text);
grant insert,select on checks to authenticated,anon;
create function pg_temp.expect(ok boolean,label text) returns void language plpgsql as $$begin if not coalesce(ok,false) then raise exception 'FAIL: %',label; end if; insert into checks values(label);end$$;
create function pg_temp.denied(query text) returns boolean language plpgsql as $$begin execute query;return false;exception when insufficient_privilege or invalid_parameter_value then return true;end$$;
create function pg_temp.identity(n int) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub',('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'email','player'||n||'@example.test','role','authenticated','session_id',('20000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid)::text,false)
$$;
insert into auth.users(id,email,email_confirmed_at) select ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'player'||n||'@example.test',now() from generate_series(1,9) n;
insert into auth.sessions(id,user_id) select ('20000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,9) n;
insert into public.players(id,email,name,approved) select n,'player'||n||'@example.test','Player '||n,n<>4 from generate_series(1,9) n;
update auth.users set deleted_at=now() where email='player5@example.test';
update auth.users set banned_until=now()+interval '1 day' where email='player6@example.test';
update auth.users set email_confirmed_at=null where email='player7@example.test';
insert into public.local_player_follows(user_id,player_id,created_at) select id,2,now()-n*interval '1 minute' from (select id,row_number() over(order by id) n from auth.users where email not in('player1@example.test','player2@example.test')) f;
insert into messaging.blocks values('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000008');

set role authenticated;
select pg_temp.identity(1);
select pg_temp.expect(jsonb_array_length(public.get_player_followers(2)->'followers')=2,'another public player list includes only eligible profiles');
select pg_temp.expect(public.get_player_followers(2)->'followers'->0->>'id'='3','newest eligible follower appears first');
select pg_temp.expect(public.get_player_followers(2)->'followers'->1->>'id'='9','hidden,deleted,banned,unverified and blocked identities are excluded');
select pg_temp.expect(not exists(select 1 from jsonb_object_keys(public.get_player_followers(2)->'followers'->0) k where k not in('id','name','image_url','home_club')),'no email,auth ID or follow record leaves the RPC');
select pg_temp.expect((select count(*) from public.local_player_follows where player_id=2)=0,'raw follow records remain owner-only');
select pg_temp.expect((public.get_player_followers(2,1,0)->>'has_more')::boolean,'first short page exposes the next page');
select pg_temp.expect(public.get_player_followers(2,1,1)->'followers'->0->>'id'='9','next page has a stable distinct identity');
select pg_temp.expect(not (public.get_player_followers(2,1,1)->>'has_more')::boolean,'last page ends pagination');
select pg_temp.expect(pg_temp.denied('select public.get_player_followers(2,51,0)'),'oversized pages rejected');
select pg_temp.expect(pg_temp.denied('select public.get_player_followers(2,1,-1)'),'negative offsets rejected');
select pg_temp.expect(pg_temp.denied('select public.get_player_followers(4)'),'hidden target cannot be browsed by another account');
select pg_temp.expect(pg_temp.denied('select public.get_player_followers(999)'),'unknown target does not return an empty success');
select pg_temp.expect(pg_temp.denied('select public.get_player_followers(5)'),'deleted target unavailable');
select pg_temp.expect(pg_temp.denied('select public.get_player_followers(6)'),'banned target unavailable');
select pg_temp.expect(pg_temp.denied('select public.get_my_player_followers(2)'),'legacy own-only endpoint still checks ownership');
select pg_temp.identity(2);
select pg_temp.expect(jsonb_array_length(public.get_player_followers(2)->'followers')=3,'profile owner can still browse public followers');
select pg_temp.expect(jsonb_array_length(public.get_my_player_followers(2)->'followers')=3,'old installed apps keep the own-list endpoint with safe filtering');
select pg_temp.identity(4);
select pg_temp.expect(jsonb_array_length(public.get_player_followers(4)->'followers')=0,'owner can still view their own unpublished profile list');
select pg_temp.identity(7);
select pg_temp.expect(pg_temp.denied('select public.get_player_followers(2)'),'unverified viewer denied');
select pg_temp.identity(5);
select pg_temp.expect(pg_temp.denied('select public.get_player_followers(2)'),'deleted viewer denied');
select pg_temp.identity(6);
select pg_temp.expect(pg_temp.denied('select public.get_player_followers(2)'),'banned viewer denied');
reset role;
delete from auth.sessions where user_id='10000000-0000-0000-0000-000000000001';
set role authenticated;
select pg_temp.identity(1);
select pg_temp.expect(pg_temp.denied('select public.get_player_followers(2)'),'revoked session denied even with a signed-in claim');
select pg_temp.identity(2);
reset role;
update auth.sessions set not_after=now()-interval '1 minute' where user_id='10000000-0000-0000-0000-000000000002';
set role authenticated;
select pg_temp.expect(pg_temp.denied('select public.get_my_player_followers(2)'),'old endpoint also rejects an expired owner session');
reset role;
update auth.sessions set not_after=null where user_id='10000000-0000-0000-0000-000000000002';
insert into auth.sessions values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',null);
insert into messaging.blocks values('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001');
set role authenticated;
select pg_temp.identity(1);
select pg_temp.expect(pg_temp.denied('select public.get_player_followers(2)'),'target blocking the viewer prevents list access');
select pg_temp.expect(pg_temp.denied('select profile_social.get_player_followers(2)'),'calling private helper directly cannot bypass target block');
reset role;
delete from messaging.blocks where user_id='10000000-0000-0000-0000-000000000002';
insert into messaging.blocks values('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002');
set role authenticated;
select pg_temp.identity(1);
select pg_temp.expect(pg_temp.denied('select public.get_player_followers(2)'),'viewer blocking target prevents list access');
reset role;
set role anon;
select pg_temp.expect(pg_temp.denied('select public.get_player_followers(2)'),'anonymous follower identity lookup denied');
select pg_temp.expect(not has_function_privilege(current_user,'profile_social.get_player_followers(bigint,integer,integer)','execute'),'anonymous cannot call helper');
reset role;
select pg_temp.expect(not has_function_privilege('service_role','public.get_player_followers(bigint,integer,integer)','execute'),'no unnecessary service-role grants added');
select 'Public player followers DB: '||count(*)||' assertions passed' from checks;
