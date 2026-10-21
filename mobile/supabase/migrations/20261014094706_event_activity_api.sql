begin;
-- Keep privileged reads outside the exposed API schema. The public endpoint
-- uses invoker rights, with the identity and event guards in the private reader.
create schema event_feed_private;
revoke all on schema event_feed_private from public,anon;
grant usage on schema event_feed_private to authenticated;
alter function public.get_event_activity(bigint,text,integer,timestamptz,uuid) set schema event_feed_private;
create function public.get_event_activity(p_event_id bigint,p_filter text default 'all',p_limit integer default 20,
  p_before timestamptz default null,p_before_id uuid default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select event_feed_private.get_event_activity(p_event_id,p_filter,p_limit,p_before,p_before_id)
$$;
revoke all on function public.get_event_activity(bigint,text,integer,timestamptz,uuid) from public,anon;
grant execute on function public.get_event_activity(bigint,text,integer,timestamptz,uuid) to authenticated;
commit;
