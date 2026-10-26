-- Annual licensing. Calendar dates are evaluated in South Africa, never the browser timezone.
create schema if not exists private;
create table public.license_accounts (
 player_id bigint primary key references public.players(id) on delete cascade,
 serial bigint generated always as identity unique,
 created_at timestamptz not null default now()
);
create table public.license_seasons (
 year integer primary key check(year between 2026 and 2200),
 price numeric(10,2) not null check(price > 0), sales_open boolean not null default false,
 updated_at timestamptz not null default now()
);
insert into public.license_seasons(year,price,sales_open) values(2026,450,false),(2027,450,false);
create table public.annual_licenses (
 id uuid primary key default gen_random_uuid(),
 player_id bigint not null references public.players(id) on delete cascade,
 season_year integer not null references public.license_seasons(year),
 source text not null check(source in ('payment','manual','complimentary','legacy')),
 payment_id uuid references public.payments(id) on delete set null,
 revoked_at timestamptz, created_at timestamptz not null default now(),
 unique(player_id,season_year)
);
alter table public.temporary_licenses add column if not exists revoked_at timestamptz;
alter table public.temporary_licenses add column if not exists source text not null default 'legacy';
alter table public.temporary_licenses add column if not exists payment_id uuid references public.payments(id) on delete set null;
create table public.license_audit_log (
 id bigint generated always as identity primary key,
 player_id bigint references public.players(id) on delete cascade,
 license_id uuid, license_type text, action text not null, reason text not null,
 actor_id uuid, actor_email text, details jsonb not null default '{}', created_at timestamptz not null default now()
);
-- Preserve duplicate legacy event rows in history, keeping the earliest valid record active.
with ranked as(select id,row_number() over(partition by player_id,event_id order by created_at,id) as n from public.temporary_licenses where event_id is not null),
 revoked as(update public.temporary_licenses t set revoked_at=now() from ranked r where t.id=r.id and r.n>1 returning t.id,t.player_id)
insert into public.license_audit_log(player_id,license_id,license_type,action,reason)
select player_id,id,'temporary','import_duplicate','Duplicate event license retained in history; existing coverage preserved' from revoked;
create unique index temporary_licenses_one_active_event on public.temporary_licenses(player_id,event_id) where revoked_at is null;
create index on public.annual_licenses(season_year,player_id);
create index on public.license_audit_log(player_id,created_at desc);
create index if not exists temporary_licenses_player_event on public.temporary_licenses(player_id,event_id);
alter table public.native_license_checkouts add column if not exists license_year integer;
alter table public.native_license_checkouts add column if not exists license_type text not null default 'full';
alter table public.native_license_checkouts add column if not exists event_id bigint references public.calendar(id);
alter table public.native_license_checkouts add column if not exists channel text not null default 'native';
-- Existing attempts were sold while annual licenses represented 2026.
update public.native_license_checkouts set license_year=2026 where license_year is null;

create or replace function public.license_today() returns date language sql stable set search_path='' as $$
 select (now() at time zone 'Africa/Johannesburg')::date
$$;
create or replace function public.can_manage_licenses() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from auth.users where id=auth.uid()) and (public.is_super_admin(auth.email()) or exists(
 select 1 from public.admin_sidebar_permissions a where lower(a.email)=lower(auth.email())
 and (a.role='super_admin' or 'licenses'=any(a.allowed_tabs))))
$$;
create or replace function public.has_full_license(p_player_id bigint,p_year integer) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.annual_licenses where player_id=p_player_id and season_year=p_year and revoked_at is null)
$$;
-- Narrow eligibility endpoint: no license numbers, payment data or history are exposed.
create or replace function public.player_license_eligibility(p_player_id bigint,p_event_id bigint) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('year',extract(year from c.start_date)::integer,
 'full',public.has_full_license(p_player_id,extract(year from c.start_date)::integer),
 'temporary',exists(select 1 from public.temporary_licenses t where t.player_id=p_player_id and t.event_id=c.id and t.revoked_at is null))
 from public.calendar c where c.id=p_event_id
