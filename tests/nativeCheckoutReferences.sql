\set ON_ERROR_STOP on
DO $$ BEGIN
    IF current_database() <> 'fourm_native_checkout_test'
       OR to_regclass('public.payments') IS NOT NULL THEN
        RAISE EXCEPTION 'Use an empty disposable fourm_native_checkout_test database';
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
END $$;

CREATE SCHEMA private;
CREATE SCHEMA auth;
CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('test.email', true), '');
$$;
CREATE FUNCTION private.permission_actor_active() RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT auth.email() IS NOT NULL;
$$;
CREATE FUNCTION private.finance_event(bigint) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT $1 = 517 AND auth.email() = 'event-finance@example.test';
$$;
CREATE TABLE public.calendar (id bigint PRIMARY KEY);
CREATE TABLE public.payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), player_id bigint, event_id bigint REFERENCES public.calendar,
    amount numeric, currency text, status text, payment_type text, payment_method text, reference text UNIQUE,
    is_test boolean, metadata jsonb
);
CREATE TABLE public.event_registrations (event_id bigint, email text, division text, status text);
CREATE TABLE private.event_checkout_holds (payment_id uuid REFERENCES public.payments, state text, expires_at timestamptz);

\ir ../supabase/migrations/20261119092755_native_paystack_reference_aliases.sql

BEGIN;
INSERT INTO public.calendar VALUES (517), (518);
DO $$
DECLARE
    old_token constant text := 'MOBILE-40dbeb56-222c0756-5180-4cb4-9bd7-5e6db9a2a647';
    app_token constant text := 'MOBILE-40dbeb56-333c0756-5180-4cb4-9bd7-5e6db9a2a647';
    other_token constant text := 'MOBILE-40dbeb56-444c0756-5180-4cb4-9bd7-5e6db9a2a647';
    receipt constant text := 'MOBILE-ROCKETS-CUP-SAPA-GOLD-1000-17949878596810000000042';
    later_receipt constant text := 'MOBILE-RENAMED-EVENT-17949878596820000000042';
    checkout constant jsonb := '{"source":"manual_event","registrant_email":"player@example.test","covers":[{"type":"entry","email":"player@example.test","event_id":517,"division":"Open"}]}';
    old_payment jsonb;
    new_payment jsonb;
    retry jsonb;
    link jsonb;
    checkout_url text;
    role_name text;
    signature text;
