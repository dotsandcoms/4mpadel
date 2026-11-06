-- Announcement cards identify their publisher without exposing contact information.
create or replace function messaging.event_analytics(p_event bigint) returns jsonb language plpgsql security definer set search_path='' set timezone='Africa/Johannesburg' as $$
declare uid uuid:=messaging.actor(); event_json jsonb; updates jsonb; audience bigint; discussion_audience bigint; summary jsonb;
begin
  if not messaging.enabled_for(uid) then raise exception 'Messaging is getting ready.' using errcode='42501'; end if;
  perform messaging.require_manager(p_event);
  select jsonb_build_object('id',e.id,'title',e.event_name,'date',e.start_date,'endDate',e.end_date,
    'organisation',o.name,'venue',e.venue,'postingOpen',e.event_status is distinct from 'cancelled' and current_date<=coalesce(e.end_date,e.start_date)::date+7)
    into event_json from public.calendar e left join public.organisations o on o.id=e.organisation_id
    where e.id=p_event and coalesce(e.end_date,e.start_date)::date>=current_date-90;
  if event_json is null then raise exception 'This event conversation is unavailable.' using errcode='42501'; end if;
  select count(*) filter(where c.kind='event_announcements'),count(*) filter(where c.kind='event_discussion') into audience,discussion_audience
    from messaging.members member join messaging.conversations c on c.id=member.conversation_id
    join messaging.accounts a on a.user_id=member.user_id join auth.users u on u.id=a.user_id cross join messaging.configuration cfg
    where c.event_id=p_event and member.active and not a.suspended and u.deleted_at is null and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until<now()) and cfg.enabled and (cardinality(cfg.pilot_player_ids)=0 or a.player_id=any(cfg.pilot_player_ids));
  with eligible_readers as materialized (
    select member.conversation_id,member.user_id,member.read_seq from messaging.members member
      join messaging.conversations c on c.id=member.conversation_id join messaging.accounts a on a.user_id=member.user_id
      join auth.users u on u.id=a.user_id cross join messaging.configuration cfg
    where c.event_id=p_event and c.kind='event_announcements' and member.active and not a.suspended
      and u.deleted_at is null and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<now())
      and cfg.enabled and (cardinality(cfg.pilot_player_ids)=0 or a.player_id=any(cfg.pilot_player_ids))
  ) select coalesce(jsonb_agg(item order by published desc,seq desc),'[]'::jsonb) into updates from (
    select m.created_at published,m.seq,jsonb_build_object('id',m.id,'body',m.body,'createdAt',m.created_at,'sender',jsonb_build_object('name',coalesce(sender.name,'Former player'),'role',m.sender_role),
      'audience',readers.audience,'read',readers.read_count,'pushQueued',push.queued,'pushAccepted',push.accepted,
      'pushConfirmed',push.confirmed,'pushFailed',push.failed,'pushSkipped',push.skipped,'pushJobs',push.jobs) item
    from messaging.messages m join messaging.conversations c on c.id=m.conversation_id
    left join messaging.accounts author on author.user_id=m.sender_id left join public.players sender on sender.id=author.player_id
    cross join lateral (
      select count(*) audience,count(*) filter(where member.read_seq>=m.seq) read_count from eligible_readers member
      where member.conversation_id=c.id and member.user_id is distinct from m.sender_id
    ) readers
    cross join lateral (
      select count(*) jobs,count(*) filter(where state in ('pending','leased')) queued,count(*) filter(where state='accepted') accepted,
        count(*) filter(where state='sent') confirmed,count(*) filter(where state='failed') failed,count(*) filter(where state='skipped') skipped
      from messaging.deliveries d where d.message_id=m.id
    ) push
    where c.event_id=p_event and c.kind='event_announcements' and m.deleted_at is null and m.expires_at>now()
    order by m.created_at desc,m.seq desc limit 100
  ) announcements;
  select jsonb_build_object('audience',audience,'discussionAudience',discussion_audience,
    'announcements',(select count(*) from messaging.messages m join messaging.conversations c on c.id=m.conversation_id where c.event_id=p_event and c.kind='event_announcements' and m.deleted_at is null and m.expires_at>now()),
    'discussionMessages',(select count(*) from messaging.messages m join messaging.conversations c on c.id=m.conversation_id where c.event_id=p_event and c.kind='event_discussion' and m.deleted_at is null and m.expires_at>now()),
    'openReports',(select count(*) from messaging.reports r join messaging.conversations c on c.id=r.conversation_id where c.event_id=p_event and r.status='open'),
    'pushIssues',(select count(*) from messaging.deliveries d join messaging.conversations c on c.id=d.conversation_id where c.event_id=p_event and d.state='failed'),
    'read',(select coalesce(sum((value->>'read')::bigint),0) from jsonb_array_elements(updates)),
    'readAudience',(select coalesce(sum((value->>'audience')::bigint),0) from jsonb_array_elements(updates))) into summary;
  insert into messaging.audit(actor_id,action) values(uid,'event_analytics');
  return jsonb_build_object('event',event_json,'summary',summary,'announcements',updates,'generatedAt',clock_timestamp());
end $$;

revoke all on function messaging.event_analytics(bigint) from public,anon,authenticated,service_role;
grant execute on function messaging.event_analytics(bigint) to authenticated;
notify pgrst,'reload schema';