$$;
revoke all on function public.can_manage_licenses() from public;
grant execute on function public.can_manage_licenses() to authenticated,service_role;
revoke all on function public.has_full_license(bigint,integer) from public;
grant execute on function public.has_full_license(bigint,integer) to anon,authenticated,service_role;
revoke all on function public.player_license_eligibility(bigint,bigint) from public;
grant execute on function public.player_license_eligibility(bigint,bigint) to anon,authenticated,service_role;

-- Import once. No ledger rows are fabricated and uncertain matches stay visibly marked legacy.
insert into public.annual_licenses(player_id,season_year,source)
 select id,2026,'legacy' from public.players where lower(license_type)='full' and paid_registration=true;
update public.annual_licenses a set payment_id=m.id,source='payment' from (
 select distinct on(player_id) id,player_id from public.payments
 where status='success' and coalesce(is_test,false)=false and created_at >= '2026-01-01' and created_at < '2027-01-01'
 and (payment_type='full_license' or metadata->>'license_type'='full')
 and player_id in(select player_id from public.payments where status='success' and coalesce(is_test,false)=false and (payment_type='full_license' or metadata->>'license_type'='full') group by player_id having count(*)=1) order by player_id,created_at
) m where a.player_id=m.player_id;
insert into public.license_accounts(player_id)
 select id from public.players where id in (select player_id from public.annual_licenses union select player_id from public.temporary_licenses) order by id;
insert into public.license_audit_log(player_id,license_id,license_type,action,reason,details)
 select player_id,id,'full','import','Preserved existing 2026 Full coverage',jsonb_build_object('source',source,'payment_id',payment_id) from public.annual_licenses;

create or replace function private.project_license(p_player_id bigint) returns void language plpgsql security definer set search_path='' as $$
declare v_full boolean; v_temp boolean;
begin
 v_full:=public.has_full_license(p_player_id,extract(year from public.license_today())::integer);
 select exists(select 1 from public.temporary_licenses where player_id=p_player_id and revoked_at is null and event_date::date>=public.license_today()) into v_temp;
 update public.players set license_type=case when v_full then 'full' when v_temp then 'temporary' else 'none' end,paid_registration=v_full or v_temp where id=p_player_id;
end $$;
create or replace function private.protect_license_projection() returns trigger language plpgsql security definer set search_path='' as $$
declare v_full boolean; v_temp boolean;
begin
 v_full:=public.has_full_license(new.id,extract(year from public.license_today())::integer);
 select exists(select 1 from public.temporary_licenses where player_id=new.id and revoked_at is null and event_date::date>=public.license_today()) into v_temp;
 new.license_type:=case when v_full then 'full' when v_temp then 'temporary' else 'none' end;
 new.paid_registration:=v_full or v_temp; return new;
end $$;
create trigger protect_license_projection before insert or update of license_type,paid_registration on public.players for each row execute function private.protect_license_projection();
create or replace function private.license_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.license_accounts(player_id) values(new.player_id) on conflict do nothing;
 perform private.project_license(new.player_id); return new;
end $$;
create trigger annual_license_changed after insert or update on public.annual_licenses for each row execute function private.license_changed();
create trigger temporary_license_changed after insert or update on public.temporary_licenses for each row execute function private.license_changed();
create or replace function public.refresh_license_projections() returns void language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.role(),'')<>'service_role' and session_user not in ('postgres','supabase_admin') then raise exception 'Server access required'; end if;
 perform private.project_license(id) from public.players;
end $$;
revoke all on function public.refresh_license_projections() from public;
grant execute on function public.refresh_license_projections() to service_role;
-- Existing client callbacks must not mint a license without verified payment.
revoke all on function public.mark_player_paid(text) from public,anon,authenticated;
revoke all on function public.grant_partner_full_license(bigint) from public,anon,authenticated;

