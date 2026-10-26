-- Temporary fixtures only. Every mutation is rolled back, including Auth deletion.
begin;
do $$
declare
  account_id uuid=gen_random_uuid();
  address text='account-deletion-'||account_id::text||'@example.invalid';
  player_id bigint; partner_id bigint; event bigint; draw uuid;
  receipt uuid; registration uuid; partner_registration uuid; team uuid;
begin
  select id into event from public.calendar limit 1;
  select id into draw from public.draws limit 1;
  if event is null or draw is null then raise exception 'Missing fixture event/draw'; end if;
  insert into auth.users(id,email) values(account_id,address);
  insert into public.players(name,email,approved,contact_number,bio) values('Deletion fixture',address,false,'+270000000000','Private fixture biography') returning id into player_id;
  insert into public.players(name,email,approved) values('Unaffected partner','partner-'||account_id::text||'@example.invalid',false) returning id into partner_id;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',account_id,'role','authenticated','email',address)::text,true);
  if not public.account_is_active() then raise exception 'Existing account is incorrectly blocked'; end if;
  begin
    insert into storage.objects(bucket_id,name,owner) values('profile-pics',player_id::text||'/deletion-fixture.jpg',account_id);
    if jsonb_array_length(public.account_deletion_storage(account_id))<>1 then raise exception 'Storage ownership lookup failed'; end if;
    perform public.complete_account_deletion(account_id);
    raise exception 'Deletion bypassed photo-removal guard';
  exception when others then
    if sqlerrm<>'Profile photos must be removed first' then raise; end if;
    -- The fake Storage metadata insertion is rolled back by this subtransaction.
  end;
  insert into public.event_registrations(event_id,full_name,email,phone,partner_name,partner_email,is_test)
    values(event,'Deletion fixture',address,'+270000000000','Unaffected partner','partner-'||account_id::text||'@example.invalid',true) returning id into registration;
  insert into public.event_registrations(event_id,full_name,email,partner_name,partner_email,is_test)
    values(event,'Unaffected partner','another-'||account_id::text||'@example.invalid','Deletion fixture',address,true) returning id into partner_registration;
  insert into public.payments(player_id,amount,status,payment_type,reference,metadata,is_test)
    values(player_id,123.45,'paid','entry','fixture-'||account_id::text,jsonb_build_object('email',address,'nested',jsonb_build_array('Deletion fixture',true,42)),true) returning id into receipt;
  insert into public.draw_entries(draw_id,player_one_id,player_two_id,player_one_name,player_two_name,team_name,snapshot)
    values(draw,player_id,partner_id,'Deletion fixture','Unaffected partner','Deletion fixture / Unaffected partner',jsonb_build_object('registration_email',address)) returning id into team;
  insert into public.player_schedule_events(user_email,event_id) values(address,event);
  insert into public.event_notification_follows(email,event_id) values(address,event) on conflict do nothing;
  insert into public.player_devices(email,player_id,platform,fingerprint,device) values(address,player_id,'ios','fixture-'||account_id::text,'{}');
  insert into public.player_push_tokens(email,player_id,platform,token) values(address,player_id,'ios','ExponentPushToken[fixture-'||account_id::text||']');
  insert into public.following_activity(event_key,kind,local_player_ids,title,body,path)
    values('fixture-'||account_id::text,'profile',array[player_id],'Deletion fixture updated photos','','/players/'||player_id::text);
  if not public.complete_account_deletion(account_id) then raise exception 'Deletion failed'; end if;
  if exists(select from auth.users where id=account_id) or exists(select from public.players where id=player_id) then raise exception 'Identity remains'; end if;
  if public.account_is_active() then raise exception 'Old JWT still has an active account'; end if;
  if not exists(select from public.players where id=partner_id and name='Unaffected partner') then raise exception 'Partner changed'; end if;
  if not exists(select from public.event_registrations where id=registration and full_name='Deleted player' and phone is null and partner_name='Unaffected partner') then raise exception 'Entry anonymization failed'; end if;
  if not exists(select from public.event_registrations where id=partner_registration and full_name='Unaffected partner' and partner_name='Deleted player') then raise exception 'Partner entry anonymization failed'; end if;
  if not exists(select from public.payments p where p.id=receipt and amount=123.45 and p.player_id is null and metadata->>'email'='[deleted]' and metadata->'nested'='["[deleted]",true,42]'::jsonb) then raise exception 'Receipt retention failed'; end if;
  if not exists(select from public.draw_entries where id=team and player_one_id is null and player_two_id=partner_id and team_name='Deleted player / Unaffected partner' and snapshot->>'registration_email'='[deleted]') then raise exception 'Shared draw changed incorrectly'; end if;
  if exists(select from public.event_activity_log where details->>'registration_id' in (registration::text,partner_registration::text)
    and (details::text like '%'||address||'%' or details::text like '%Deletion fixture%')) then raise exception 'Audit snapshot still contains personal data'; end if;
  if exists(select from public.player_schedule_events where user_email=address) or exists(select from public.event_notification_follows where email=address)
    or exists(select from public.player_devices where email=address) or exists(select from public.player_push_tokens where email=address)
    or exists(select from public.following_activity where event_key='fixture-'||account_id::text) then raise exception 'Preferences/devices/activity remain'; end if;
  if has_function_privilege('authenticated','public.complete_account_deletion(uuid)','execute')
    or has_function_privilege('anon','public.account_deletion_storage(uuid)','execute') then raise exception 'Client may invoke privileged removal'; end if;
  set local role authenticated;
  if exists(select from public.players where id=partner_id) then raise exception 'Deleted user can still read through RLS'; end if;
  reset role;
end $$;
select 'Account deletion, anonymization, partner preservation, stale-session denial and service-only permissions passed; all fixtures rolled back.' as result;
rollback;
