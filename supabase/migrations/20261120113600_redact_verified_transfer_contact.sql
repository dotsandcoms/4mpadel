BEGIN;

-- The original payer can read their receipt. The current entrant's contact is
-- needed for the private transfer authority, but it is not part of the receipt.
CREATE OR REPLACE FUNCTION private.project_verified_payment_entry_transfers()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    aliases jsonb;
BEGIN
    IF jsonb_typeof(new.metadata) = 'object' THEN
        new.metadata := new.metadata - 'verified_entry_transfers';
    END IF;
    IF tg_op = 'UPDATE' THEN
        SELECT jsonb_agg(jsonb_build_object(
            'registration_id', t.registration_id, 'cover_position', t.cover_position,
            'event_id', t.event_id, 'division_id', t.division_id, 'division', t.division
        ) ORDER BY t.cover_position) INTO aliases
        FROM private.verified_payment_entry_transfers t WHERE t.payment_id = new.id AND t.event_id = new.event_id;
        IF aliases IS NOT NULL AND EXISTS (
            SELECT 1 FROM private.event_checkout_security_quotes q WHERE q.payment_id = new.id
              AND q.cart_hash = sha256(convert_to(private.checkout_cart(new)::text, 'UTF8'))
        ) THEN
            new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object('verified_entry_transfers', aliases);
        END IF;
    END IF;
    RETURN new;
END;
$$;

UPDATE public.payments SET metadata = metadata
WHERE jsonb_path_exists(metadata, '$.verified_entry_transfers[*].email');

COMMIT;