-- Registry is private; all reads below explicitly check owner/admin identity.
create view private.license_register as
 select a.id,a.player_id,p.name,p.email,'4M-'||lpad(ac.serial::text,greatest(6,length(ac.serial::text)),'0') as license_number,
 'full'::text as license_type,a.season_year,make_date(a.season_year,1,1) as starts_on,make_date(a.season_year,12,31) as ends_on,
 case when a.revoked_at is not null then 'revoked' when public.license_today()<make_date(a.season_year,1,1) then 'upcoming' when public.license_today()>make_date(a.season_year,12,31) then 'expired' else 'active' end as status,
 a.source,a.payment_id,a.created_at,null::bigint as event_id,null::text as event_name
 from public.annual_licenses a join public.players p on p.id=a.player_id join public.license_accounts ac on ac.player_id=p.id
 union all
 select t.id,t.player_id,p.name,p.email,'4M-'||lpad(ac.serial::text,greatest(6,length(ac.serial::text)),'0'),'temporary',extract(year from c.start_date)::integer,c.start_date::date,
 coalesce(c.end_date,c.start_date)::date,
 case when t.revoked_at is not null then 'revoked' when coalesce(c.end_date,c.start_date)::date<public.license_today() then 'expired' else 'active' end,
 t.source,t.payment_id,t.created_at,t.event_id,t.event_name::text
 from public.temporary_licenses t join public.players p on p.id=t.player_id join public.license_accounts ac on ac.player_id=p.id left join public.calendar c on c.id=t.event_id;
revoke all on private.license_register from public,anon,authenticated;

create or replace function public.get_player_licenses(p_player_id bigint default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_id bigint; v_result jsonb;
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid()) then raise exception 'Sign in to view licenses'; end if;
 if p_player_id is null then select id into v_id from public.players where lower(email)=lower(auth.email()); else v_id:=p_player_id; end if;
 if not public.can_manage_licenses() and not exists(select 1 from public.players where id=v_id and lower(email)=lower(auth.email())) then raise exception 'License access denied'; end if;
 select jsonb_build_object('player_id',p.id,'name',p.name,'email',p.email,
 'license_number',case when ac.serial is not null then '4M-'||lpad(ac.serial::text,greatest(6,length(ac.serial::text)),'0') end,
 'licenses',coalesce((select jsonb_agg(to_jsonb(r) order by r.season_year desc,r.created_at desc) from private.license_register r where r.player_id=p.id),'[]'::jsonb),
 'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at desc) from public.license_audit_log h where h.player_id=p.id),'[]'::jsonb),
 'payments',coalesce((select jsonb_agg(jsonb_build_object('id',pay.id,'amount',pay.amount,'reference',pay.reference,'payment_method',pay.payment_method,'status',pay.status,'created_at',pay.created_at)) from public.payments pay where pay.id in(select r.payment_id from private.license_register r where r.player_id=p.id)),'[]'::jsonb)) into v_result
 from public.players p left join public.license_accounts ac on ac.player_id=p.id where p.id=v_id;
 return v_result;
end $$;
revoke all on function public.get_player_licenses(bigint) from public;
grant execute on function public.get_player_licenses(bigint) to authenticated,service_role;

