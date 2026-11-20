-- The organiser's builder checks current organisation authority and confirms
-- that venue text cannot link a different club through the legacy trigger.
create function public.admin_organisation_host_builder(
  p_organisation_id uuid,
  p_event_id bigint default null,
  p_venues text[] default null,
  p_club_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  host record;
  event record;
  venue text;
  previous_club uuid;
  prior_venues text[] := array[]::text[];
  platform boolean;
begin
  platform := coalesce(public.is_super_admin(auth.email()), false);
  if auth.uid() is null or not coalesce(public.account_is_active(), false)
      or not (platform or exists (
        select 1 from public.organisation_members member
        where member.organisation_id = p_organisation_id
          and lower(btrim(member.user_email)) = lower(btrim(auth.email()))
          and member.role in ('owner', 'admin')
      )) then
    raise exception 'Current organisation owner or admin access is required' using errcode = '42501';
  end if;

  select id, name, status, contact_email, contact_phone, logo_url, website_url, federation_id into host
  from public.organisations where id = p_organisation_id and status = 'approved';
  if not found then raise exception 'Choose the approved organisation hosting this event'; end if;

  if p_event_id is not null then
    select c.id, c.club_id, c.venue, c.venues, c.is_manual, c.event_status into event
    from public.calendar c where c.id = p_event_id and c.organisation_id = p_organisation_id;
    if not found or event.is_manual is distinct from true or event.event_status = 'cancelled' then
      raise exception 'Choose one of this organisation’s editable 4M events';
    end if;
    previous_club := event.club_id;
    if p_venues is not null and p_club_id is distinct from previous_club then
      raise exception 'Contact a Calendar administrator to change the linked club';
    end if;
    prior_venues := coalesce(event.venues, array[event.venue]::text[]) || array[event.venue]::text[];
  elsif p_club_id is not null and not exists (
    select 1 from public.club_organisations where organisation_id = p_organisation_id and club_id = p_club_id
  ) then
    raise exception 'Choose a club linked to this organisation';
  end if;

  if cardinality(p_venues) > 25 then raise exception 'Choose up to 25 venues'; end if;
  foreach venue in array coalesce(p_venues, array[]::text[]) loop
    if venue is null or btrim(venue) = '' then continue; end if;
    if previous_club is not null and exists (select 1 from unnest(prior_venues) as previous(value) where lower(btrim(previous.value)) = lower(btrim(venue))) then continue; end if;
    if exists (
      select 1 from public.clubs c
      where (
        lower(btrim(venue)) in (lower(btrim(c.name)), lower(btrim(c.short_name)))
        or lower(btrim(venue)) like lower(btrim(c.name)) || ',%'
        or (nullif(btrim(c.short_name), '') is not null and lower(btrim(venue)) like lower(btrim(c.short_name)) || ',%')
      ) and (
        (p_event_id is not null and previous_club is null)
        or not exists (select 1 from public.club_organisations where organisation_id = p_organisation_id and club_id = c.id)
      )
    ) then
      raise exception 'This venue would link a different club. Review the existing club with a Calendar administrator';
    end if;
  end loop;

  return jsonb_build_object('organisation', to_jsonb(host), 'event_id', p_event_id, 'platform', platform,
    'clubs', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'address', c.address, 'city', c.city) order by c.name, c.id)
      from public.clubs c
      where c.status not in ('pending', 'rejected', 'in_review')
        and exists (select 1 from public.club_organisations where organisation_id = p_organisation_id and club_id = c.id)
    ), '[]'::jsonb));
end;
$$;

revoke all on function public.admin_organisation_host_builder(uuid, bigint, text[], uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_organisation_host_builder(uuid, bigint, text[], uuid) to authenticated;
