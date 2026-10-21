-- Live verification with existing non-admin accounts. Only Storage metadata is
-- written, inside a transaction that is always rolled back; no files are touched.
begin;
do $test$
declare f record; caller record; victim record; n integer; expected integer;
begin
  for f in
    select p.oid, p.oid::regprocedure::text as name
    from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
    where ns.nspname='public' and p.proname in ('claim_push_deliveries','push_delivery_context')
  loop
    if has_function_privilege('anon',f.oid,'execute')
       or has_function_privilege('authenticated',f.oid,'execute')
       or not has_function_privilege('service_role',f.oid,'execute') then
      raise exception 'Worker privileges failed: %',f.name;
    end if;
  end loop;
  if has_function_privilege('anon','public.check_my_registration(bigint,text)','execute') then
    raise exception 'Anonymous registration access remains';
  end if;
  select u.id,u.email,r.event_id into caller
  from auth.users u join public.event_registrations r on lower(r.email)=lower(u.email)
  where u.deleted_at is null and r.status<>'withdrawn' and not public.is_super_admin(u.email)
  order by r.created_at desc limit 1;
  if caller.id is null then raise exception 'No registration fixture available'; end if;
  select count(*) into expected from public.event_registrations r
  where r.event_id=caller.event_id and lower(r.email)=lower(caller.email) and r.status<>'withdrawn';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',caller.id,'email',caller.email,'role','authenticated')::text,true);
  select r.event_id,r.email into victim from public.event_registrations r
  where lower(r.email)<>lower(caller.email)
    and lower(coalesce(r.partner_email,''))<>lower(caller.email)
    and lower(coalesce(r.registered_by,''))<>lower(caller.email)
    and r.status<>'withdrawn' and not public.can_manage_event(r.event_id) limit 1;
  if victim.email is null then raise exception 'No unrelated-registration fixture available'; end if;
  execute 'set local role authenticated';
  select count(*) into n from public.check_my_registration(caller.event_id,caller.email);
  if n<>expected or n=0 then raise exception 'Own registration read failed'; end if;
  select count(*) into n from public.check_my_registration(caller.event_id,'%');
  if n<>0 then raise exception 'Wildcard lookup allowed'; end if;
  select count(*) into n from public.check_my_registration(victim.event_id,victim.email);
  if n<>0 then raise exception 'Other-account lookup allowed'; end if;
  execute 'reset role';
end $test$;

do $test$
declare caller record; foreign_photo record; n integer; test_name text;
begin
  select u.id,u.email,p.id as player_id,o.name into caller
  from auth.users u join public.players p on lower(p.email)=lower(u.email)
  join storage.objects o on o.bucket_id='profile-pics'
    and split_part(o.name,'/',1)=p.id::text and o.owner_id=u.id::text
  where u.deleted_at is null and not public.is_super_admin(u.email) limit 1;
  if caller.id is null then raise exception 'No owned-photo fixture available'; end if;
  select name into foreign_photo from storage.objects
  where bucket_id='profile-pics' and split_part(name,'/',1)~'^[0-9]+$'
    and split_part(name,'/',1)<>caller.player_id::text limit 1;
  if foreign_photo.name is null then raise exception 'No other-photo fixture available'; end if;
  test_name=caller.player_id::text||'/rls-verification-'||gen_random_uuid()::text||'.jpg';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',caller.id,'email',caller.email,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  insert into storage.objects(bucket_id,name,owner,owner_id)
  values('profile-pics',test_name,caller.id,caller.id::text);
  update storage.objects set metadata=metadata where bucket_id='profile-pics' and name=caller.name;
  get diagnostics n=row_count;
  if n<>1 then raise exception 'Own-photo update failed'; end if;
  update storage.objects set metadata=metadata where bucket_id='profile-pics' and name=foreign_photo.name;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'Other-photo overwrite allowed'; end if;
  begin
    insert into storage.objects(bucket_id,name,owner,owner_id)
    values('profile-pics',split_part(foreign_photo.name,'/',1)||'/rls-verification-'||gen_random_uuid()::text||'.jpg',caller.id,caller.id::text);
    raise exception 'Other-player upload allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update storage.objects set name=split_part(foreign_photo.name,'/',1)||'/rls-verification-'||gen_random_uuid()::text||'.jpg'
    where bucket_id='profile-pics' and name=test_name;
    raise exception 'Cross-player rename allowed';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
end $test$;
select 'PASS: worker, registration and photo authorization checks' as verification;
rollback;
