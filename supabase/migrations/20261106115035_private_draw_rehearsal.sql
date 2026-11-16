-- Rehearsal access is deliberately NOT an admin_sidebar_permissions row.
-- is_4m_admin() considers any such row a live draw manager.
-- These RPCs only read selected event data. No rehearsal tables, live writes,
-- recipient queues, credentials or payment references are created or returned.
SET LOCAL lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.can_start_private_draw_rehearsal()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
    SELECT (SELECT auth.uid()) IS NOT NULL
       AND (SELECT public.account_is_active())
       AND EXISTS (
           SELECT 1 FROM auth.users u
           WHERE u.id = (SELECT auth.uid()) AND u.email_confirmed_at IS NOT NULL
             AND (lower(u.email) = 'greggogoski@gmail.com' OR public.is_super_admin(u.email))
       );
$function$;
REVOKE ALL ON FUNCTION public.can_start_private_draw_rehearsal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_start_private_draw_rehearsal() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_private_draw_rehearsal_events()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
    IF NOT public.can_start_private_draw_rehearsal() THEN
        RAISE EXCEPTION 'Private rehearsal access denied' USING ERRCODE = '42501';
    END IF;
    RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'event_name', c.event_name, 'start_date', c.start_date,
        'end_date', c.end_date, 'venue', c.venue
    ) ORDER BY c.start_date DESC, c.id DESC) FROM public.calendar c
    WHERE c.is_manual AND EXISTS (SELECT 1 FROM public.tournament_divisions d WHERE d.event_id = c.id)), '[]'::jsonb);
END;
$function$;
REVOKE ALL ON FUNCTION public.list_private_draw_rehearsal_events() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_private_draw_rehearsal_events() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.private_draw_rehearsal_snapshot(p_event_id bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE snapshot jsonb;
BEGIN
    IF NOT public.can_start_private_draw_rehearsal() THEN
        RAISE EXCEPTION 'Private rehearsal access denied' USING ERRCODE = '42501';
    END IF;
    SELECT jsonb_build_object(
        'version', 1, 'copied_at', now(), 'owner_id', auth.uid(),
        'event', jsonb_build_object('id',c.id,'event_name',c.event_name,'slug',c.slug,
            'start_date',c.start_date,'end_date',c.end_date,'start_time',c.start_time,
            'end_time',c.end_time,'courts_count',c.courts_count,'court_labels',c.court_labels,
            'venue',c.venue,'golden_point',c.golden_point,'default_match_format',c.default_match_format,
            'is_manual',true),
        'divisions',COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.sort_order,d.name)
            FROM public.tournament_divisions d WHERE d.event_id=c.id AND d.cancelled_at IS NULL),'[]'::jsonb),
        'registrations',COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'id',r.id,'event_id',r.event_id,'division_id',r.division_id,'division',r.division,
            'full_name',r.full_name,'email',r.email,'partner_name',r.partner_name,
            'partner_email',r.partner_email,'status',r.status,'payment_status',r.payment_status,
            'partner_payment_status',r.partner_payment_status,'created_at',r.created_at
        ) ORDER BY r.created_at,r.id) FROM public.event_registrations r WHERE r.event_id=c.id),'[]'::jsonb),
        'players',COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'id',p.id,'name',p.name,'email',p.email,'points',p.points,'rankings',p.rankings,
            'preferred_ranking',p.preferred_ranking,'active_ranking_label',p.active_ranking_label,
            'gender',p.gender,'rank_label',p.rank_label,
            'license_type',p.license_type,'paid_registration',p.paid_registration,
            'temporary_licenses',COALESCE((SELECT jsonb_agg(jsonb_build_object('event_id',t.event_id))
                FROM public.temporary_licenses t WHERE t.player_id=p.id AND t.event_id=c.id AND t.revoked_at IS NULL),'[]'::jsonb)
        )) FROM public.players p WHERE EXISTS (SELECT 1 FROM public.event_registrations r
            WHERE r.event_id=c.id AND lower(trim(p.email)) IN (lower(trim(r.email)),lower(trim(r.partner_email))))),'[]'::jsonb),
        'play_days',COALESCE((SELECT jsonb_agg(to_jsonb(d)) FROM public.event_play_days d WHERE d.event_id=c.id),'[]'::jsonb),
        'ranking_tiers',COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.ranking_tiers t),'[]'::jsonb),
        'ranking_points_table',COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.ranking_points_table t),'[]'::jsonb)
    ) INTO snapshot FROM public.calendar c WHERE c.id=p_event_id AND c.is_manual;
    IF snapshot IS NULL THEN RAISE EXCEPTION 'Choose an existing native event'; END IF;
    RETURN snapshot;
END;
$function$;
REVOKE ALL ON FUNCTION public.private_draw_rehearsal_snapshot(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.private_draw_rehearsal_snapshot(bigint) TO authenticated, service_role;
