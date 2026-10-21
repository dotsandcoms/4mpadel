-- License history includes relevant ledger records even when a legacy import
-- cannot safely choose one of several payments as its canonical evidence.
create function private.player_license_payment_history(p_player_id bigint) returns jsonb
language sql stable security definer set search_path='' as $$
with target as (select id,email from public.players where id=p_player_id),
payment_data as (
 select p.*,case when jsonb_typeof(p.metadata->'original_trx'->'metadata')='object' then p.metadata->'original_trx'->'metadata' else '{}'::jsonb end || coalesce(p.metadata,'{}'::jsonb) as meta
 from public.payments p
), relevant as (
 select p.*,parent.created_at as parent_created_at,c.event_name,
 exists(select 1 from private.license_register r where r.player_id=p_player_id and r.payment_id in(p.id,parent.id)) as linked,
 p.payment_type not in('membership','full_license','temp_license') as bundled
 from payment_data p cross join target t
 left join public.payments parent on parent.reference=p.meta->>'parent_reference'
 left join public.calendar c on c.id=p.event_id
 where exists(select 1 from private.license_register r where r.player_id=p_player_id and r.payment_id=p.id)
 or (p.player_id=t.id and (p.payment_type in('membership','full_license','temp_license') or p.meta->>'license_type' in('full','temporary')))
 or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(p.meta->'covers')='array' then p.meta->'covers' else '[]'::jsonb end) x
 where x->>'type'='license' and (lower(x->>'email')=lower(t.email) or x->>'player_id'=t.id::text))
)
select coalesce(jsonb_agg(jsonb_build_object(
 'id',id,'amount',amount,'currency',coalesce(currency,'ZAR'),'reference',reference,
 'payment_method',payment_method,'status',status,'payment_type',payment_type,
 'created_at',coalesce(parent_created_at,created_at),'recorded_at',created_at,
 'event_name',event_name,'linked',linked,'bundled',bundled,'is_test',coalesce(is_test,false),
 'license_year',case when meta->>'license_year' ~ '^[0-9]{4}$' then (meta->>'license_year')::integer end
) order by coalesce(parent_created_at,created_at) desc,id),'[]'::jsonb) from relevant;
$$;
revoke all on function private.player_license_payment_history(bigint) from public,anon,authenticated;

create or replace function public.get_player_licenses(p_player_id bigint default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_id bigint;v_result jsonb;
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid()) then raise exception 'Sign in to view licenses';end if;
 if p_player_id is null then select id into v_id from public.players where lower(email)=lower(auth.email());else v_id:=p_player_id;end if;
 if not public.can_manage_licenses() and not exists(select 1 from public.players where id=v_id and lower(email)=lower(auth.email())) then raise exception 'License access denied';end if;
 select jsonb_build_object('player_id',p.id,'name',p.name,'email',p.email,
 'license_number',case when ac.serial is not null then '4M-'||lpad(ac.serial::text,greatest(6,length(ac.serial::text)),'0') end,
 'licenses',coalesce((select jsonb_agg(to_jsonb(r) order by r.season_year desc,r.created_at desc) from private.license_register r where r.player_id=p.id),'[]'::jsonb),
 'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at desc) from public.license_audit_log h where h.player_id=p.id),'[]'::jsonb),
 'payments',private.player_license_payment_history(p.id)) into v_result
 from public.players p left join public.license_accounts ac on ac.player_id=p.id where p.id=v_id;
 return v_result;
end $$;
revoke all on function public.get_player_licenses(bigint) from public;
grant execute on function public.get_player_licenses(bigint) to authenticated,service_role;
notify pgrst, 'reload schema';
