\set ON_ERROR_STOP on
do $$begin
  if current_database()<>'fourm_following_ranking_test' or exists(select 1 from pg_tables where schemaname='public') then raise exception 'Empty isolated following-ranking test database required'; end if;
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
end $$;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('sub',auth.uid(),'email','a@test.invalid')$$;
grant usage on schema auth to authenticated;
create table public.players(id bigint primary key,name text,email text,approved boolean,bio text,image_url text,additional_images jsonb,nationality text,rank_label text,points numeric,rankings jsonb);
create table public.following_activity(id uuid primary key default gen_random_uuid(),event_key text unique,kind text,local_player_ids bigint[] default '{}',pro_player_ids bigint[] default '{}',event_id bigint,native_match_id uuid,pro_match_id bigint,title text,body text default '',photo_url text,path text,payload jsonb default '{}',occurred_at timestamptz default now());
create table public.local_player_follows(user_id uuid,player_id bigint,created_at timestamptz default now());
create table public.pro_player_follows(user_id uuid,player_id bigint,player_name text,category text,created_at timestamptz default now());
create table public.padel_api_players(id bigint,payload jsonb);
create table public.calendar(id bigint,is_visible boolean,registration_access text,image_url text,poster_image_url text,custom_image_url text,registration_closes_at timestamptz,early_bird_ends_at timestamptz,start_date date,end_date date);
create table public.draws(id uuid,status text);
create table public.draw_matches(id uuid,draw_id uuid);
create table public.pro_match_bookmarks(user_id uuid,match_id bigint,bookmarked boolean);
create table public.event_notification_follows(event_id bigint,email text,following boolean);
create table public.following_sync_state(source_key text,snapshot jsonb,checked_at timestamptz);
create table public.test_pushes(email text,type text,title text,body text,path text);
create function public.following_country(text) returns text language sql immutable as $$select case when length($1)=2 then upper($1) else null end$$;
create function public.following_tournament_relevant(public.following_activity) returns boolean language sql immutable as $$select true$$;
create function public.following_tournament_changes(jsonb) returns jsonb language sql immutable as $$select $1$$;
create function public.enqueue_push(text,text,text,text,text) returns void language sql as $$insert into public.test_pushes values($1,$2,$3,$4,$5)$$;
create function public.record_following_activity(p_item jsonb) returns uuid language plpgsql as $$
declare result uuid;
begin
  insert into public.following_activity(event_key,kind,local_player_ids,pro_player_ids,title,body,photo_url,path,payload)
  values(p_item->>'event_key',p_item->>'kind',array(select value::bigint from jsonb_array_elements_text(coalesce(p_item->'local_player_ids','[]'))),
    array(select value::bigint from jsonb_array_elements_text(coalesce(p_item->'pro_player_ids','[]'))),p_item->>'title',coalesce(p_item->>'body',''),p_item->>'photo_url',p_item->>'path',coalesce(p_item->'payload','{}'))
  on conflict(event_key) do update set title=excluded.title,body=excluded.body,payload=excluded.payload returning id into result;
  return result;
end $$;

\ir ../supabase/migrations/20261109061212_following_sapa_main_ranking_identity.sql
create trigger notify_published_rankings after update on public.players for each row execute function public.notify_published_rankings();

insert into public.players values(191,'Charl Test','charl@test.invalid',true,null,'https://test.invalid/charl.jpg','[]','ZA','9',180,
 '[{"org":"SAPA ranking","ranking_id":15809,"age_group_id":82,"age_group":"Men-Main","ranking_type":3,"match_type":"Men-Doubles","rank":"17","points":"3381","ranking_date":"2026-11-02T00:00:00"},
 {"org":"SA Grand Tour","ranking_id":16482,"age_group_id":82,"age_group":"Men-Main","ranking_type":3,"match_type":"Men-Doubles","rank":"9","points":"180"}]');
insert into public.players values(192,'Women Test','women@test.invalid',true,null,null,'[]','ZA','3',100,
 '[{"org":"SAPA ranking","ranking_id":15809,"age_group_id":83,"age_group":"Women-Main","ranking_type":4,"match_type":"Women-Doubles","rank":"6","points":"2000","ranking_date":"2026-11-02"}]');
