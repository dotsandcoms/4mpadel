-- DRAFT ONLY: not eligible for hosted deployment. Checkout compatibility,
-- delivery resolution and final access revokes remain unfinished.
-- Client reads must never turn a partner search into a private-email directory.
-- Keep the original table result types for PostgREST filters/relationships.
begin;

-- Requires the compatible payment/registration integrity migration first.
create function private.contact_reference(p_email text,p_event bigint default null) returns text
language plpgsql stable security definer set search_path='' as $$
declare address text:=lower(trim(p_email)); player bigint; entry uuid;
begin
  if nullif(address,'') is null then return null; end if;
  if address=lower(auth.email()) then return address; end if;
  if address~'^(player\+[1-9][0-9]*|entry\+[a-f0-9-]{36})@contact\.4mpadel\.invalid$' then return address; end if;
  select p.id into player from public.players p where lower(trim(p.email))=address order by p.id limit 1;
  if player is not null then return 'player+'||player||'@contact.4mpadel.invalid'; end if;
  select r.id into entry from public.event_registrations r
    where r.event_id=p_event and lower(trim(r.email))=address and r.status is distinct from 'withdrawn'
    order by r.created_at,r.id limit 1;
  if entry is not null then return 'entry+'||entry||'@contact.4mpadel.invalid'; end if;
  return null;
end $$;

create function private.resolve_contact(p_reference text,p_event bigint default null) returns text
language plpgsql stable security definer set search_path='' as $$
declare reference text:=lower(trim(p_reference)); address text;
begin
  if nullif(reference,'') is null then return null; end if;
  if reference~'^player\+[1-9][0-9]{0,17}@contact\.4mpadel\.invalid$' then
    select lower(trim(p.email)) into address from public.players p
      where p.id=substring(split_part(reference,'@',1) from 8)::bigint;
  elsif reference~'^entry\+[a-f0-9-]{36}@contact\.4mpadel\.invalid$' then
    select lower(trim(r.email)) into address from public.event_registrations r
      where r.id=substring(split_part(reference,'@',1) from 7)::uuid
        and (p_event is null or r.event_id=p_event) and r.status is distinct from 'withdrawn';
  elsif reference like '%@contact.4mpadel.invalid' then
    raise exception 'Choose a valid player.' using errcode='22023';
  else return reference;
  end if;
  if address is null then raise exception 'This player is no longer available.' using errcode='22023'; end if;
  return address;
end $$;

