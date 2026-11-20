-- Tests run in the disposable Tournament Manager transaction.
reset role;
insert into public.calendar(id,event_name,start_date,end_date,is_manual)
values(313001,'Fixture Event-Year Cup','2035-09-10','2035-09-11',true);
insert into public.tournament_divisions(id,event_id,name)
values('eeeeeeee-0000-4000-8000-000000000001',313001,'Open');
insert into public.players(id,name,email,license_type) values
 (313001,'Annual player','valid-year@example.invalid','none'),
 (313002,'Profile label only','legacy-label@example.invalid','full'),
 (313003,'Current temporary','current-temp@example.invalid','none'),
 (313004,'Revoked temporary','revoked-temp@example.invalid','none');
insert into public.annual_licenses(player_id,season_year,valid_from) values
 (313001,2035,'2035-01-01'), (313002,2034,'2034-01-01');
insert into public.temporary_licenses(player_id,event_id,revoked_at) values
 (313003,313001,null), (313004,313001,'2035-02-15T00:00:00Z');
insert into public.event_registrations(id,event_id,division_id,division,full_name,email,payment_status)
values
 ('eeeeeeee-0000-4000-8000-000000000002',313001,'eeeeeeee-0000-4000-8000-000000000001','Open','Annual player','valid-year@example.invalid','paid'),
 ('eeeeeeee-0000-4000-8000-000000000003',313001,'eeeeeeee-0000-4000-8000-000000000001','Open','Profile label only','legacy-label@example.invalid','paid'),
 ('eeeeeeee-0000-4000-8000-000000000004',313001,'eeeeeeee-0000-4000-8000-000000000001','Open','Current temporary','current-temp@example.invalid','paid'),
 ('eeeeeeee-0000-4000-8000-000000000005',313001,'eeeeeeee-0000-4000-8000-000000000001','Open','Revoked temporary','revoked-temp@example.invalid','paid');
update auth.users set raw_user_meta_data='{"full_name":"Fixture Operator"}'
 where id='00000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
do $$
declare
    snapshot jsonb := public.tm_snapshot(313001);
    division_id uuid := 'eeeeeeee-0000-4000-8000-000000000001';
    event_year_player jsonb;
    prior_year_player jsonb;
    valid_temporary jsonb;
    revoked_temporary jsonb;
begin
    select row into event_year_player from jsonb_array_elements(snapshot->'players') row where row->>'id'='313001';
    select row into prior_year_player from jsonb_array_elements(snapshot->'players') row where row->>'id'='313002';
    select row into valid_temporary from jsonb_array_elements(snapshot->'players') row where row->>'id'='313003';
    select row into revoked_temporary from jsonb_array_elements(snapshot->'players') row where row->>'id'='313004';
    if event_year_player->>'license_type' is distinct from 'full'
      or (event_year_player#>>'{event_license,year}') is distinct from '2035'
      or prior_year_player->>'license_type' is distinct from 'none'
      or (valid_temporary#>>'{event_license,temporary}') is distinct from 'true'
      or (revoked_temporary#>>'{event_license,temporary}') is distinct from 'false'
      or revoked_temporary->'temporary_licenses' is distinct from '[]'::jsonb then
        raise exception 'Snapshot did not use the event-year and current temporary licences';
    end if;
    begin
        perform public.tm_confirm(313001,division_id,'players','{"excluded":[],"exceptions":{}}',0);
        raise exception 'A prior-year or revoked licence passed player confirmation';
    exception when raise_exception then
        if sqlerrm not like 'Licence check needs an exception%' then raise; end if;
    end;
    perform public.tm_confirm(313001,division_id,'players',
      '{"excluded":["eeeeeeee-0000-4000-8000-000000000003","eeeeeeee-0000-4000-8000-000000000005"]}',0);
    snapshot := public.tm_snapshot(313001);
    if (snapshot#>>'{confirmations,0,players_valid}') is distinct from 'true'
      or (snapshot#>>'{audit,0,actor_name}') is distinct from 'Fixture Operator' then
        raise exception 'Players confirmation or hosted audit name was lost';
    end if;
end
$$;
reset role;
update public.annual_licenses set revoked_at='2035-03-01T00:00:00Z' where player_id=313001 and season_year=2035;
set local role authenticated;
do $$
begin
    if (public.tm_snapshot(313001)#>>'{confirmations,0,players_valid}') is distinct from 'false' then
        raise exception 'Revoking the annual licence did not invalidate the reviewed roster';
    end if;
    begin
       perform public.tm_confirm(313001,'eeeeeeee-0000-4000-8000-000000000001','seeds','{"seeds":[]}',1);
       raise exception 'Seeding accepted the roster after its licence changed';
    exception when raise_exception then
       if sqlerrm not like 'Confirm the current players first%' then raise; end if;
    end;
end
$$;
reset role;
