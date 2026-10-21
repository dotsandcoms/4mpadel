begin;
do $$
declare answer jsonb; initial bigint; key text:='https://padelapi.org/api/_budget_test';
begin
 if has_function_privilege('authenticated','public.claim_padel_request(text)','execute') or has_table_privilege('anon','public.padel_api_requests','select') then raise exception 'Provider controls exposed'; end if;
 delete from public.padel_api_backoff;
 delete from public.padel_api_requests;
 delete from public.padel_api_leases;
 delete from public.padel_api_cache where resource_key=key;
 answer:=public.claim_padel_request(key);
 if answer->>'action'<>'fetch' then raise exception 'First request not reserved'; end if;
 for i in 1..2000 loop
  if public.claim_padel_request(key)->>'action'<>'wait' then raise exception 'Concurrent cold resource not deduplicated'; end if;
 end loop;
 if (select count(*) from public.padel_api_requests)<>1 then raise exception 'Viewer count multiplied provider requests'; end if;
 perform public.save_padel_response(key,'{"data":[]}',120);
 if public.claim_padel_request(key)->>'action'<>'cached' then raise exception 'Shared response not served'; end if;
 update public.padel_api_cache set expires_at=now()-interval '1 second' where resource_key=key;
 if public.claim_padel_request(key)->>'action'<>'stale' then raise exception 'Refresh lease hid saved response'; end if;
 delete from public.padel_api_leases;
 update public.padel_api_control set minute_limit=2,day_limit=3,month_limit=4;
 perform public.claim_padel_request(key||'2');
 if public.claim_padel_request(key||'3')->>'reason'<>'minute_budget' then raise exception 'Minute budget bypassed'; end if;
 update public.padel_api_requests set requested_at=now()-interval '2 hours';
 perform public.claim_padel_request(key||'3');
 if public.claim_padel_request(key||'4')->>'reason'<>'day_budget' then raise exception 'Rolling daily budget bypassed'; end if;
 update public.padel_api_requests set requested_at=now()-interval '2 days';
 perform public.claim_padel_request(key||'4');
 if public.claim_padel_request(key||'5')->>'reason'<>'month_budget' then raise exception 'Rolling monthly budget bypassed'; end if;
 perform public.save_padel_response('https://padelapi.org/api/players/123','{"id":123,"name":"Test","nationality":"ZA"}',86400);
 if public.cached_padel_players(array[123])->0->>'nationality'<>'ZA' then raise exception 'Country index failed'; end if;
end $$;
rollback;
