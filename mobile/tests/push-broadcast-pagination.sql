\set ON_ERROR_STOP on
\ir ../../tests/pushBroadcast.sql
\ir ../supabase/migrations/20261110091239_push_broadcast_home_and_paginated_history.sql
begin;
create function pg_temp.expect(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end$$;
create function pg_temp.reject(query text,pattern text) returns void language plpgsql as $$begin begin execute query; exception when others then if sqlerrm!~pattern then raise exception 'Unexpected rejection: %',sqlerrm; end if;return;end;raise exception 'Expected rejection: %',query;end$$;
select pg_temp.expect(not has_function_privilege('anon','public.list_push_broadcasts_page(integer)','EXECUTE'),'history RPC denies anonymous reads');
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002","email":"other@example.test"}',true);
select pg_temp.reject('select public.list_push_broadcasts_page(1)','Broadcast permission');
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","email":"admin@example.test"}',true);
insert into public.push_broadcasts(id,created_by,created_by_email,title,body,path,audience,recipient_count,queued_count,created_at)
  select gen_random_uuid(),'00000000-0000-0000-0000-000000000001','admin@example.test','Broadcast '||n,'Sample body','/calendar','{}',1,1,now()-n*interval '1 minute' from generate_series(1,12)n;
select pg_temp.expect(jsonb_array_length(public.list_push_broadcasts_page(1)->'items')=5,'first history page has five campaigns');
select pg_temp.expect(jsonb_array_length(public.list_push_broadcasts_page(3)->'items')=2,'last history page has remaining campaigns');
select pg_temp.expect(public.list_push_broadcasts_page(1)->>'total'='12' and public.list_push_broadcasts_page(1)->>'pages'='3','history reports correct totals');
select pg_temp.expect(public.list_push_broadcasts_page(999)->>'page'='3','history safely clamps a stale page');
select pg_temp.expect(not exists(select 1 from jsonb_array_elements(public.list_push_broadcasts_page(1)->'items') a join jsonb_array_elements(public.list_push_broadcasts_page(2)->'items') b on a->>'id'=b->>'id'),'history pages do not repeat campaigns');
insert into public.players(id,name,email) values(99,'Test player','test@example.test');
insert into public.player_push_tokens(email,token) values('test@example.test','ExponentPushToken[fixture]');
select public.preview_push_broadcast(p_player_ids=>array[99::bigint])->>'fingerprint' as fingerprint \gset
select public.send_push_broadcast(gen_random_uuid(),'Home test','Sample body','/(tabs)',:'fingerprint',p_player_ids=>array[99::bigint]);
select pg_temp.expect(exists(select 1 from public.push_outbox where path='/(tabs)' and title='Home test'),'Home destination is queued as an exact native route');
select pg_temp.reject(format('select public.send_push_broadcast(gen_random_uuid(),''Bad path'',''Body'',''/(tabs)?redirect=evil'',%L,p_player_ids=>array[99::bigint])',:'fingerprint'),'supported app destination');
rollback;
\echo 'Push broadcast pagination: five per page, counts, permissions and exact Home destination passed.'