create or replace function public.manage_license(p_action text,p_input jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare v_player bigint:=(p_input->>'player_id')::bigint; v_year integer:=(p_input->>'year')::integer;
 v_id uuid; v_payment uuid; v_type text:=coalesce(p_input->>'license_type','full'); v_reason text:=trim(coalesce(p_input->>'reason',''));
 v_event bigint:=(p_input->>'event_id')::bigint; v_source text:=coalesce(p_input->>'source','complimentary'); v_row record; v_result jsonb;
 v_page integer:=greatest(0,coalesce((p_input->>'page')::integer,0)); v_search text:=trim(coalesce(p_input->>'search',''));
begin
 if not public.can_manage_licenses() then raise exception 'Licenses permission required'; end if;
 if p_action='list' then
 with filtered as(select * from private.license_register r where (v_year is null or r.season_year=v_year)
 and (coalesce(p_input->>'type','')='' or r.license_type=p_input->>'type')
 and (coalesce(p_input->>'status','')='' or r.status=p_input->>'status')
 and (coalesce(p_input->>'source','')='' or r.source=p_input->>'source')
 and (v_search='' or r.name ilike '%'||v_search||'%' or r.email ilike '%'||v_search||'%' or r.license_number ilike '%'||v_search||'%'))
 select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(s)) from(select * from filtered order by created_at desc,id limit 50 offset v_page*50)s),'[]'::jsonb),
 'counts',(select jsonb_build_object('active',count(*) filter(where status='active'),'upcoming',count(*) filter(where status='upcoming'),'expired',count(*) filter(where status='expired'),'revoked',count(*) filter(where status='revoked'),'legacy',count(*) filter(where source='legacy')) from filtered)) into v_result;
 return v_result || jsonb_build_object('reviews',coalesce((select jsonb_agg(to_jsonb(s)) from(select h.player_id,p.name,h.reason,h.created_at from public.license_audit_log h join public.players p on p.id=h.player_id where h.action='payment_review' order by h.created_at desc limit 50)s),'[]'::jsonb));
 elsif p_action='players' then
 return coalesce((select jsonb_agg(to_jsonb(s)) from(select p.id,p.name,p.email from public.players p left join public.license_accounts a on a.player_id=p.id where p.name ilike '%'||v_search||'%' or p.email ilike '%'||v_search||'%' or ('4M-'||lpad(a.serial::text,greatest(6,length(a.serial::text)),'0')) ilike '%'||v_search||'%' order by p.name limit 20)s),'[]'::jsonb);
 end if;
 if v_reason='' then raise exception 'Enter a reason for this change'; end if;
 if p_action='save_season' then
 insert into public.license_seasons(year,price,sales_open) values(v_year,(p_input->>'price')::numeric,coalesce((p_input->>'sales_open')::boolean,false)) on conflict(year) do update set price=excluded.price,sales_open=excluded.sales_open,updated_at=now();
 elsif p_action='save_temporary' then
 update public.commerce_config set temp_license_price=(p_input->>'price')::numeric,temp_license_enabled=(p_input->>'sales_open')::boolean,updated_at=now(),updated_by=auth.uid() where id='default';
 elsif p_action='grant' then
 if v_source not in('manual','complimentary') then raise exception 'Choose manual payment or complimentary'; end if;
 if v_type not in('full','temporary') then raise exception 'Choose a license type'; end if;
 -- Serialize grants and checkout completion for this player. Never charge/record twice for an existing license.
 perform 1 from public.players where id=v_player for update;
 if not found then raise exception 'Player not found'; end if;
 if v_type='full' then
 if exists(select 1 from public.annual_licenses where player_id=v_player and season_year=v_year) then raise exception 'License already exists; restore it if revoked'; end if;
 elsif exists(select 1 from public.temporary_licenses where player_id=v_player and event_id=v_event) then raise exception 'Event license already exists; restore it if revoked'; end if;
 if v_source='manual' then
 if coalesce((p_input->>'amount')::numeric,0)<=0 then raise exception 'Enter the amount received'; end if;
 if coalesce(p_input->>'payment_method','') not in ('cash','eft') then raise exception 'Choose cash or EFT'; end if;
 insert into public.payments(player_id,event_id,amount,currency,status,payment_type,payment_method,reference,is_test,metadata)
 values(v_player,v_event,(p_input->>'amount')::numeric,'ZAR','success',case when v_type='full' then 'full_license' else 'temp_license' end,p_input->>'payment_method','ADMIN-LIC-'||gen_random_uuid(),false,
 jsonb_build_object('source','license_admin','license_type',v_type,'license_year',v_year,'event_id',v_event,'receipt',p_input->>'receipt','reason',v_reason)) returning id into v_payment;
 -- Payment trigger below creates the license atomically; change its provenance to manual.
 if v_type='full' then update public.annual_licenses set source='manual' where player_id=v_player and season_year=v_year returning id into v_id;
 else update public.temporary_licenses set source='manual' where player_id=v_player and event_id=v_event returning id into v_id; end if;
 else
 if v_type='full' then insert into public.annual_licenses(player_id,season_year,source) values(v_player,v_year,v_source) returning id into v_id;
 else
 select * into strict v_row from public.calendar where id=v_event;
 insert into public.temporary_licenses(player_id,event_id,event_name,event_date,source) values(v_player,v_event,v_row.event_name,coalesce(v_row.end_date,v_row.start_date),v_source) returning id into v_id;
 end if;
 end if;
 elsif p_action in('revoke','restore') then
 v_id:=(p_input->>'id')::uuid;
 if v_type='full' then update public.annual_licenses set revoked_at=case when p_action='revoke' then now() end where id=v_id returning player_id into v_player;
 elsif v_type='temporary' then update public.temporary_licenses set revoked_at=case when p_action='revoke' then now() end where id=v_id returning player_id into v_player;
 else raise exception 'Choose a license type'; end if;
 if not found then raise exception 'License not found'; end if;
 else raise exception 'Unknown license action'; end if;
 insert into public.license_audit_log(player_id,license_id,license_type,action,reason,actor_id,actor_email,details)
 values(v_player,v_id,v_type,p_action,v_reason,auth.uid(),auth.email(),p_input);
 return jsonb_build_object('saved',true,'id',v_id);
