-- Append renewal classification to the private projection. This is a paid
-- renewal at issuance, not simply today's renewal eligibility or a price guess.
do $$declare definition text;
begin
 select pg_get_viewdef('private.license_register'::regclass,true) into definition;
 execute 'create or replace view private.license_register as select r.*,
  (r.license_type=''full'' and r.source<>''complimentary'' and r.purchased_on is not null and exists(
   select 1 from public.annual_licenses previous where previous.player_id=r.player_id
   and previous.season_year<r.season_year and previous.created_at<=r.created_at
   and (previous.revoked_at is null or previous.revoked_at>r.created_at)
  )) as is_renewal,
  (select p.image_url from public.players p where p.id=r.player_id) as image_url
  from ('||rtrim(definition, E';\n ')||') r';
end $$;
revoke all on private.license_register from public,anon,authenticated;

do $$declare definition text;
begin
 select pg_get_functiondef('public.manage_license(text,jsonb)'::regprocedure) into definition;
 if position('''legacy'',count(*) filter(where source=''legacy'')' in definition)=0 then raise exception 'License register counts changed; review before applying'; end if;
 definition:=replace(definition,
  'or r.license_type=p_input->>''type'')',
  'or r.license_type=p_input->>''type'' or (p_input->>''type''=''renewal'' and r.is_renewal))');
 definition:=replace(definition,
  '''legacy'',count(*) filter(where source=''legacy'')',
  '''legacy'',count(*) filter(where source=''legacy''),
   ''active_full'',count(*) filter(where status=''active'' and license_type=''full''),
   ''active_temporary'',count(*) filter(where status=''active'' and license_type=''temporary''),
   ''active_renewals'',count(*) filter(where status=''active'' and is_renewal)');
 if position('''active_renewals''' in definition)=0 or position('r.is_renewal' in definition)=0 then raise exception 'License register breakdown replacement failed'; end if;
 definition:=replace(definition,'select p.id,p.name,p.email from public.players p','select p.id,p.name,p.email,p.image_url from public.players p');
 execute definition;
 select pg_get_functiondef('public.get_player_licenses(bigint)'::regprocedure) into definition;
 if position('''email'',p.email,' in definition)=0 then raise exception 'Player license header changed; review before applying'; end if;
 definition:=replace(definition,'''email'',p.email,','''email'',p.email,''image_url'',p.image_url,');
 execute definition;
end $$;
notify pgrst, 'reload schema';
