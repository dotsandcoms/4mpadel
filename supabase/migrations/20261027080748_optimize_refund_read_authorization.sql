-- Refund policies used to query payments/players through their RLS for every
-- candidate row, recursively expanding event-manager checks until timeout.
-- Check only the linked records under a private, read-only authorization helper.
SET LOCAL lock_timeout = '3s';
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.can_read_payment_refund(
    p_payment_id uuid, p_reference text, p_registration_id uuid, p_initiated_by text
)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    actor_email text := lower(trim(auth.email()));
    linked_payment record;
    linked_registration record;
BEGIN
    IF auth.uid() IS NULL OR NULLIF(actor_email, '') IS NULL
        OR NOT COALESCE(public.account_is_active(), false) THEN
        RETURN false;
    END IF;
    IF public.is_super_admin(auth.email()) THEN RETURN true; END IF;
    IF lower(trim(p_initiated_by)) = actor_email THEN RETURN true; END IF;

    -- Both payment-id and reference-only historical refunds remain visible.
    -- Each lookup is bounded by the payment PK/unique reference indexes.
    FOR linked_payment IN
        SELECT p.event_id, p.player_id, p.metadata
        FROM public.payments p
        WHERE p.id = p_payment_id OR p.reference = NULLIF(p_reference, '')
    LOOP
        IF lower(trim(linked_payment.metadata->>'email')) = actor_email
            OR lower(trim(linked_payment.metadata->>'registrant_email')) = actor_email
            OR EXISTS (SELECT 1 FROM public.players p WHERE p.id = linked_payment.player_id
                AND lower(trim(p.email)) = actor_email)
            OR (linked_payment.event_id IS NOT NULL AND public.can_manage_event(linked_payment.event_id)) THEN
            RETURN true;
        END IF;
    END LOOP;

    SELECT r.event_id, r.email, r.partner_email, r.registered_by
    INTO linked_registration FROM public.event_registrations r WHERE r.id = p_registration_id;
    IF FOUND THEN
        RETURN COALESCE(lower(trim(linked_registration.email)) = actor_email
            OR lower(trim(linked_registration.partner_email)) = actor_email
            OR lower(trim(linked_registration.registered_by)) = actor_email
            OR COALESCE(public.can_manage_event(linked_registration.event_id), false), false);
    END IF;
    RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION private.can_read_payment_refund(uuid,text,uuid,text)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_read_payment_refund(uuid,text,uuid,text) TO authenticated;

DROP POLICY IF EXISTS "Admins can read refunds" ON public.payment_refunds;
DROP POLICY IF EXISTS "Players can read own refunds" ON public.payment_refunds;
DROP POLICY IF EXISTS "Users can read own refunds" ON public.payment_refunds;
CREATE POLICY "Refund owners and event managers read"
ON public.payment_refunds FOR SELECT TO authenticated
USING (private.can_read_payment_refund(payment_id, paystack_reference, event_registration_id, initiated_by));

-- An active-account check is an additional requirement, never an independent
-- permission to read/write every refund. Refund mutations remain server-only.
DROP POLICY IF EXISTS account_must_exist ON public.payment_refunds;
CREATE POLICY account_must_exist ON public.payment_refunds
AS RESTRICTIVE FOR ALL TO authenticated
USING ((SELECT public.account_is_active()))
WITH CHECK ((SELECT public.account_is_active()));
REVOKE INSERT, UPDATE, DELETE ON TABLE public.payment_refunds FROM anon, authenticated;
GRANT SELECT ON TABLE public.payment_refunds TO authenticated;

NOTIFY pgrst, 'reload schema';