end $$;
revoke all on function public.manage_license(text,jsonb) from public;
grant execute on function public.manage_license(text,jsonb) to authenticated;

-- Verified ledger records feed the same finalizer, including bundled partner purchases.
create or replace function private.finalize_license_payment() returns trigger language plpgsql security definer set search_path='' as $$
declare c jsonb; v_player bigint; v_year integer; v_event bigint; v_type text; v_id uuid; v_saved record; v_calendar record; v_source text; v_required numeric; v_base numeric; v_percent numeric;
begin
 if new.status<>'success' or coalesce(new.is_test,false) or new.currency<>'ZAR' then return new; end if;
 if coalesce(auth.role(),'')<>'service_role' and session_user not in ('postgres','supabase_admin') and not public.can_manage_licenses() then return new; end if;
 -- Parent event covers are authoritative; child ledger splits must not grant twice.
 if new.metadata ? 'parent_reference' or new.metadata ? 'parent_payment_id' then return new; end if;
 select license_fee_percent,temp_license_price into v_percent,v_base from public.commerce_config where id='default';
 if jsonb_typeof(new.metadata->'covers')='array' then
 select sum(case when x->>'license'='full' then (select price from public.license_seasons where year=coalesce((x->>'license_year')::integer,(new.metadata->>'license_year')::integer,(select extract(year from start_date)::integer from public.calendar where id=coalesce((x->>'event_id')::bigint,new.event_id)))) else v_base end * (1+coalesce(v_percent,0)/100))
 into v_required from jsonb_array_elements(new.metadata->'covers') x where x->>'type'='license';
 if new.amount+0.01<coalesce(v_required,0) and not (new.payment_method in('cash','eft') and public.can_manage_licenses()) then
 insert into public.license_audit_log(player_id,action,reason,details) values(new.player_id,'payment_review','Payment does not cover the server license prices',jsonb_build_object('payment_id',new.id));return new;
 end if;
 end if;

 for c in select value from jsonb_array_elements(case when jsonb_typeof(new.metadata->'covers')='array' then new.metadata->'covers' else '[]'::jsonb end) where value->>'type'='license'
 union all select jsonb_build_object('license',case when new.payment_type='temp_license' then 'temporary' else coalesce(new.metadata->>'license_type','full') end,'player_id',new.player_id,'event_id',new.event_id,'license_year',new.metadata->'license_year')
 where (new.payment_type in('membership','full_license','temp_license') or new.metadata->>'license_type' in('full','temporary')) and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(new.metadata->'covers')='array' then new.metadata->'covers' else '[]'::jsonb end) x where x->>'type'='license')
 loop
 v_id:=null; v_type:=c->>'license'; v_player:=coalesce((c->>'player_id')::bigint,new.player_id);
 if c ? 'email' then select id into v_player from public.players where lower(email)=lower(c->>'email'); end if;
 if v_player is null then continue; end if;
 perform 1 from public.players where id=v_player for update;
 v_event:=coalesce((c->>'event_id')::bigint,new.event_id,(new.metadata->>'event_id')::bigint);
 v_year:=coalesce((c->>'license_year')::integer,(new.metadata->>'license_year')::integer);
 select * into v_saved from public.native_license_checkouts where reference=coalesce(new.metadata->>'client_reference',new.reference) and player_id=v_player;
 if found then
 if v_saved.amount<>new.amount then raise exception 'License payment amount does not match checkout'; end if;
 v_year:=v_saved.license_year; v_event:=v_saved.event_id; v_type:=v_saved.license_type;
 end if;
 select * into v_calendar from public.calendar where id=v_event; v_year:=coalesce(v_year,extract(year from v_calendar.start_date)::integer);
 if v_saved.reference is null and new.payment_method='paystack' and new.created_at>='2026-10-15T09:32:22Z'
 and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(new.metadata->'covers')='array' then new.metadata->'covers' else '[]'::jsonb end)x where x->>'type'='license') then
 if not exists(select 1 from public.license_audit_log where action='payment_review' and details->>'payment_id'=new.id::text) then
 insert into public.license_audit_log(player_id,license_type,action,reason,details) values(v_player,v_type,'payment_review','Standalone license payment needs a server checkout record',jsonb_build_object('payment_id',new.id));end if;continue;
 end if;

 if v_type='full' then
 -- A bundled annual license must cover the actual event's calendar year.
 if v_event is not null and v_year is not null and v_year<>extract(year from v_calendar.start_date)::integer then
 insert into public.license_audit_log(player_id,license_type,action,reason,details) values(v_player,'full','payment_review','License year does not match the event',jsonb_build_object('payment_id',new.id));continue;
 end if;
 -- Only pre-migration charges can be interpreted as yearless 2026 purchases.
 if v_year is null and new.created_at<'2026-10-15T09:32:22Z' then v_year:=2026; end if;
 if v_year is null or not exists(select 1 from public.license_seasons where year=v_year) then
 if not exists(select 1 from public.license_audit_log where action='payment_review' and details->>'payment_id'=new.id::text) then
 insert into public.license_audit_log(player_id,license_type,action,reason,details) values(v_player,'full','payment_review','Annual payment needs an explicit license year',jsonb_build_object('payment_id',new.id)); end if;
 continue;
 end if;
 if v_saved.reference is null and new.payment_method='paystack' and new.created_at>='2026-10-15T09:32:22Z' and not exists(select 1 from public.license_seasons where year=v_year and sales_open) then
 insert into public.license_audit_log(player_id,license_type,action,reason,details) values(v_player,'full','payment_review','Bundled annual license sales were closed; administrator review required',jsonb_build_object('payment_id',new.id));continue;
 end if;
 select price into v_required from public.license_seasons where year=v_year;
 if v_saved.reference is null and new.amount+0.01 < round(v_required*(1+coalesce(v_percent,0)/100),2) and not (new.payment_method in('cash','eft') and public.can_manage_licenses()) then
 insert into public.license_audit_log(player_id,license_type,action,reason,details) values(v_player,'full','payment_review','Annual payment below the server license price',jsonb_build_object('payment_id',new.id));continue;
 end if;
 insert into public.annual_licenses(player_id,season_year,source,payment_id) values(v_player,v_year,'payment',new.id) on conflict(player_id,season_year) do nothing returning id into v_id;
 -- Link evidence without restoring a revoked entitlement.
 update public.annual_licenses set payment_id=new.id,source=case when source='legacy' then 'payment' else source end where player_id=v_player and season_year=v_year and payment_id is null;
 elsif v_type='temporary' and v_event is not null then
 if v_saved.reference is null and new.amount+0.01<round(v_base*(1+coalesce(v_percent,0)/100),2) and not (new.payment_method in('cash','eft') and public.can_manage_licenses()) then
 insert into public.license_audit_log(player_id,license_type,action,reason,details) values(v_player,'temporary','payment_review','Event license payment below server price',jsonb_build_object('payment_id',new.id));continue;
 end if;
 if not exists(select 1 from public.temporary_licenses where player_id=v_player and event_id=v_event) then
 insert into public.temporary_licenses(player_id,event_id,event_name,event_date,source,payment_id) values(v_player,v_event,v_calendar.event_name,coalesce(v_calendar.end_date,v_calendar.start_date),'payment',new.id) returning id into v_id;
 end if;
 end if;
 if v_id is not null then insert into public.license_audit_log(player_id,license_id,license_type,action,reason,details) values(v_player,v_id,v_type,'payment','Verified license payment',jsonb_build_object('payment_id',new.id,'reference',new.reference)); end if;
 end loop;
 return new;
