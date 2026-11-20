begin;

-- Preview derives a change list and token from the live event and its stored
-- amendment. Approval recalculates that plan under the same row locks.
create function private.admin_review_event_amendment(
  p_kind text, p_entity_id uuid, p_event_id bigint, p_expected text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  event_fields constant text[] := array[
    'event_name','slug','organiser_name','organiser_logo_url','organiser_badge_text','city','venue','venues','address',
    'start_date','end_date','start_time','end_time','sapa_status','tournament_tag','description','points','points_breakdown',
    'prize_money_total','prize_money_breakdown','balls','courts','tournament_director','referees','sanctioning_details',
    'rules_regs','withdrawal_substitution','cut_off_times','contact_details','organiser_phone','organiser_email',
    'organiser_website','custom_image_url','poster_image_url','poster_document_url','organiser_kit_url','media_gallery_urls',
    'sponsor_logos','registration_closes_at','registration_opens_at','early_bird_ends_at','early_bird_fee','event_dates',
    'golden_point','scoring_point','is_league','max_teams_capacity','partner_requirement','back_draw_options',
    'allow_temporary_license','license_required_default','collect_tshirt_size','allow_tshirt_logo_upload','allow_tshirt_sponsor_name',
    'player_gift_type','player_gift_types','entry_fee_notes','default_match_format','indoor_outdoor','courts_count'
  ];
  protected_fields constant text[] := array[
    'id','organisation_id','federation_id','club_id','event_co_admins','registration_access','registration_access_code_hash',
    'is_visible','is_featured','featured_event','featured_live','featured_result','show_in_recent_results','draw_released',
    'sanction_requested','sanction_status','federation_sanction_status','rejection_notes','event_status','series_id','is_weekly',
    'allow_payments','allow_payments_after_close','weekly_payment_policy','finance_managed','payment_method','payment_bank_name',
    'payment_account_name','payment_account_number','payment_branch_code','payment_reference_note','external_payment_url',
    'organiser_settlement_confirmation','organiser_interim_payments'
  ];
  metadata constant text[] := array[
    'pending_changes','pending_changes_status','pending_changes_notes','pending_changes_submitted_at'
  ];
  division_fields constant text[] := array[
    'name','entry_fee','format','entries_close_at','license_required','age_category','gender','suggested_level','entry_limit',
    'details','sort_order','is_active'
  ];
  platform boolean;
  event_record public.calendar;
  division_record public.tournament_divisions;
  original_event jsonb;
  original_division jsonb;
  proposed jsonb;
  payload jsonb;
  drafts jsonb;
  removals jsonb;
  entry jsonb;
  event_patch jsonb;
  review_event jsonb;
  division_patch jsonb;
  division_review jsonb := '[]'::jsonb;
  plan jsonb := '[]'::jsonb;
  reviewed text;
  fields text;
  sources text;
  division_id uuid;
  seen uuid[] := '{}';
  removal boolean;
begin
  if private.permission_actor_active() is distinct from true then
    raise exception 'Sign in to review this event amendment.' using errcode='42501';
  end if;
  platform := public.is_super_admin(auth.email()) is true;
  if p_kind is null or p_kind not in ('organisations','federations') or p_entity_id is null or p_event_id is null
    or (p_kind='organisations' and not platform) then
    raise exception 'Choose an event within your review authority.' using errcode='42501';
  end if;
  if not platform and not exists (
    select 1 from public.federation_members f
    where f.federation_id=p_entity_id and lower(trim(f.user_email))=lower(trim(auth.email()))
      and f.role in ('owner','admin') for share
  ) then
    raise exception 'Current federation owner or admin access is required.' using errcode='42501';
  end if;

  select c.* into event_record from public.calendar c where c.id=p_event_id
    and ((p_kind='organisations' and c.organisation_id=p_entity_id)
      or (p_kind='federations' and (c.federation_id=p_entity_id or c.federation_id is null)))
    for update;
  if not found
    or (p_kind='federations' and event_record.federation_id is null and not exists (
      select 1 from public.organisations o where o.id=event_record.organisation_id and o.federation_id=p_entity_id for share
    )) then
    raise exception 'Choose an event within your review authority.' using errcode='42501';
  end if;
  -- The current Calendar and Division RLS both need event-edit authority. The
  -- federation membership alone must not broaden the existing ability to edit.
  if not platform and (
    private.edit_event(p_event_id) is distinct from true
    or (public.can_manage_calendar_event(event_record.organisation_id,event_record.club_id) is distinct from true
      and not exists (select 1 from public.admin_sidebar_permissions a where lower(a.email)=lower(auth.email()) for share))
  ) then
    raise exception 'Calendar and division edit access is required for this event.' using errcode='42501';
  end if;
  if event_record.pending_changes_status is distinct from 'pending' then
    raise exception 'This amendment is no longer pending. Refresh decisions.';
  end if;

  payload := event_record.pending_changes->'payload';
  drafts := coalesce(nullif(event_record.pending_changes->'divisions','null'::jsonb),'[]'::jsonb);
  removals := coalesce(nullif(event_record.pending_changes->'removed_division_ids','null'::jsonb),'[]'::jsonb);
  if jsonb_typeof(payload) is distinct from 'object' or jsonb_typeof(drafts) <> 'array' or jsonb_typeof(removals) <> 'array' then
    raise exception 'This amendment has invalid event or division changes.';
  end if;
  original_event := to_jsonb(event_record);
  if exists (
    select 1 from jsonb_each(payload) p where p.key=any(protected_fields)
      and p.value is distinct from coalesce(original_event->p.key,'null'::jsonb)
  ) then
    raise exception 'This draft changes event ownership, access, payment or publication controls.';
  end if;
  select coalesce(jsonb_object_agg(p.key,p.value),'{}') into event_patch
    from jsonb_each(payload) p where p.key=any(event_fields);
  proposed := to_jsonb(jsonb_populate_record(event_record,event_patch));
  select coalesce(jsonb_object_agg(p.key,proposed->p.key),'{}'),
    coalesce(jsonb_object_agg(p.key,jsonb_build_object('from',original_event->p.key,'to',proposed->p.key)),'{}')
    into event_patch,review_event
    from jsonb_each(event_patch) p where original_event->p.key is distinct from proposed->p.key;

  -- Taking the event and existing division rows FOR UPDATE also serializes
  -- referencing foreign-key writes for the duration of approval.
  perform 1 from public.tournament_divisions d where d.event_id=p_event_id order by d.id for update;
  for entry,removal in
    select item,true from jsonb_array_elements(removals) item
    union all
    select item,false from jsonb_array_elements(drafts) item
  loop
    if (removal and jsonb_typeof(entry) <> 'string') or (not removal and jsonb_typeof(entry) <> 'object') then
      raise exception 'This amendment contains an invalid division.';
    end if;
    division_id := case when removal then (entry #>> '{}')::uuid else nullif(entry->>'id','')::uuid end;
    if division_id=any(seen) or (not removal and entry ? 'event_id' and entry->>'event_id' is distinct from p_event_id::text) then
      raise exception 'This amendment repeats a division or changes its event.';
    end if;
    original_division := '{}'::jsonb;
    if division_id is not null then
      select d.* into division_record from public.tournament_divisions d
        where d.id=division_id and d.event_id=p_event_id;
      if not found then raise exception 'A drafted division is outside this event or was removed.'; end if;
      seen := array_append(seen,division_id);
      original_division := to_jsonb(division_record);
    end if;
    if removal then
      if exists (select 1 from public.event_registrations where event_registrations.division_id=division_record.id)
         or exists (select 1 from public.ranking_history where ranking_history.division_id=division_record.id)
         or exists (select 1 from public.tournament_draws where tournament_draws.division_id=division_record.id)
         or exists (select 1 from public.tournament_matches where tournament_matches.division_id=division_record.id)
         or exists (select 1 from public.tournament_confirmations where tournament_confirmations.division_id=division_record.id)
         or exists (select 1 from public.tournament_finalisations where tournament_finalisations.division_id=division_record.id)
         or exists (select 1 from public.draw_player_reviews where draw_player_reviews.division_id=division_record.id)
         or exists (select 1 from public.player_ranking_points where player_ranking_points.division_id=division_record.id)
         or exists (select 1 from public.draws where draws.division_id=division_record.id)
         or exists (select 1 from public.native_draw_announcements where native_draw_announcements.division_id=division_record.id)
         or exists (select 1 from private.event_checkout_holds where event_checkout_holds.division_id=division_record.id) then
        raise exception 'A division in this amendment has entries, payments or competition history.';
      end if;
      plan := plan || jsonb_build_object('action','remove','id',division_id,'name',division_record.name,'before',original_division);
    else
      -- Ownership, rankings, draws and cancellation are separate actions.
      if exists (
        select 1 from jsonb_each(entry) p
        where p.key not in ('id','event_id') and p.key=any(array[
          'ranking_tier_id','ranking_category','seeding_ranking_source','rankedin_class_id','cancelled_at','cancelled_by',
          'cancellation_reason','cancellation_refund_status','draw_type','has_plate'
        ]) and p.value is distinct from coalesce(original_division->p.key,'null'::jsonb)
      ) then
        raise exception 'This draft changes protected competition or cancellation fields.';
      end if;
      select coalesce(jsonb_object_agg(p.key,p.value),'{}') into division_patch
        from jsonb_each(entry) p where p.key=any(division_fields);
      proposed := to_jsonb(jsonb_populate_record(null::public.tournament_divisions,division_patch));
      select coalesce(jsonb_object_agg(p.key,proposed->p.key),'{}'),
        coalesce(jsonb_object_agg(p.key,jsonb_build_object('from',original_division->p.key,'to',proposed->p.key)),'{}')
        into division_patch,division_review
        from jsonb_each(division_patch) p
        where division_id is null or original_division->p.key is distinct from proposed->p.key;
      if division_id is null and nullif(trim(division_patch->>'name'),'') is null then
        raise exception 'New divisions need a name.';
      end if;
      if division_patch <> '{}'::jsonb then
        plan := plan || jsonb_build_object('action',case when division_id is null then 'add' else 'update' end,
          'id',division_id,'name',coalesce(original_division->>'name',division_patch->>'name'),
          'before',original_division,'patch',division_patch,'changes',division_review);
      end if;
    end if;
  end loop;
  if plan='[]'::jsonb and event_patch='{}'::jsonb then
    raise exception 'This draft has no changes that can be applied.';
  end if;

  reviewed := encode(sha256(convert_to(jsonb_build_array(auth.uid(),p_kind,p_entity_id,p_event_id,
    event_record.pending_changes,event_record.pending_changes_submitted_at,event_record.pending_changes_notes,
    event_record.organisation_id,event_record.federation_id,event_record.club_id,review_event,plan)::text,'UTF8')),'hex');
  if p_expected is null then
    return jsonb_build_object('event_id',p_event_id,'token',reviewed,'fields',review_event,'divisions',
      (select coalesce(jsonb_agg(ch.element - array['before','patch'] order by ch.ordinality),'[]')
       from jsonb_array_elements(plan) with ordinality ch(element,ordinality)));
  end if;
  if p_expected is distinct from reviewed then raise exception 'The reviewed amendment changed. Refresh before approving.'; end if;

  for entry in select jsonb_array_elements(plan) loop
    division_id := (entry->>'id')::uuid;
    if entry->>'action'='remove' then
      delete from public.tournament_divisions d where d.id=division_id and d.event_id=p_event_id;
    else
      -- Identifiers come only from the allow-listed patch. Values are bound.
      select string_agg(format('%I',key),',' order by key),string_agg(format('n.%I',key),',' order by key)
        into fields,sources from jsonb_object_keys(entry->'patch') key;
      if division_id is null then
        execute format('insert into public.tournament_divisions (event_id,%s) select $2,%s
          from jsonb_populate_record(null::public.tournament_divisions,$1) n',fields,sources)
          using entry->'patch',p_event_id;
      else
        execute format('update public.tournament_divisions d set (%s)=(select %s
          from jsonb_populate_record(d,$1) n) where d.id=$2 and d.event_id=$3',fields,sources)
          using entry->'patch',division_id,p_event_id;
      end if;
    end if;
  end loop;
  select string_agg(format('%I',key),',' order by key),string_agg(format('n.%I',key),',' order by key)
    into fields,sources from jsonb_object_keys(event_patch) key;
  if fields is null then
    update public.calendar c set pending_changes=null,pending_changes_status=null,pending_changes_notes=null,
      pending_changes_submitted_at=null where c.id=p_event_id returning c.* into event_record;
  else
    execute format('update public.calendar c set (%s)=(select %s from jsonb_populate_record(c,$1) n),
      pending_changes=null,pending_changes_status=null,pending_changes_notes=null,pending_changes_submitted_at=null
      where c.id=$2 returning c.*',fields,sources) into event_record using event_patch,p_event_id;
  end if;
  -- Existing Calendar triggers can infer a club or change sanction fields. Roll
  -- back the entire operation if any unreviewed value moved.
  if (to_jsonb(event_record) - metadata) is distinct from ((original_event || event_patch) - metadata)
    or event_record.pending_changes is not null or event_record.pending_changes_status is not null
    or event_record.pending_changes_notes is not null or event_record.pending_changes_submitted_at is not null then
    raise exception 'Approval also changes unreviewed event controls. Review the event directly.';
  end if;
  return jsonb_build_object('event_id',p_event_id,'status','approved');
end;
$$;

revoke all on function private.admin_review_event_amendment(text,uuid,bigint,text) from public,anon,authenticated,service_role;
grant execute on function private.admin_review_event_amendment(text,uuid,bigint,text) to authenticated;

create function public.admin_review_event_amendment(p_kind text,p_entity_id uuid,p_event_id bigint,p_expected text default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.admin_review_event_amendment(p_kind,p_entity_id,p_event_id,p_expected);
$$;
revoke all on function public.admin_review_event_amendment(text,uuid,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.admin_review_event_amendment(text,uuid,bigint,text) to authenticated;

notify pgrst,'reload schema';
commit;
