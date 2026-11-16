-- Public read models must not be a write-through path around base-table RLS.
-- The existing narrow SELECT projections remain compatible with installed apps.
begin;
revoke insert,update,delete,truncate,references,trigger on public.players_public,public.event_registrations_public,public.tournament_participants_public,public.club_members_public from public,anon,authenticated,service_role;
grant select on public.players_public,public.event_registrations_public,public.tournament_participants_public,public.club_members_public to anon,authenticated,service_role;
revoke create on schema public from public,anon,authenticated;
-- Trusted schemas only; pg_temp is explicit and last so temporary relations
-- cannot shadow application tables in privileged legacy functions.
do $$declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array['org_audit','update_albums_updated_at_column','update_rankedin_cache_updated_at','is_federation_member','is_federation_admin','can_sanction_organisation','can_sanction_event','audit_actor','audit_org_members','touch_commerce_config','get_player_id_by_email','protect_org_privileged_fields','is_4m_admin','is_org_member','is_org_admin','enqueue_partner_whatsapp_notification','audit_organisations','merge_clubs','audit_safe_event']) loop
 execute format('alter function %s set search_path=pg_catalog,public,extensions,pg_temp',f.signature);
 end loop;
end $$;
-- Audit writes are called by owner-run triggers, never by a browser.
do $$begin if to_regprocedure('public.org_audit(text,text,text,uuid,jsonb)') is not null then
 revoke all on function public.org_audit(text,text,text,uuid,jsonb) from public,anon,authenticated;
end if;end $$;
-- Trigger functions are implementation details, not client RPC endpoints.
do $$declare f record;begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prorettype='pg_catalog.trigger'::regtype loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 end loop;
end $$;
-- A homepage read may request a refresh, but only a worker/Calendar admin may
-- change shared promotion flags. Existing callers still receive a row count.
do $$declare definition text;begin
 if to_regprocedure('public.promote_finished_tier_recent_results()') is not null then
  select pg_get_functiondef('public.promote_finished_tier_recent_results()'::regprocedure) into definition;
  if definition !~ E'\\nBEGIN\\y' then raise exception 'Unexpected promotion function'; end if;
  execute regexp_replace(definition,E'\\nBEGIN\\y',E'\nBEGIN\nif not private.worker_write() and not private.admin_module(''calendar'') then return 0; end if;');
 end if;
end $$;
-- Session/scope checks precede legacy logging and participant-management code.
do $$declare f record;definition text;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('log_event_activity','reassign_tournament_participant_division') loop
  select pg_get_functiondef(f.signature) into definition;
  if definition !~ E'\\nBEGIN\\y' then raise exception 'Unexpected event management function'; end if;
  execute regexp_replace(definition,E'\\nBEGIN\\y',E'\nBEGIN\nif not private.worker_write() and not coalesce(private.edit_event(p_event_id),false) then raise exception ''You do not manage this event.'' using errcode=''42501''; end if;');
  execute format('revoke all on function %s from public,anon',f.signature);
  execute format('grant execute on function %s to authenticated,service_role',f.signature);
 end loop;
end $$;
commit;