insert into public.players select 193,'Not followed','other@test.invalid',true,null,null,'[]','ZA','17',3381,rankings from public.players where id=191;
insert into public.players select 194,'Unapproved','unapproved@test.invalid',false,null,null,'[]','ZA','17',3381,rankings from public.players where id=191;
insert into public.local_player_follows(user_id,player_id) values('00000000-0000-4000-8000-000000000001',191),('00000000-0000-4000-8000-000000000001',192),('00000000-0000-4000-8000-000000000001',194),('00000000-0000-4000-8000-000000000002',193);
insert into public.pro_player_follows values('00000000-0000-4000-8000-000000000001',191,'FIP Test','men',now());
insert into public.padel_api_players values(191,'{"id":191,"name":"FIP Test","category":"men","ranking":7,"points":1555,"photo_url":"https://test.invalid/fip.jpg","nationality":"ES"}');
insert into public.following_activity(event_key,kind,local_player_ids,title,path,payload) values('legacy','ranking','{191}','Charl moved to #9','/players/191','{"before_rank":"17","rank":"9","points":180}');

alter table public.players add column gender text;
update public.players set gender=case when id=192 then 'Female' else 'Male' end;
\ir ../supabase/migrations/20261109083316_following_main_profile_gender.sql

do $$declare ranks jsonb; feed jsonb;begin
  ranks:=public.following_sapa_main_rankings((select rankings from public.players where id=191));
  if jsonb_array_length(ranks)<>1 or ranks->0->>'rank'<>'17' or ranks->0->>'points'<>'3381' or ranks->0->>'ranking_id'<>'15809' then raise exception 'SAPA main must not borrow SA Grand Tour rank or points: %',ranks; end if;
  if jsonb_array_length(public.following_sapa_main_rankings('[{"org":"SA Grand Tour","ranking_id":16482,"age_group":"Men-Main","rank":9}]'))<>0 then raise exception 'Other circuits excluded'; end if;
  if jsonb_array_length(public.following_sapa_main_rankings('[{"org":"SAPA ranking","ranking_id":15809,"age_group_id":2,"age_group":"Men Over 35","rank":3}]'))<>0 then raise exception 'Age-group rankings excluded'; end if;
  if jsonb_array_length(public.following_sapa_main_rankings('[{"org":"SAPA ranking","ranking_id":15809,"age_group_id":82,"age_group":"Women-Main","rank":1}]'))<>0 then raise exception 'Conflicting identity rejected'; end if;
  if jsonb_array_length(public.following_sapa_main_rankings('[{"org":"SA Grand Tour","ranking_id":15809,"age_group_id":82,"rank":1}]'))<>0 then raise exception 'Conflicting organisation rejected'; end if;
  if jsonb_array_length(public.following_sapa_main_rankings('[{"org":"SAPA ranking","age_group":"Men-Main","match_type":"Men-Singles","rank":1}]'))<>0 then raise exception 'Singles excluded'; end if;
  if jsonb_array_length(public.following_sapa_main_rankings('[{"org":"SAPA ranking","age_group":"Men-Main","rank":1},{"org":"SAPA ranking","age_group":"Men-Main","rank":2}]'))<>0 then raise exception 'Ambiguous main rows excluded'; end if;
  if public.following_sapa_main_rankings('{"invalid":true}')<>'[]'::jsonb then raise exception 'Malformed snapshots excluded'; end if;
end $$;

-- A preference/circuit/points edit is not a change of national position.
update public.players set rank_label='8',points=300 where id=191;
update public.players set rankings=jsonb_set(rankings,'{1,rank}','"8"') where id=191;
update public.players set rankings=jsonb_set(rankings,'{0,points}','"3382"') where id=191;
do $$begin if (select count(*) from public.following_activity where event_key<>'legacy')<>0 or (select count(*) from public.test_pushes)<>0 then raise exception 'Display, circuit or points-only updates must not notify'; end if;end $$;

