begin;
do $$
declare rows jsonb;
begin
 if has_table_privilege('authenticated','public.padel_api_cache','select') or has_table_privilege('anon','public.padel_api_backoff','select') then raise exception 'Provider data exposed'; end if;
 if has_function_privilege('authenticated','public.pause_padel_api(timestamptz)','execute') or has_function_privilege('anon','public.cached_padel_response(text)','execute') then raise exception 'Provider RPC exposed'; end if;
 perform public.save_padel_response('https://padelapi.org/api/_quota_test','{"data":[{"id":746}]}',60);
 if public.cached_padel_response('https://padelapi.org/api/_quota_test')->'payload'->'data'->0->>'id'<>'746' then raise exception 'Shared cache failed'; end if;
 update public.padel_api_cache set expires_at=now()-interval '1 second' where resource_key='https://padelapi.org/api/_quota_test';
 if public.cached_padel_response('https://padelapi.org/api/_quota_test') is not null then raise exception 'Expired cache presented as fresh'; end if;
 delete from public.padel_api_backoff;
 perform public.pause_padel_api(now()+interval '1 hour');
 perform public.pause_padel_api(now()+interval '1 minute');
 if public.padel_api_retry_at()<now()+interval '59 minutes' then raise exception 'Short retry overrode longer cooldown'; end if;
 update public.following_sync_state set checked_at=now()-interval '1 hour',lease_until=null;
 rows:=public.claim_following_sources(12);
 if exists(select 1 from jsonb_array_elements(rows) r where r->>'source'<>'local') then raise exception 'Quota-paused sources claimed'; end if;
 update public.padel_api_backoff set retry_until=now()-interval '1 second';
 if public.padel_api_retry_at() is not null then raise exception 'Provider did not resume after reset'; end if;
end $$;
rollback;
