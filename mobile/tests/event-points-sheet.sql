\set ON_ERROR_STOP on
do $$begin
  if current_database()<>'fourm_event_points_sheet_test' or exists(select 1 from pg_tables where schemaname='public') then raise exception 'Empty isolated points-sheet database required'; end if;
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
end $$;
create table public.calendar(id bigint primary key,is_visible boolean,sanction_status text,registration_access text,sapa_status text,event_status text,start_date date,end_date date);
create table public.tournament_divisions(id uuid primary key,event_id bigint,name text);
create table public.tournament_finalisations(division_id uuid,event_id bigint,fingerprint text,finalised_at timestamptz);
create table public.draws(division_id uuid,event_id bigint,status text);
create table public.players(id bigint primary key,name text,email text,approved boolean);
create table public.ranking_points_table(id uuid primary key,round_label text,display_order integer);
create table public.player_ranking_points(id uuid primary key,player_id bigint,event_id bigint,division_id uuid,points_table_id uuid,round_code text,points integer,reversal_of uuid);
create function public.tm_result_fingerprint(uuid) returns text language sql stable as $$select 'current'::text$$;
revoke all on all tables in schema public from public,anon,authenticated;
\ir ../supabase/migrations/20261116090531_published_event_points_sheet.sql
insert into public.calendar values(1,true,'approved','public','Gold',null,current_date-3,current_date-1);
insert into public.tournament_divisions values('00000000-0000-4000-8000-000000000001',1,'Men Open');
insert into public.tournament_finalisations values('00000000-0000-4000-8000-000000000001',1,'current',now());
insert into public.draws values('00000000-0000-4000-8000-000000000001',1,'completed');
insert into public.players values(1,'Published Player','private@test.invalid',true),(2,'Unapproved Player','hidden@test.invalid',false);
insert into public.player_ranking_points values
 ('10000000-0000-4000-8000-000000000001',1,1,'00000000-0000-4000-8000-000000000001',null,'winner',1000,null),
 ('10000000-0000-4000-8000-000000000002',2,1,'00000000-0000-4000-8000-000000000001',null,'finalist',600,null);
set role anon;
do $$declare sheet jsonb;begin
 sheet:=public.get_event_points_sheet(1);
 if jsonb_array_length(sheet->'divisions'->0->'rows')<>1 or sheet->'divisions'->0->'rows'->0->>'points'<>'1000' then raise exception 'Only approved final public awards may appear'; end if;
 if sheet::text like '%@%' then raise exception 'Private contact information leaked'; end if;
 if public.get_event_points_sheet(999) is not null or public.get_event_points_sheet(-1) is not null then raise exception 'Unknown events must not produce a sheet'; end if;
 if has_table_privilege('anon','public.player_ranking_points','SELECT') then raise exception 'The public sheet must not expose the award ledger'; end if;
end $$;
reset role;
do $$declare field text;begin
 foreach field in array array['private','draft','unsanctioned','future','cancelled','unfinalised','unpublished'] loop
   update public.calendar set registration_access='public',sanction_status='approved',is_visible=true,sapa_status='Gold',event_status=null,end_date=current_date-1;
   update public.tournament_finalisations set fingerprint='current'; update public.draws set status='completed';
   case field
    when 'private' then update public.calendar set registration_access='code';
    when 'draft' then update public.calendar set is_visible=false;
    when 'unsanctioned' then update public.calendar set sapa_status='None';
    when 'future' then update public.calendar set end_date=current_date+2;
    when 'cancelled' then update public.calendar set event_status='cancelled';
    when 'unfinalised' then update public.tournament_finalisations set fingerprint='old';
    when 'unpublished' then update public.draws set status='draft';
   end case;
   if public.get_event_points_sheet(1) is not null then raise exception '% event must not expose a sheet',field; end if;
 end loop;
end $$;
update public.draws set status='completed';
insert into public.player_ranking_points values('10000000-0000-4000-8000-000000000003',1,1,'00000000-0000-4000-8000-000000000001',null,'reversal',-1000,'10000000-0000-4000-8000-000000000001');
do $$begin if public.get_event_points_sheet(1) is not null then raise exception 'Reversed awards must disappear'; end if;end $$;
\echo 'Event points sheet DB: completion, publication, finalisation, reversals, public names and private ledger access passed.'