update public.players set rankings=jsonb_set(jsonb_set(rankings,'{0,rank}','"16"'),'{0,ranking_date}','"2026-11-09"') where id=191;
do $$declare fact public.following_activity;begin
  select * into fact from public.following_activity where event_key<>'legacy';
  if fact.payload->>'before_rank'<>'17' or fact.payload->>'rank'<>'16' or fact.payload->>'ranking_scope'<>'sapa:15809:3:82' or not public.following_ranking_relevant(fact) then raise exception 'Verified scope and baseline required: %',fact.payload; end if;
  if (select count(*) from public.test_pushes)<>1 or (select title from public.test_pushes limit 1) not like '%Men-Main%' then raise exception 'Main movement notification missing'; end if;
end $$;
update public.players set rankings=jsonb_set(rankings,'{0,rank}','"15"') where id=191;
do $$begin if (select count(*) from public.following_activity where event_key<>'legacy')<>1 or (select payload->>'before_rank' from public.following_activity where event_key<>'legacy')<>'17' then raise exception 'Daily baseline must remain within its original source'; end if;end $$;
update public.players set rankings=jsonb_set(rankings,'{0,rank}','"17"') where id=191;
do $$begin if exists(select 1 from public.following_activity where kind='ranking' and public.following_ranking_relevant(following_activity)) then raise exception 'Round trip to original position must not display movement'; end if;end $$;

-- An older snapshot cannot create movement or a push.
delete from public.test_pushes;
update public.players set rankings=jsonb_set(jsonb_set(rankings,'{0,rank}','"99"'),'{0,ranking_date}','"2026-10-01"') where id=191;
do $$begin if exists(select 1 from public.test_pushes) then raise exception 'Stale edition must not notify'; end if;end $$;
update public.players set rankings=jsonb_set(jsonb_set(rankings,'{0,rank}','"17"'),'{0,ranking_date}','"2026-11-09"') where id=191;
-- Fresh test baseline, independent of the deliberately stale row above.
delete from public.following_activity where event_key<>'legacy'; delete from public.test_pushes;
update public.players set rankings=jsonb_set(rankings,'{0,rank}','"5"') where id=192;
do $$begin if not exists(select 1 from public.following_activity where payload->>'ranking_scope'='sapa:15809:4:83' and payload->>'before_rank'='6' and payload->>'rank'='5') then raise exception 'Women Main must retain its own scope'; end if; if not exists(select 1 from public.test_pushes where title like '%Women-Main%' and path like '%gender=women') then raise exception 'Women Main notification identity missing'; end if;end $$;

select set_config('test.user','00000000-0000-4000-8000-000000000001',false);
set role authenticated;
do $$declare feed jsonb;begin
  if has_function_privilege('authenticated','public.following_sapa_main_rankings(jsonb)','EXECUTE') or has_function_privilege('anon','public.following_ranking_relevant(public.following_activity)','EXECUTE') then raise exception 'Internal helpers must not become client RPCs'; end if;
  if has_table_privilege('authenticated','public.following_activity','SELECT') then raise exception 'Activity table must stay RPC-only'; end if;
  feed:=public.get_following_feed();
  if jsonb_array_length(feed->'followed_players')<>3 then raise exception 'Only approved own followed players may be returned'; end if;
  if not exists(select 1 from jsonb_array_elements(feed->'followed_players') p where p->>'id'='191' and p->'main_rankings'->0->>'rank'='17') then raise exception 'Current Charl card must show SAPA 17, not display rank 8'; end if;
  if not exists(select 1 from jsonb_array_elements(feed->'followed_players') p where p->>'id'='191' and p->>'source'='pro' and p->'pro_ranking'->>'rank'='7' and p->>'name'='FIP Test') then raise exception 'Local and international numeric IDs must not cross-contaminate ranks or portraits'; end if;
  if jsonb_array_length(feed->'items')<>1 or feed->'items'->0->'payload'->>'ranking_scope'<>'sapa:15809:4:83' then raise exception 'Legacy false movements must be hidden before pagination'; end if;
  if feed::text like '%@test.invalid%' then raise exception 'Private contact fields must never enter feed JSON'; end if;