end $$;
create trigger finalize_license_payment after insert or update on public.payments for each row execute function private.finalize_license_payment();

-- Security: canonical records and temporary licenses are server-owned.
alter table public.license_accounts enable row level security;
alter table public.license_seasons enable row level security;
alter table public.annual_licenses enable row level security;
alter table public.license_audit_log enable row level security;
revoke all on public.license_accounts,public.annual_licenses,public.license_audit_log,public.license_seasons from public,anon,authenticated;
grant select on public.license_seasons to anon,authenticated;
grant all on public.license_accounts,public.annual_licenses,public.license_seasons,public.license_audit_log to service_role;
create policy "Published license seasons" on public.license_seasons for select using(true);
-- Replace every permissive temporary-license policy (including legacy ALL policies).
do $$declare r record;begin for r in select policyname from pg_policies where schemaname='public' and tablename='temporary_licenses' loop execute format('drop policy %I on public.temporary_licenses',r.policyname);end loop;end $$;
revoke insert,update,delete on public.temporary_licenses from anon,authenticated;
create policy "Own or license admin temporary licenses" on public.temporary_licenses for select to authenticated using(public.can_manage_licenses() or exists(select 1 from public.players p where p.id=player_id and lower(p.email)=lower(auth.email())));
revoke all on all functions in schema private from public,anon,authenticated;
-- Run at Johannesburg midnight, including the annual rollover.
do $$begin if exists(select 1 from pg_extension where extname='pg_cron') then perform cron.schedule('license-daily-projections','0 22 * * *','select public.refresh_license_projections()');end if;end $$;