BEGIN
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
        IF has_table_privilege(role_name, 'private.native_checkout_references', 'SELECT,INSERT,UPDATE,DELETE')
            OR has_function_privilege(role_name, 'private.native_checkout_gateway_reference(text)', 'EXECUTE') THEN
            RAISE EXCEPTION '% can access private checkout references', role_name;
        END IF;
        FOREACH signature IN ARRAY ARRAY['resolve_native_checkout_reference(text)',
            'prepare_native_checkout_payment(text,text,bigint,bigint,numeric,boolean,jsonb)',
            'save_native_checkout_url(text,text)'] LOOP
            IF has_function_privilege(role_name, signature, 'EXECUTE') <> (role_name = 'service_role') THEN
                RAISE EXCEPTION 'Unexpected % access to %', role_name, signature;
            END IF;
        END LOOP;
    END LOOP;

    -- Insert a payment the way the old Edge Function did.
    INSERT INTO public.payments (player_id,event_id,amount,currency,status,payment_type,payment_method,reference,is_test,metadata)
    VALUES (1,517,300,'ZAR','processing','event_entry_fee','paystack',old_token,false,
        checkout || jsonb_build_object('reference',old_token,'native_authorization_url','https://checkout.paystack.com/old'))
    RETURNING to_jsonb(payments.*) INTO old_payment;

    SET LOCAL ROLE service_role;
    retry := public.prepare_native_checkout_payment(old_token,receipt,1,517,300,false,checkout);
    IF retry IS DISTINCT FROM old_payment OR public.resolve_native_checkout_reference(old_token) IS NOT NULL THEN
        RAISE EXCEPTION 'A legacy retry must reuse the original payment and checkout URL';
    END IF;
    new_payment := public.prepare_native_checkout_payment(app_token,receipt,1,517,300,false,checkout);
    retry := public.prepare_native_checkout_payment(app_token,later_receipt,1,517,300,false,checkout);
    link := jsonb_build_object('app_reference', app_token, 'gateway_reference', receipt, 'event_id', 517);
    IF retry IS DISTINCT FROM new_payment
        OR public.resolve_native_checkout_reference(app_token) IS DISTINCT FROM link
        OR public.resolve_native_checkout_reference(receipt) IS DISTINCT FROM link
        OR new_payment->'metadata'->>'reference' IS DISTINCT FROM receipt THEN
        RAISE EXCEPTION 'A named retry must keep the same ledger payment and both reference lookups';
    END IF;
    IF public.prepare_native_checkout_payment(app_token,app_token,1,517,300,false,checkout) IS DISTINCT FROM new_payment THEN
        RAISE EXCEPTION 'Disabling named generation must still resolve already-created checkouts';
    END IF;
    BEGIN
        PERFORM public.prepare_native_checkout_payment(other_token,receipt,1,517,300,false,checkout);
        RAISE EXCEPTION 'A conflicting receipt was accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    IF public.resolve_native_checkout_reference(other_token) IS NOT NULL THEN
        RAISE EXCEPTION 'A failed payment insert left an app token behind';
    END IF;
    RESET ROLE;
    UPDATE public.payments SET metadata = metadata || '{"preserve_me":true}' WHERE reference = receipt;
    SET LOCAL ROLE service_role;
    checkout_url := public.save_native_checkout_url(receipt, 'https://checkout.paystack.com/named');
    IF checkout_url IS DISTINCT FROM 'https://checkout.paystack.com/named'
        OR public.save_native_checkout_url(receipt, 'https://checkout.paystack.com/retry') IS DISTINCT FROM checkout_url THEN
        RAISE EXCEPTION 'The first valid authorization URL must be reused';
    END IF;
    RESET ROLE;
    IF (SELECT metadata->'preserve_me' FROM public.payments WHERE reference = receipt) IS DISTINCT FROM 'true'::jsonb THEN
        RAISE EXCEPTION 'Saving the checkout URL overwrote payment metadata';
    END IF;

    INSERT INTO private.event_checkout_holds VALUES
        ((old_payment->>'id')::uuid,'active',now() + interval '30 minutes'),
        ((new_payment->>'id')::uuid,'active',now() + interval '30 minutes');
    SET LOCAL ROLE authenticated;
    PERFORM set_config('test.email', 'unrelated@example.test', true);
    BEGIN
        PERFORM public.event_checkout_state(app_token);
        RAISE EXCEPTION 'An unrelated user could inspect a checkout';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        PERFORM public.cancel_event_checkout(app_token);
        RAISE EXCEPTION 'An unrelated user could cancel a checkout';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    PERFORM set_config('test.email', 'event-finance@example.test', true);
    IF public.event_checkout_state(app_token)->>'state' IS DISTINCT FROM 'awaiting_payment' THEN
        RAISE EXCEPTION 'Event finance access changed';
    END IF;
    PERFORM set_config('test.email', 'player@example.test', true);
    IF public.event_checkout_state(app_token)->>'state' IS DISTINCT FROM 'awaiting_payment'
        OR public.event_checkout_state(receipt) IS DISTINCT FROM public.event_checkout_state(app_token)
        OR public.event_checkout_state(old_token)->>'state' IS DISTINCT FROM 'awaiting_payment' THEN
        RAISE EXCEPTION 'The owner must be able to resume both receipt formats';
    END IF;
    IF public.cancel_event_checkout(app_token)->>'released' IS DISTINCT FROM 'true'
        OR public.event_checkout_state(app_token)->>'state' IS DISTINCT FROM 'expired'
        OR public.event_checkout_state(old_token)->>'state' IS DISTINCT FROM 'awaiting_payment' THEN
        RAISE EXCEPTION 'Cancelling a named checkout must release only its hold';
    END IF;
    RESET ROLE;
    UPDATE public.payments SET status = 'success' WHERE reference = receipt;
    SET LOCAL ROLE authenticated;
    IF public.event_checkout_state(app_token)->>'state' IS DISTINCT FROM 'paid'
        OR public.cancel_event_checkout(app_token)->>'paymentReceived' IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'A completed payment must stay paid';
    END IF;
END $$;
ROLLBACK;