-- The resolver is an internal delivery mechanism, never a client lookup API.
create function private.resolve_contact_json(p_value jsonb,p_event bigint default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare item record; output jsonb;
begin
  if jsonb_typeof(p_value)='array' then
    select coalesce(jsonb_agg(private.resolve_contact_json(v,p_event)),'[]') into output from jsonb_array_elements(p_value) v;
    return output;
  elsif jsonb_typeof(p_value)='object' then
    output:='{}';
    for item in select * from jsonb_each(p_value) loop
      if item.key in('email','partner_email','registered_by','registrant_email','recipientEmail','partnerEmail') and jsonb_typeof(item.value)='string' then
        output:=output||jsonb_build_object(item.key,private.resolve_contact(item.value#>>'{}',coalesce(nullif(p_value->>'event_id','')::bigint,p_event)));
      else output:=output||jsonb_build_object(item.key,private.resolve_contact_json(item.value,p_event)); end if;
    end loop;
    return output;
  end if;
  return p_value;
end $$;

create function private.mask_contact_json(p_value jsonb,p_event bigint default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare item record; output jsonb;
begin
  if jsonb_typeof(p_value)='array' then
    select coalesce(jsonb_agg(private.mask_contact_json(v,p_event)),'[]') into output from jsonb_array_elements(p_value) v;
    return output;
  elsif jsonb_typeof(p_value)='object' then
    output:='{}';
    for item in select * from jsonb_each(p_value) loop
      if item.key in('email','partner_email','registered_by','registrant_email','recipientEmail','partnerEmail') and jsonb_typeof(item.value)='string' then
        output:=output||jsonb_build_object(item.key,private.contact_reference(item.value#>>'{}',p_event));
      elsif item.key in('phone','contact_number','id_number','date_of_birth','playtomic_proof_path','pay_token') then
        output:=output||jsonb_build_object(item.key,null);
      else output:=output||jsonb_build_object(item.key,private.mask_contact_json(item.value,p_event)); end if;
    end loop;
    return output;
  end if;
  return p_value;
end $$;

create function private.client_record(p_entity text,p_row jsonb,p_privileged boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare output jsonb; event bigint:=nullif(p_row->>'event_id','')::bigint;
begin
  if coalesce(p_privileged,false) then return p_row; end if;
  if p_entity='calendar' then
    return p_row||jsonb_build_object('event_co_admins',null,'organiser_interim_payments',null,
      'organiser_settlement_confirmation',null,'pending_changes',null,'pending_changes_notes',null,'rejection_notes',null);
  end if;
  output:=private.mask_contact_json(p_row,event);
  if p_entity='event_registrations' and lower(trim(p_row->>'email'))=lower(auth.email()) then
    output:=output||jsonb_build_object('phone',p_row->'phone','pay_token',p_row->'pay_token');
  end if;
  return output;
end $$;

create function private.api_event_ids() returns bigint[]
language sql stable security definer set search_path='' as $$
  select coalesce(array_agg(c.id),'{}') from public.calendar c where private.finance_event(c.id)
$$;

create function private.event_visible(p_event bigint) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.calendar c where c.id=p_event and (
    (coalesce(c.is_visible,true) and coalesce(c.sanction_status,'approved')='approved')
    or (private.permission_actor_active() and (private.edit_event(c.id) or private.finance_event(c.id)
      or exists(select 1 from public.event_registrations r where r.event_id=c.id and r.status is distinct from 'withdrawn'
        and (lower(trim(r.email))=lower(auth.email()) or lower(trim(r.partner_email))=lower(auth.email())))
      or exists(select 1 from public.tournament_participants t where t.event_id=c.id and lower(trim(t.email))=lower(auth.email()))))
  ))
$$;

create function public.read_my_registration_rows() returns setof public.event_registrations
language plpgsql stable security definer set search_path='' as $$
declare address text:=lower(auth.email()); events bigint[];
begin
  if not private.permission_actor_active() then raise exception 'Sign in again to view your entries.' using errcode='42501'; end if;
  events:=private.api_event_ids();
  return query select (jsonb_populate_record(null::public.event_registrations,
    private.client_record('event_registrations',to_jsonb(r),r.event_id=any(events)))).*
  from public.event_registrations r where r.event_id=any(events) or
    lower(trim(r.email))=address or lower(trim(r.partner_email))=address or lower(trim(r.registered_by))=address;
end $$;

create function public.read_my_payment_rows() returns setof public.payments
language plpgsql stable security definer set search_path='' as $$
declare address text:=lower(auth.email()); events bigint[]; actor_player bigint; global_finance boolean;
begin
  if not private.permission_actor_active() then raise exception 'Sign in again to view your payments.' using errcode='42501'; end if;
  events:=private.api_event_ids();
  select id into actor_player from public.players where lower(email)=address order by id limit 1;
  global_finance:=coalesce(private.finance_event(null),false);
  return query select (jsonb_populate_record(null::public.payments,
    private.client_record('payments',to_jsonb(p),p.event_id=any(events) or (p.event_id is null and global_finance)))).*
  from public.payments p where p.event_id=any(events) or (p.event_id is null and global_finance)
    or p.player_id=actor_player or lower(trim(p.metadata->>'email'))=address
    or lower(trim(p.metadata->>'registrant_email'))=address;
end $$;

create function public.read_calendar_rows() returns setof public.calendar
language sql stable security definer set search_path='' as $$
  select (jsonb_populate_record(null::public.calendar,
    private.client_record('calendar',to_jsonb(c),private.edit_event(c.id) or private.finance_event(c.id)))).*
  from public.calendar c where private.event_visible(c.id)
$$;

revoke all on function public.read_my_registration_rows(),public.read_my_payment_rows(),public.read_calendar_rows() from public,anon,authenticated,service_role;
grant execute on function public.read_my_registration_rows(),public.read_my_payment_rows() to authenticated,service_role;
grant execute on function public.read_calendar_rows() to anon,authenticated,service_role;

-- Only this allowlisted filter language reaches dynamic SQL. Identifiers are
-- checked against the actual entity and quoted; values are always SQL literals.
create function private.api_filter_term(p_entity text,p_column text,p_operator text,p_value jsonb) returns text
language plpgsql stable security definer set search_path='' as $$
declare parts text[]; expression text; operation text; literal text; element jsonb; choices text:='';
begin
  if p_entity not in('calendar','event_registrations','payments')
    or p_column !~ '^[A-Za-z_][A-Za-z0-9_]*(->>?[A-Za-z_][A-Za-z0-9_]*)*$' then
    raise exception 'Invalid record filter.' using errcode='22023';
  end if;
  parts:=string_to_array(replace(p_column,'->>','->'),'->');
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid=('public.'||p_entity)::regclass
    and attnum>0 and not attisdropped and attname=parts[1]) then
    raise exception 'Unknown record filter.' using errcode='22023';
  end if;
  expression:=case when cardinality(parts)=1 then format('target.%I',parts[1])
    else format('(to_jsonb(target)#>>%L)',parts) end;
  if p_operator='in' then
    if jsonb_typeof(p_value)<>'array' or jsonb_array_length(p_value)>1000 then raise exception 'Invalid record list.'; end if;
    if jsonb_array_length(p_value)=0 then return 'false'; end if;
    for element in select value from jsonb_array_elements(p_value) loop
      choices:=choices||case when choices='' then '' else ',' end||format('%L',case when p_column in('email','partner_email','registered_by') then private.resolve_contact(element#>>'{}') else element#>>'{}' end);
    end loop;
    return expression||' in ('||choices||')';
  end if;
  if p_operator='is' then
    if p_value='null'::jsonb then return expression||' is null';
    elsif p_value in('true'::jsonb,'false'::jsonb) then return expression||' is '||(p_value#>>'{}');
    else raise exception 'Invalid null/boolean filter.'; end if;
  end if;
  operation:=case p_operator when 'eq' then '=' when 'neq' then '<>' when 'lt' then '<' when 'lte' then '<='
    when 'gt' then '>' when 'gte' then '>=' when 'like' then 'like' when 'ilike' then 'ilike'
    when 'contains' then '@>' when 'cs' then '@>' when 'containedBy' then '<@' when 'cd' then '<@' else null end;
  if operation is null then raise exception 'Unsupported record filter.' using errcode='22023'; end if;
  literal:=case when operation in('@>','<@') then format('%L::jsonb',p_value::text)
    else format('%L',case when p_column in('email','partner_email','registered_by') then private.resolve_contact(p_value#>>'{}') else p_value#>>'{}' end) end;
  return '('||expression||' '||operation||' '||literal||')';
end $$;

create function private.api_filters(p_entity text,p_filters jsonb) returns text
language plpgsql stable security definer set search_path='' as $$
declare step jsonb; pair record; part text; column_name text; op text; value text;
  term text; disjunction text; result text:='true';
begin
  if jsonb_typeof(p_filters) is distinct from 'array' or jsonb_array_length(p_filters)>32 then raise exception 'Invalid filters.'; end if;
  for step in select filter_item.value from jsonb_array_elements(p_filters) filter_item loop
    if step->>'method'='match' then
      if jsonb_typeof(step->'args'->0)<>'object' then raise exception 'Invalid match filter.'; end if;
      for pair in select * from jsonb_each(step->'args'->0) loop
        result:=result||' and '||private.api_filter_term(p_entity,pair.key,'eq',pair.value);
      end loop;
    elsif step->>'method'='or' then
      if length(step->'args'->>0)>10000 then raise exception 'Filter too large.'; end if;
      disjunction:='';
      foreach part in array string_to_array(step->'args'->>0,',') loop
        column_name:=split_part(part,'.',1);op:=split_part(part,'.',2);
        value:=substring(part from length(column_name)+length(op)+3);
        term:=private.api_filter_term(p_entity,column_name,op,to_jsonb(value));
        disjunction:=disjunction||case when disjunction='' then '' else ' or ' end||term;
      end loop;
      if disjunction='' then raise exception 'Empty OR filter.'; end if;
      result:=result||' and ('||disjunction||')';
    elsif step->>'method' in('filter','not') then
      term:=private.api_filter_term(p_entity,step->'args'->>0,step->'args'->>1,step->'args'->2);
      result:=result||' and '||case when step->>'method'='not' then 'not ('||term||')' else term end;
    else
      result:=result||' and '||private.api_filter_term(p_entity,step->'args'->>0,step->>'method',step->'args'->1);
    end if;
  end loop;
  return result;
end $$;

create function private.api_can_write(p_entity text,p_row jsonb,p_action text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare address text:=lower(auth.email()); event bigint:=nullif(p_row->>'event_id','')::bigint; mine bigint;
begin
  if not private.permission_actor_active() then return false; end if;
  if p_entity='calendar' then
    event:=nullif(p_row->>'id','')::bigint;
    return private.edit_event(event) or private.admin_module('calendar') or
      (p_action='insert' and public.can_manage_calendar_event(nullif(p_row->>'organisation_id','')::uuid,nullif(p_row->>'club_id','')::uuid));
  end if;
  if coalesce(private.finance_event(event),false) then return true; end if;
  if p_entity='event_registrations' then
    return (p_action<>'delete' or coalesce(p_row->>'payment_status','pending')<>'paid')
      and (lower(trim(p_row->>'email'))=address or lower(trim(p_row->>'registered_by'))=address
        or (p_action='update' and lower(trim(p_row->>'partner_email'))=address));
  elsif p_entity='payments' then
    if p_action='delete' then return false; end if;
    select id into mine from public.players where lower(trim(email))=address order by id limit 1;
    return coalesce((p_row->>'player_id')::bigint=mine,false)
      or lower(trim(p_row->'metadata'->>'email'))=address
      or lower(trim(p_row->'metadata'->>'registrant_email'))=address;
  end if;
  return false;
end $$;

create function public.mutate_player_records(p_entity text,p_action text,p_values jsonb default null,
  p_filters jsonb default '[]',p_options jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare input jsonb; item jsonb; prior jsonb; changed jsonb; output jsonb:='[]';
  columns text; values_sql text; assignment text; predicate text; conflict text; matches jsonb;
  key text; event bigint; privileged boolean; fields text[]; n int:=0;
begin
  if not private.permission_actor_active() then raise exception 'Sign in again before saving.' using errcode='42501'; end if;
  if p_entity not in('calendar','event_registrations','payments') or p_action not in('insert','upsert','update','delete') then
    raise exception 'Unsupported record operation.' using errcode='22023';
  end if;
  if octet_length(coalesce(p_values,'null')::text)>2000000 then raise exception 'Save fewer records at once.'; end if;
  predicate:=private.api_filters(p_entity,p_filters);
  if p_action in('update','delete') then
    if jsonb_array_length(p_filters)=0 then raise exception 'Choose records before changing them.'; end if;
    execute format('select coalesce(jsonb_agg(to_jsonb(target)),''[]''::jsonb) from (select target.* from public.%I target where %s and private.api_can_write(%L,to_jsonb(target),%L) order by target.id limit 1001 for update) target',
      p_entity,predicate,p_entity,p_action) into matches;
    if jsonb_array_length(matches)>1000 then raise exception 'Change at most 1,000 records at once.'; end if;
  else
    matches:=case when jsonb_typeof(p_values)='array' then p_values else jsonb_build_array(p_values) end;
    if jsonb_array_length(matches) not between 1 and 1000 then raise exception 'Choose between 1 and 1,000 records.'; end if;
  end if;
  for item in select value from jsonb_array_elements(matches) loop
    prior:=case when p_action in('update','delete') then item else null end;
    if p_action='delete' then
      execute format('delete from public.%I where id=(jsonb_populate_record(null::public.%I,$1)).id returning to_jsonb(%I.*)',p_entity,p_entity,p_entity)
        into changed using prior;
    else
      input:=case when p_action='update' then p_values else item end;
      if jsonb_typeof(input) is distinct from 'object' or input='{}' then raise exception 'Choose valid record values.'; end if;
      event:=coalesce(nullif(input->>'event_id','')::bigint,nullif(prior->>'event_id','')::bigint);
      input:=private.resolve_contact_json(input,event);
      if p_entity='event_registrations' and p_action in('insert','upsert') and not input?'registered_by' then
        input:=input||jsonb_build_object('registered_by',lower(auth.email()));
      end if;
      if p_action='upsert' then
        conflict:=coalesce(p_options->>'onConflict',case when p_entity='calendar' then 'id' else 'id' end);
        if (p_entity='event_registrations' and conflict not in('id','event_id,email,division'))
          or (p_entity='payments' and conflict not in('id','reference'))
          or (p_entity='calendar' and conflict<>'id') then raise exception 'Unsupported record conflict key.'; end if;
        fields:=string_to_array(conflict,',');predicate:='true';
        foreach key in array fields loop
          if not input?key or input->key='null' then predicate:='false';exit; end if;
          predicate:=predicate||' and '||private.api_filter_term(p_entity,key,'eq',input->key);
        end loop;
        perform pg_advisory_xact_lock(hashtextextended(p_entity||'|'||predicate,3082));
        execute format('select to_jsonb(target) from public.%I target where %s for update',p_entity,predicate) into prior;
        if prior is not null and not coalesce(private.api_can_write(p_entity,prior,'update'),false) then
          raise exception 'You cannot change this record.' using errcode='42501';
        end if;
        if prior is not null and coalesce((p_options->>'ignoreDuplicates')::boolean,false) then continue; end if;
      end if;
      if not coalesce(private.api_can_write(p_entity,coalesce(prior,'{}')||input,
        case when prior is null then 'insert' else 'update' end),false) then
        raise exception 'You cannot save this record.' using errcode='42501';
      end if;
      columns:='';values_sql:='';assignment:='';
      for key in select jsonb_object_keys(input) loop
        if not exists(select 1 from pg_catalog.pg_attribute where attrelid=('public.'||p_entity)::regclass
          and attname=key and attnum>0 and not attisdropped and attgenerated='') then raise exception 'Unknown record field.'; end if;
        columns:=columns||case when columns='' then '' else ',' end||format('%I',key);
        values_sql:=values_sql||case when values_sql='' then '' else ',' end||format('value.%I',key);
        if key<>'id' then assignment:=assignment||case when assignment='' then '' else ',' end||format('%I=value.%I',key,key); end if;
      end loop;
      if prior is not null then
        if p_entity='event_registrations' and not coalesce(private.finance_event(event),false) then
          -- A masked contact/token is not a request to erase the private value.
          if lower(trim(prior->>'email'))<>lower(auth.email()) then input:=input-'phone'-'pay_token'; end if;
          if input->'registered_by'='null'::jsonb and prior->'registered_by'<>'null'::jsonb then input:=input-'registered_by'; end if;
          columns:='';values_sql:='';assignment:='';
          for key in select jsonb_object_keys(input) loop
            if key<>'id' then assignment:=assignment||case when assignment='' then '' else ',' end||format('%I=value.%I',key,key); end if;
          end loop;
        end if;
        if input?'id' and input->>'id' is distinct from prior->>'id' then raise exception 'Record identity cannot change.'; end if;
        if assignment='' then changed:=prior;
        else execute format('update public.%I target set %s from jsonb_populate_record(null::public.%I,$1) value where target.id=(jsonb_populate_record(null::public.%I,$2)).id returning to_jsonb(target)',
          p_entity,assignment,p_entity,p_entity) into changed using input,prior; end if;
      else
        execute format('insert into public.%I(%s) select %s from jsonb_populate_record(null::public.%I,$1) value returning to_jsonb(%I.*)',
          p_entity,columns,values_sql,p_entity,p_entity) into changed using input;
      end if;
    end if;
    event:=case when p_entity='calendar' then (changed->>'id')::bigint else (changed->>'event_id')::bigint end;
    privileged:=case when p_entity='calendar' then private.edit_event(event) or private.finance_event(event) else private.finance_event(event) end;
    output:=output||jsonb_build_array(private.client_record(p_entity,changed,privileged));
    n:=n+1;
  end loop;
  return output;
exception when integrity_constraint_violation then
  raise exception 'These details conflict with an existing record. Refresh and try again.' using errcode='23505';
end $$;

revoke all on function public.mutate_player_records(text,text,jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.mutate_player_records(text,text,jsonb,jsonb,jsonb) to authenticated;

-- All helper bodies stay private. The checked public entry points run as their
-- narrowly reviewed owner; clients cannot call delivery resolvers directly.
revoke all on function private.finance_event(bigint),private.contact_reference(text,bigint),
  private.resolve_contact(text,bigint),private.resolve_contact_json(jsonb,bigint),private.mask_contact_json(jsonb,bigint),
  private.client_record(text,jsonb,boolean),private.api_event_ids(),private.event_visible(bigint),
  private.api_filter_term(text,text,text,jsonb),private.api_filters(text,jsonb),private.api_can_write(text,jsonb,text)
  from public,anon,authenticated,service_role;

-- Resolve opaque contact references through the existing strong financial
-- guards. Never replace quote validation or payment-integrity triggers here.
create or replace function private.canonical_checkout_contacts(p_value jsonb,p_event bigint) returns jsonb
language sql stable security definer set search_path='' as $$select private.resolve_contact_json(p_value,p_event)$$;
create or replace function private.canonical_entry_contact(p_value text,p_event bigint) returns text
language sql stable security definer set search_path='' as $$select private.resolve_contact(p_value,p_event)$$;
revoke all on function private.canonical_checkout_contacts(jsonb,bigint),private.canonical_entry_contact(text,bigint) from public,anon,authenticated,service_role;
grant execute on function private.finance_event(bigint) to authenticated;

-- Lookup results are useful player references, never a private-email directory.
create or replace function public.find_registration_partner(p_email text default null,p_name text default null,p_name_partial text default null,p_event_id bigint default null,p_exclude_id bigint default null,p_ids bigint[] default null,p_search text default null)
returns table(id bigint,name text,email text,paid_registration boolean,license_type text,category text,image_url text,level text,has_temp_license_for_event boolean)
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.permission_actor_active() or (p_event_id is not null and not private.event_visible(p_event_id)) then
    raise exception 'Sign in to choose a player for this event.' using errcode='42501';
  end if;
  return query select p.id,p.name,private.contact_reference(p.email,p_event_id),
    (public.has_full_license(p.id,coalesce((select extract(year from c.start_date)::int from public.calendar c where c.id=p_event_id),extract(year from public.license_today())::int))
      or exists(select 1 from public.temporary_licenses t where t.player_id=p.id and t.event_id=p_event_id and t.revoked_at is null)),
    case when public.has_full_license(p.id,coalesce((select extract(year from c.start_date)::int from public.calendar c where c.id=p_event_id),extract(year from public.license_today())::int)) then 'full' else 'none' end,
    p.category,p.image_url,p.level,exists(select 1 from public.temporary_licenses t where t.player_id=p.id and t.event_id=p_event_id and t.revoked_at is null)
  from public.players p where p.approved=true and (p_exclude_id is null or p.id<>p_exclude_id) and (
    (p_email is not null and (lower(trim(p.email))=lower(trim(p_email)) or private.contact_reference(p.email,p_event_id)=lower(trim(p_email))))
    or (p_name is not null and p.name ilike p_name)
    or (p_name_partial is not null and p.name ilike '%'||left(p_name_partial,100)||'%')
    or (p_ids is not null and cardinality(p_ids)<=100 and p.id=any(p_ids))
    or (nullif(trim(p_search),'') is not null and p.name ilike '%'||left(trim(p_search),100)||'%'))
  order by p.name,p.id limit 20;
end $$;

create or replace function public.get_event_registrations_for_matching(p_event_id bigint)
returns table(id uuid,email text,full_name text,partner_name text,partner_email text,division_id uuid,division text,status text,registered_by text,payment_status text)
language plpgsql stable security definer set search_path='' as $$
declare privileged boolean:=coalesce(private.finance_event(p_event_id),false);
begin
  if not private.permission_actor_active() or not private.event_visible(p_event_id) then
    raise exception 'Sign in to view players for this event.' using errcode='42501';
  end if;
  return query select r.id,case when privileged then r.email else private.contact_reference(r.email,p_event_id) end,
    r.full_name,r.partner_name,case when privileged then r.partner_email else private.contact_reference(r.partner_email,p_event_id) end,
    r.division_id,r.division,r.status,case when privileged then r.registered_by else private.contact_reference(r.registered_by,p_event_id) end,r.payment_status
  from public.event_registrations r where r.event_id=p_event_id and r.status is distinct from 'withdrawn';
end $$;

create or replace function public.check_my_registration(p_event_id bigint,p_email text)
returns table(id uuid,division text,payment_status text,partner_name text,full_name text,email text)
language plpgsql stable security definer set search_path='' as $$
declare address text:=lower(auth.email()); wanted text;
begin
  if not private.permission_actor_active() then raise exception 'Sign in to view your entry.' using errcode='42501'; end if;
  wanted:=private.resolve_contact(p_email,p_event_id);
  return query select r.id,r.division,r.payment_status,r.partner_name,r.full_name,
    case when private.finance_event(p_event_id) then r.email else private.contact_reference(r.email,p_event_id) end
  from public.event_registrations r where r.event_id=p_event_id and lower(trim(r.email))=wanted and r.status is distinct from 'withdrawn'
    and (lower(trim(r.email))=address or lower(trim(r.partner_email))=address or lower(trim(r.registered_by))=address or private.finance_event(p_event_id));
end $$;
revoke all on function public.find_registration_partner(text,text,text,bigint,bigint,bigint[],text),public.get_event_registrations_for_matching(bigint),public.check_my_registration(bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.find_registration_partner(text,text,text,bigint,bigint,bigint[],text),public.get_event_registrations_for_matching(bigint),public.check_my_registration(bigint,text) to authenticated;

-- Explicit public projections keep catalogue reads working after base-table
-- access is closed. Invoker views call narrowly projected private functions;
-- no private field can be selected by bypassing the view's column list.
create function private.catalog_players() returns setof public.players_public
language sql stable security definer set search_path='' as $$
 select id,name,rank_label,points,win_rate,image_url,created_at,home_club,age_group,nationality,category,level,bio,sponsors,gender,approved,skill_rating,age,match_form,rankings,rankedin_profile_url,rankedin_id,instagram_link,license_type,preferred_ranking,active_ranking_label,region,racket_brand,additional_images,club_id,account_type,court_side,playing_hand
 from public.players where approved=true
$$;
create or replace view public.players_public with(security_invoker=true) as select * from private.catalog_players();
create function private.catalog_registrations() returns setof public.event_registrations_public
language sql stable security definer set search_path='' as $$
 select r.id,r.event_id,r.full_name,r.partner_name,r.division,r.division_id,r.status,r.payment_status,r.created_at,
 encode(sha256(convert_to(private.contact_reference(r.email,r.event_id),'UTF8')),'hex'),
 encode(sha256(convert_to(private.contact_reference(r.partner_email,r.event_id),'UTF8')),'hex'),
 encode(sha256(convert_to(private.contact_reference(r.registered_by,r.event_id),'UTF8')),'hex')
 from public.event_registrations r where r.status is distinct from 'withdrawn' and private.event_visible(r.event_id)
   and (not coalesce(r.is_test,false) or private.edit_event(r.event_id))
$$;
create or replace view public.event_registrations_public with(security_invoker=true) as select * from private.catalog_registrations();
create function private.catalog_participants() returns setof public.tournament_participants_public
language sql stable security definer set search_path='' as $$
 select p.id,p.event_id,p.rankedin_participant_id,p.full_name,p.class_name,p.profile_id,p.is_paid from public.tournament_participants p
 where private.event_visible(p.event_id) and (not coalesce(p.is_test,false) or private.edit_event(p.event_id))
$$;
create or replace view public.tournament_participants_public with(security_invoker=true) as select * from private.catalog_participants();
create function private.catalog_club_members() returns setof public.club_members_public
language sql stable security definer set search_path='' as $$
 select m.id,m.club_id,m.role,m.player_id,m.created_at from public.club_members m
 where exists(select 1 from public.clubs c where c.id=m.club_id and c.status='approved')
$$;
create or replace view public.club_members_public with(security_invoker=true) as select * from private.catalog_club_members();
revoke all on function private.catalog_players(),private.catalog_registrations(),private.catalog_participants(),private.catalog_club_members() from public,anon,authenticated,service_role;
grant execute on function private.catalog_players(),private.catalog_registrations(),private.catalog_participants(),private.catalog_club_members() to anon,authenticated,service_role;
grant select on public.players_public,public.event_registrations_public,public.tournament_participants_public,public.club_members_public to anon,authenticated,service_role;

-- Final raw-table revokes await checkout and reservation compatibility tests.
commit;