-- Keep existing partner API signatures, but resolve flags for the requested event year.
do $$declare f record; v_sql text; begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='find_registration_partner' loop
 v_sql:=pg_get_functiondef(f.oid);
 v_sql:=replace(v_sql,'p.paid_registration, p.license_type',
 '(public.has_full_license(p.id,coalesce((select extract(year from start_date)::integer from public.calendar where id=p_event_id),extract(year from public.license_today())::integer)) or exists(select 1 from public.temporary_licenses x where x.player_id=p.id and x.event_id=p_event_id and x.revoked_at is null)), case when public.has_full_license(p.id,coalesce((select extract(year from start_date)::integer from public.calendar where id=p_event_id),extract(year from public.license_today())::integer)) then ''full'' else ''none'' end');
 v_sql:=replace(v_sql,'tl.event_id = p_event_id','tl.event_id = p_event_id and tl.revoked_at is null');
 execute v_sql;
 end loop;
 -- Adapt existing tournament APIs without replacing their unrelated access/scheduling behavior.
 for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('tm_confirm','tm_snapshot','tm_player_fingerprint') loop
 v_sql:=pg_get_functiondef(f.oid);
 if f.proname='tm_confirm' then
 v_sql:=replace(v_sql,'lower(p.license_type)=''full''','public.has_full_license(p.id,(select extract(year from start_date)::integer from public.calendar where id=p_event))');
 v_sql:=replace(v_sql,'t.event_id=p_event','t.event_id=p_event and t.revoked_at is null');
 elsif f.proname='tm_snapshot' then
 v_sql:=replace(v_sql,'''license_type'',p.license_type','''license_type'',case when public.has_full_license(p.id,(select extract(year from start_date)::integer from public.calendar where id=p_event)) then ''full'' else ''none'' end');
 v_sql:=replace(v_sql,'''points'',to_jsonb(p)', '''event_license'',public.player_license_eligibility(p.id,p_event),''points'',to_jsonb(p)');
 v_sql:=replace(v_sql,'WHERE t.player_id=p.id','WHERE t.player_id=p.id and t.revoked_at is null');
 elsif f.proname='tm_player_fingerprint' then
 v_sql:=replace(v_sql,'p.id,p.email,p.license_type','p.id,p.email,(select jsonb_agg(jsonb_build_array(a.season_year,a.revoked_at) order by a.season_year) from public.annual_licenses a where a.player_id=p.id)');
 v_sql:=replace(v_sql,'WHERE t.player_id=p.id','WHERE t.player_id=p.id and t.revoked_at is null');
 end if;
 execute v_sql;
 end loop;
end $$;
-- A refunded event license retains its history instead of being silently deleted.
create or replace function private.temp_license_deleted() returns trigger language plpgsql security definer set search_path='' as $$
begin perform private.project_license(old.player_id);return old;end $$;
create trigger temp_license_deleted after delete on public.temporary_licenses for each row execute function private.temp_license_deleted();
revoke all on all functions in schema private from public,anon,authenticated;

-- Old browser callbacks can refresh their own projection, but cannot grant coverage.
create or replace function public.mark_player_paid(p_license_type text default 'full') returns void language plpgsql security definer set search_path='' as $$
declare v_player bigint;begin select id into v_player from public.players where lower(email)=lower(auth.email());if v_player is not null then perform private.project_license(v_player);end if;end $$;
grant execute on function public.mark_player_paid(text) to authenticated;
grant select on public.temporary_licenses to authenticated;
grant usage,select on sequence public.license_accounts_serial_seq,public.license_audit_log_id_seq to service_role;

create or replace function public.event_license_status(p_event_id bigint,p_player_ids bigint[]) returns table(player_id bigint,eligibility jsonb)
language sql stable security definer set search_path='' as $$
 select id,public.player_license_eligibility(id,p_event_id) from (select distinct unnest(p_player_ids) as id limit 1000)s
$$;
revoke all on function public.event_license_status(bigint,bigint[]) from public;
grant execute on function public.event_license_status(bigint,bigint[]) to anon,authenticated,service_role;

create or replace function private.protect_license_commerce() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.temp_license_price is distinct from old.temp_license_price or new.temp_license_enabled is distinct from old.temp_license_enabled)
 and coalesce(auth.role(),'')<>'service_role' and not public.can_manage_licenses() and session_user not in('postgres','supabase_admin') then raise exception 'Licenses permission required';end if;
 return new;
end $$;
create trigger protect_license_commerce before update on public.commerce_config for each row execute function private.protect_license_commerce();
revoke all on all functions in schema private from public,anon,authenticated;
