-- The service RPC is the only API for the private score subscription table.
select pg_temp.expect(not has_schema_privilege('authenticated', 'live_scores', 'USAGE'), 'private live score schema is hidden');
select pg_temp.expect(not has_function_privilege('authenticated', 'public.pro_live_score_admin(text,jsonb)', 'EXECUTE'), 'player cannot call worker score RPC');
select pg_temp.expect(not has_function_privilege('anon', 'public.pro_live_score_admin(text,jsonb)', 'EXECUTE'), 'anonymous cannot call worker score RPC');
set local role service_role;
select jsonb_build_object(
  'owner', '00000000-0000-0000-0000-000000000001',
  'installation','81000000-0000-0000-0000-000000000001', 'pin','82000000-0000-0000-0000-000000000001',
  'match',101,'platform','ios','teams','["a","b"]'::jsonb,'stopHash',repeat('a',64)
) as score_pin \gset
select pg_temp.expect(public.pro_live_score_admin('start', :'score_pin')='true','create a live score pin');
select pg_temp.expect(public.pro_live_score_admin('token', :'score_pin'::jsonb || jsonb_build_object('token',repeat('t',32)))='true','register an activity token');
select pg_temp.expect(public.pro_live_score_admin('start', :'score_pin')='true','start retry preserves token');
select pg_temp.expect(public.pro_live_score_admin('token', :'score_pin'::jsonb || jsonb_build_object('owner','00000000-0000-0000-0000-000000000002','token',repeat('x',32)))='false','another account cannot attach a token');
select public.pro_live_score_admin('claim') as score_claim \gset
select pg_temp.expect(jsonb_array_length(:'score_claim'::jsonb)=1,'claim only the active score token');
select pg_temp.expect(public.pro_live_score_admin('claim')='[]','a previously leased pin is not claimed twice');
select pg_temp.expect(public.pro_live_score_admin('revoke', :'score_pin'::jsonb || jsonb_build_object('stopHash',repeat('x',64)))='false','unpin ignores a wrong capability');
select pg_temp.expect(public.pro_live_score_admin('start', :'score_pin'::jsonb || jsonb_build_object('pin','82000000-0000-0000-0000-000000000002','match',102,'stopHash',repeat('b',64)))='true','a device can replace its pinned match');
select pg_temp.expect(public.pro_live_score_admin('current', :'score_claim'::jsonb->0)='false','late delivery from replaced pin loses its lease');
select pg_temp.expect(public.pro_live_score_admin('revoke', jsonb_build_object('pin','82000000-0000-0000-0000-000000000002','stopHash',repeat('b',64)))='true','valid unpin clears the matching pin');
reset role;
