-- Move a whole team (or a solo) in one transaction. A full target must never
-- strand entries in temporary divisions or leave their old partner unlinked.
CREATE OR REPLACE FUNCTION private.move_registration_division(
    p_registration_ids uuid[], p_target_division_id uuid, p_reset_payment boolean DEFAULT true
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    source public.event_registrations;
    entry public.event_registrations;
    teammate public.event_registrations;
    target public.tournament_divisions;
    source_fee numeric;
    locked_event_id bigint;
    service_caller boolean := current_setting('request.jwt.claim.role', true) = 'service_role'
        OR COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '') = 'service_role';
BEGIN
    IF cardinality(p_registration_ids) NOT BETWEEN 1 AND 2
        OR cardinality(p_registration_ids) <> (SELECT count(DISTINCT id) FROM unnest(p_registration_ids) id) THEN
        RAISE EXCEPTION 'Choose one entry or one linked team';
    END IF;
    SELECT * INTO source FROM public.event_registrations WHERE id = p_registration_ids[1];
    IF source.id IS NULL THEN RAISE EXCEPTION 'Registration not found'; END IF;
    IF NOT COALESCE(service_caller, false) AND (auth.uid() IS NULL OR NOT COALESCE(public.can_manage_event(source.event_id), false)) THEN
        RAISE EXCEPTION 'You cannot manage entries for this event';
    END IF;
    IF NOT COALESCE(service_caller, false) AND NOT p_reset_payment THEN
        RAISE EXCEPTION 'A verified checkout is required to preserve payment on a higher-priced move';
    END IF;
    locked_event_id := source.event_id;
    PERFORM 1 FROM public.calendar WHERE id = locked_event_id FOR UPDATE;
    PERFORM 1 FROM public.event_registrations WHERE event_id = source.event_id ORDER BY id FOR UPDATE;
    SELECT * INTO source FROM public.event_registrations WHERE id = p_registration_ids[1];
    IF source.id IS NULL OR source.event_id IS DISTINCT FROM locked_event_id THEN
        RAISE EXCEPTION 'The entry changed events. Refresh and try again';
    END IF;
    SELECT * INTO target FROM public.tournament_divisions WHERE id = p_target_division_id AND event_id = source.event_id;
    IF target.id IS NULL OR to_jsonb(target)->>'cancelled_at' IS NOT NULL OR to_jsonb(target)->>'is_active' = 'false' THEN RAISE EXCEPTION 'Choose an available target division'; END IF;
    IF (SELECT count(*) FROM public.event_registrations WHERE id = ANY(p_registration_ids)
        AND event_id = source.event_id AND lower(COALESCE(status, '')) <> 'withdrawn'
        AND (division_id IS NOT DISTINCT FROM source.division_id)
        AND (source.division_id IS NOT NULL OR division = source.division)) <> cardinality(p_registration_ids) THEN
        RAISE EXCEPTION 'The selected entries have changed. Refresh and try again';
    END IF;
    IF cardinality(p_registration_ids) = 2 THEN
        SELECT * INTO teammate FROM public.event_registrations WHERE id = p_registration_ids[2];
        IF lower(trim(COALESCE(source.partner_email, ''))) <> lower(trim(teammate.email))
            AND lower(trim(COALESCE(teammate.partner_email, ''))) <> lower(trim(source.email)) THEN
            RAISE EXCEPTION 'Choose a linked team';
        END IF;
    END IF;
    SELECT COALESCE(entry_fee, 0) INTO source_fee FROM public.tournament_divisions
    WHERE event_id = source.event_id AND (id = source.division_id OR (source.division_id IS NULL AND name = source.division)) LIMIT 1;
    FOR entry IN SELECT * FROM public.event_registrations WHERE id = ANY(p_registration_ids) ORDER BY id LOOP
        IF EXISTS (SELECT 1 FROM public.event_registrations r WHERE r.event_id = source.event_id
            AND r.id <> ALL(p_registration_ids) AND lower(COALESCE(r.status, '')) <> 'withdrawn'
            AND (r.division_id = target.id OR (r.division_id IS NULL AND lower(trim(r.division)) = lower(trim(target.name))))
            AND lower(trim(r.email)) = lower(trim(entry.email))) THEN
            RAISE EXCEPTION '% is already entered in %', entry.full_name, target.name;
        END IF;
        UPDATE public.event_registrations SET division = '__archived__/' || id::text, division_id = NULL
        WHERE event_id = source.event_id AND division = target.name AND lower(trim(email)) = lower(trim(entry.email))
            AND lower(COALESCE(status, '')) = 'withdrawn';
    END LOOP;
    UPDATE public.event_registrations r SET partner_name = NULL, partner_email = NULL, partner_payment_status = NULL
    WHERE r.event_id = source.event_id AND r.id <> ALL(p_registration_ids)
        AND (r.division_id IS NOT DISTINCT FROM source.division_id)
        AND (source.division_id IS NOT NULL OR r.division = source.division)
        AND lower(trim(r.partner_email)) IN (SELECT lower(trim(email)) FROM public.event_registrations WHERE id = ANY(p_registration_ids));
    FOR entry IN SELECT * FROM public.event_registrations WHERE id = ANY(p_registration_ids) ORDER BY id LOOP
        SELECT * INTO teammate FROM public.event_registrations WHERE id = ANY(p_registration_ids) AND id <> entry.id LIMIT 1;
        UPDATE public.event_registrations SET division_id = target.id, division = target.name, registered_by = entry.email,
            partner_name = teammate.full_name, partner_email = teammate.email,
            partner_payment_status = CASE WHEN p_reset_payment AND target.entry_fee > COALESCE(source_fee, 0) AND teammate.payment_status = 'paid' THEN 'pending' ELSE teammate.payment_status END,
            payment_status = CASE WHEN p_reset_payment AND target.entry_fee > COALESCE(source_fee, 0) AND entry.payment_status = 'paid' THEN 'pending' ELSE entry.payment_status END
        WHERE id = entry.id;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_registration_division(p_registration_ids uuid[], p_target_division_id uuid, p_reset_payment boolean DEFAULT true)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
    SELECT private.move_registration_division(p_registration_ids, p_target_division_id, p_reset_payment);
$$;
REVOKE ALL ON FUNCTION private.move_registration_division(uuid[],uuid,boolean), public.move_registration_division(uuid[],uuid,boolean) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.move_registration_division(uuid[],uuid,boolean), public.move_registration_division(uuid[],uuid,boolean) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
