-- Remove an offering without deleting its season, entitlements or payments.
alter table public.license_seasons add column archived_at timestamptz;
alter table public.license_seasons add constraint archived_license_sales_closed
 check (archived_at is null or not sales_open);

-- Existing clients also stop listing removed years. Managers retain access to
-- the archived settings and the register still includes every historical year.
alter policy "Published license seasons" on public.license_seasons
 using (archived_at is null);
create policy "License managers read removed seasons" on public.license_seasons
 for select to authenticated using ((select public.can_manage_licenses()));

-- Extend the existing permission-checked, reason-required, audited endpoint.
do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.manage_license(text,jsonb)'::regprocedure) into definition;
 if position('if p_action=''save_season'' then' in definition)=0
 or position('if v_type=''full'' then' in definition)=0 then
  raise exception 'License management function changed; review archive integration';
 end if;
 definition:=replace(definition,'if p_action=''save_season'' then',
 $branch$if p_action in ('archive_season','restore_season') then
 select * into v_row from public.license_seasons where year=v_year for update;
 if not found then raise exception 'License year not found'; end if;
 p_input:=p_input || jsonb_build_object('previous',to_jsonb(v_row));
 update public.license_seasons set
  archived_at=case when p_action='archive_season' then coalesce(archived_at,now()) else null end,
  sales_open=false,updated_at=now() where year=v_year;
 elsif p_action='save_season' then
 if exists(select 1 from public.license_seasons where year=v_year and archived_at is not null) then
  raise exception 'Restore this year before changing its sales settings';
 end if;$branch$);
 -- Only new grants are blocked; restore/revoke and paid-checkout completion
 -- continue to preserve historical entitlements and financial records.
 definition:=replace(definition,
 $old$if v_type='full' then
 if exists(select 1 from public.annual_licenses$old$,
 $new$if v_type='full' then
 perform 1 from public.license_seasons where year=v_year and archived_at is null for share;
 if not found then raise exception 'This license year is no longer offered'; end if;
 if exists(select 1 from public.annual_licenses$new$);
 if position('This license year is no longer offered' in definition)=0 then
  raise exception 'Full license grant branch changed; review archive integration';
 end if;
 execute definition;
end $migration$;

comment on column public.license_seasons.archived_at is
 'Removed from new offerings. Existing coverage, renewals eligibility and payment history remain intact. Restoring does not reopen sales.';
notify pgrst, 'reload schema';