end $$;
reset role;
select set_config('test.user','00000000-0000-4000-8000-000000000002',false);
set role authenticated;
do $$declare feed jsonb;begin feed:=public.get_following_feed(); if jsonb_array_length(feed->'followed_players')<>1 or feed->'followed_players'->0->>'id'<>'193' or jsonb_array_length(feed->'items')<>0 then raise exception 'Follow ownership leaked across accounts'; end if;end $$;
reset role;
select set_config('test.user','',false);
do $$begin begin perform public.get_following_feed(); raise exception 'Unauthenticated feed must fail'; exception when others then if sqlerrm<>'Sign in to view Following' then raise; end if;end;end $$;

-- Imported opposite-gender rows must never override a player's own division.
insert into public.players(id,name,email,approved,nationality,gender,rankings) values(404,'Mikayla Test','mikayla@test.invalid',true,'ZA','Female',
 '[{"org":"SAPA ranking","ranking_id":15809,"age_group_id":82,"age_group":"Men-Main","ranking_type":3,"match_type":"Men-Doubles","rank":"822","points":"23.667"},
 {"org":"SAPA ranking","ranking_id":15809,"age_group_id":83,"age_group":"Women-Main","ranking_type":4,"match_type":"Women-Doubles","rank":"2","points":"10444"}]');
do $$declare ranks jsonb; actor jsonb; fact public.following_activity;begin
  ranks:=public.following_sapa_main_rankings((select rankings from public.players where id=404),'Female');
  if jsonb_array_length(ranks)<>1 or ranks->0->>'age_group'<>'Women-Main' or ranks->0->>'rank'<>'2' then raise exception 'Female profile must show Women-Main only: %',ranks; end if;
  if public.following_sapa_main_rankings((select rankings from public.players where id=404),null)<>'[]'::jsonb then raise exception 'Unknown gender must not guess between two main scopes'; end if;
  ranks:=public.following_sapa_main_rankings((select rankings from public.players where id=404),'Male');
  if jsonb_array_length(ranks)<>1 or ranks->0->>'age_group'<>'Men-Main' then raise exception 'Male profile must select Men-Main only'; end if;
  ranks:=public.following_sapa_main_rankings((select rankings from public.players where id=191),'Female');
  if ranks<>'[]'::jsonb then raise exception 'Missing own division must not borrow the other gender'; end if;
  select * into fact from public.following_activity where event_key='legacy';
  fact.local_player_ids:=array[404]; fact.payload:='{"ranking_source":"sapa_main_v1","ranking_id":15809,"ranking_scope":"sapa:15809:3:82","age_group_id":82,"ranking_type":3,"before_rank":823,"rank":822}';
  if public.following_ranking_relevant(fact) then raise exception 'Wrong-gender historical main movement must remain hidden'; end if;
  actor:=public.following_activity_media(fact)->'actors'->0;
  if jsonb_array_length(actor->'main_rankings')<>1 or actor->'main_rankings'->0->>'age_group'<>'Women-Main' then raise exception 'Activity portraits must retain the same own-division stats'; end if;
  if has_function_privilege('authenticated','public.following_sapa_main_rankings(jsonb,text)','EXECUTE') or has_function_privilege('anon','public.following_sapa_main_rankings(jsonb,text)','EXECUTE') then raise exception 'Gender selector must stay internal'; end if;
end $$;
delete from public.test_pushes;
update public.players set rankings=jsonb_set(rankings,'{0,rank}','"821"') where id=404;
do $$begin if exists(select 1 from public.test_pushes) or exists(select 1 from public.following_activity where 404=any(local_player_ids)) then raise exception 'Opposite-gender position must not create a post or push'; end if;end $$;
insert into public.local_player_follows(user_id,player_id) values('00000000-0000-4000-8000-000000000001',404);
select set_config('test.user','00000000-0000-4000-8000-000000000001',false);
set role authenticated;
do $$declare player jsonb;begin
  select value into player from jsonb_array_elements(public.get_following_feed()->'followed_players') where value->>'id'='404';
  if jsonb_array_length(player->'main_rankings')<>1 or player->'main_rankings'->0->>'rank'<>'2' then raise exception 'Home profile must receive Women-Main #2 only'; end if;
  if player ? 'gender' or player ? 'email' then raise exception 'The selector must not add private attributes to profile cards'; end if;
end $$;
reset role;
select 'Following main rankings DB: source identity, profile gender, movement, stale editions, baseline, privacy and ownership passed' as result;
