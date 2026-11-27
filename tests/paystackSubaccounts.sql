-- Run only against the fresh disposable fourm_paystack_routing_test database.
\set ON_ERROR_STOP on
DO $$ BEGIN
    IF current_database()<>'fourm_paystack_routing_test' OR EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public') THEN
        RAISE EXCEPTION 'Use the empty disposable fourm_paystack_routing_test database';
    END IF;
END $$;
\ir fixtures/banking-database.sql
CREATE SCHEMA private;
ALTER TABLE public.calendar
    ADD COLUMN is_manual boolean, ADD COLUMN payment_method text, ADD COLUMN allow_payments boolean,
    ADD COLUMN start_date date, ADD COLUMN end_date date, ADD COLUMN event_status text, ADD COLUMN registration_opens_at timestamptz;
CREATE TABLE public.players(id bigint PRIMARY KEY, email text);
CREATE TABLE public.tournament_divisions(id uuid PRIMARY KEY, event_id bigint, entry_fee numeric);
CREATE TABLE public.event_registrations(id uuid PRIMARY KEY, event_id bigint, email text, division_id uuid, division text,
    status text, payment_status text, refund_amount numeric, refunded_at timestamptz, created_at timestamptz DEFAULT now());
CREATE TABLE public.payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), player_id bigint, event_id bigint, amount numeric,
    currency text DEFAULT 'ZAR', status text DEFAULT 'processing', payment_type text DEFAULT 'event_entry_fee',
    payment_method text DEFAULT 'paystack', reference text UNIQUE, is_test boolean DEFAULT false, metadata jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT clock_timestamp());
CREATE TABLE public.payment_refunds(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_id uuid, event_registration_id uuid,
    paystack_reference text, amount numeric, currency text DEFAULT 'ZAR', status text DEFAULT 'pending',
    reason text DEFAULT 'admin_removal', metadata jsonb DEFAULT '{}', processed_at timestamptz, paystack_refund_id text);
CREATE TABLE public.commerce_config(id text, event_fee_percent numeric);
INSERT INTO public.commerce_config VALUES('default',2);
CREATE TABLE private.event_checkout_security_quotes(payment_id uuid PRIMARY KEY, original_amount numeric,
    required_amount numeric, license_amount numeric);
CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt()->>'email' $$;
CREATE FUNCTION private.permission_actor_active() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT auth.uid() IS NOT NULL $$;
CREATE FUNCTION private.finance_event(bigint) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT public.is_super_admin(auth.email()) $$;
CREATE FUNCTION private.worker_write() RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT current_setting('role',true) IN ('service_role','none')
$$;
CREATE FUNCTION private.current_entry_fee(bigint,uuid,text) RETURNS numeric LANGUAGE sql STABLE AS $$
    SELECT coalesce((SELECT entry_fee FROM public.tournament_divisions WHERE id=$2 AND event_id=$1),500)
$$;
CREATE FUNCTION private.fixture_checkout_quote() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO private.event_checkout_security_quotes VALUES (new.id,new.amount,new.amount,
        CASE WHEN new.metadata->'covers' @> '[{"type":"license"}]' THEN 100 ELSE 0 END);
    RETURN new;
END $$;
CREATE TRIGGER fixture_checkout_quote AFTER INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION private.fixture_checkout_quote();
CREATE SCHEMA banking_private;
CREATE TABLE banking_private.payout_requests(event_id bigint, amount numeric);
GRANT INSERT ON public.payments TO authenticated;

\ir ../supabase/migrations/20261126102552_organisation_paystack_subaccounts.sql
\ir ../supabase/migrations/20261127092020_isolate_organisation_paystack_checkout.sql

CREATE FUNCTION pg_temp.expect(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', message; END IF; END $$;
CREATE FUNCTION pg_temp.reject(command text, expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    BEGIN EXECUTE command;
    EXCEPTION WHEN OTHERS THEN
        IF position(expected IN SQLERRM)>0 THEN RETURN; END IF;
        RAISE;
    END;
    RAISE EXCEPTION 'Expected rejection: %', expected;
END $$;

INSERT INTO public.organisations VALUES ('a0000000-0000-0000-0000-000000000001','SA Grand','approved'),
    ('a0000000-0000-0000-0000-000000000002','Another organisation','approved');
INSERT INTO public.organisation_members VALUES ('a0000000-0000-0000-0000-000000000001','owner@test.invalid','owner'),
    ('a0000000-0000-0000-0000-000000000002','other@test.invalid','admin');
INSERT INTO public.admin_sidebar_permissions VALUES ('finance@test.invalid','super_admin');
INSERT INTO public.players VALUES (1,'payer@test.invalid');
INSERT INTO public.calendar(id,organisation_id,event_name,is_manual,payment_method,start_date,registration_opens_at)
VALUES (1,'a0000000-0000-0000-0000-000000000001','Pilot',true,'platform',current_date+7,now()+interval '2 days'),
       (2,'a0000000-0000-0000-0000-000000000001','Legacy',true,'platform',current_date+7,now()+interval '2 days'),
       (3,'a0000000-0000-0000-0000-000000000002','Other',true,'platform',current_date+7,now()+interval '2 days');
SELECT pg_temp.expect(NOT has_function_privilege('authenticated','public.manage_paystack_subaccounts(text,uuid,jsonb,uuid)','execute')
    AND NOT has_table_privilege('authenticated','private.organisation_paystack_accounts','select')
    AND NOT has_function_privilege('authenticated','public.verify_paystack_organisation_split(text,jsonb)','execute'),
    'configuration, private mapping and gateway verification are restricted');

SELECT pg_temp.expect((SELECT bool_and(NOT paystack_subaccount_checkout) FROM public.calendar),
    'all events use the existing checkout with zero subaccounts');
UPDATE public.calendar SET paystack_subaccount_checkout=true WHERE id=3;
SELECT pg_temp.expect((SELECT NOT paystack_subaccount_checkout FROM public.calendar WHERE id=3), 'calendar writers cannot opt in outside Finance');
INSERT INTO public.payments(event_id,amount,reference,metadata) VALUES(3,500,'LEGACY-NO-ACCOUNT',NULL);
SELECT pg_temp.expect((SELECT metadata IS NULL FROM public.payments WHERE reference='LEGACY-NO-ACCOUNT'), 'unconfigured payments keep their original metadata');

SET ROLE service_role;
SELECT public.manage_paystack_subaccounts('save','a0000000-0000-0000-0000-000000000001',
    '{"code":"ACCT_pilot","providerId":12,"domain":"live","businessName":"SA Grand","lastFour":"1234"}',
    'c0000000-0000-0000-0000-000000000001');
SELECT pg_temp.expect(public.paystack_split_staff_permission(1,'owner@test.invalid') IS NULL, 'saving leaves routing off');
SELECT pg_temp.expect((public.manage_paystack_subaccounts('events','a0000000-0000-0000-0000-000000000001')->'events'->0->>'status')='off',
    'saving a verified account does not enable tournament routing');
SELECT pg_temp.reject($$SELECT public.manage_paystack_subaccounts('save','a0000000-0000-0000-0000-000000000002',
    '{"code":"ACCT_pilot","providerId":12,"domain":"live","businessName":"Another organisation"}',
    'c0000000-0000-0000-0000-000000000001')$$, 'already linked');
SELECT public.manage_paystack_subaccounts('save','a0000000-0000-0000-0000-000000000002',
    '{"code":"ACCT_other","providerId":22,"domain":"live","businessName":"Another organisation"}',
    'c0000000-0000-0000-0000-000000000001');
SELECT public.manage_paystack_subaccounts('enable','a0000000-0000-0000-0000-000000000001',
    jsonb_build_object('eventId',1,'verifiedCode','ACCT_pilot','verifiedVersion',
        public.manage_paystack_subaccounts('events','a0000000-0000-0000-0000-000000000001')->'account'->>'updated_at'));
SELECT pg_temp.expect(public.paystack_split_staff_permission(1,'owner@test.invalid')
    AND NOT public.paystack_split_staff_permission(1,'other@test.invalid')
    AND public.paystack_split_staff_permission(2,'owner@test.invalid') IS NULL, 'permission and activation per tournament');
RESET ROLE;
SELECT pg_temp.expect((SELECT array_agg(id ORDER BY id) FROM public.calendar WHERE paystack_subaccount_checkout)=ARRAY[1]::bigint[],
    'only the selected tournament is marked for subaccount checkout');
UPDATE public.calendar SET paystack_subaccount_checkout=false WHERE id=1;
SELECT pg_temp.expect((SELECT paystack_subaccount_checkout FROM public.calendar WHERE id=1), 'calendar writers cannot bypass a selected route');
INSERT INTO public.payments(event_id,amount,reference) VALUES(2,500,'LEGACY-SAME-ACCOUNT'),(3,500,'LEGACY-OTHER-ACCOUNT');
SELECT pg_temp.expect((SELECT count(*)=0 FROM public.payments WHERE reference LIKE 'LEGACY-%' AND metadata ? 'organisation_paystack_required'),
    'other events retain the same routing even if both organisations have subaccounts');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"d0000000-0000-0000-0000-000000000001","email":"payer@test.invalid"}',false);
SELECT pg_temp.expect(NOT public.can_manage_paystack_subaccounts(), 'player cannot manage routing');
SELECT pg_temp.reject($$INSERT INTO public.payments(event_id,amount,reference) VALUES(1,500,'DIRECT-ONE')$$, 'secure checkout');
SELECT pg_temp.expect(public.prepare_web_paystack_split('{"event_id":2}') = '{"legacy":true}', 'other tournaments use legacy checkout');
SELECT pg_temp.expect(public.prepare_web_paystack_split('{"event_id":1,"metadata":{"covers":[{"type":"entry","event_id":2}]}}') = '{"legacy":true}',
    'a weekly cart of other dates keeps its existing checkout when opened from a routed date');
SELECT public.prepare_web_paystack_split('{"event_id":1,"amount":610,"reference":"TEST-ROUTED","metadata":{"source":"manual_event",
    "registrant_email":"payer@test.invalid","covers":[{"type":"entry","email":"payer@test.invalid","division":"Open"},{"type":"license"}]}}')->>'paymentId' AS payment_id \gset
SELECT public.prepare_web_paystack_split('{"event_id":1,"amount":1000,"reference":"TEST-MIXED-EVENTS","metadata":{"source":"manual_event",
    "registrant_email":"payer@test.invalid","covers":[{"type":"entry","event_id":1,"email":"payer@test.invalid","division":"Open"},{"type":"entry","event_id":2,"email":"payer@test.invalid","division":"Open"}]}}')->>'paymentId' AS mixed_payment_id \gset
RESET ROLE;
SELECT pg_temp.expect((SELECT metadata->>'organisation_paystack_required'='true' FROM public.payments WHERE reference='TEST-ROUTED'),
    'server marks eligible checkout before contacting Paystack');
SELECT pg_temp.reject(format('SELECT public.prepare_paystack_split(%L,true)', :'mixed_payment_id'), 'separately');
SELECT pg_temp.reject(format('SELECT public.prepare_paystack_split(%L,false)', :'payment_id'), 'payments are paused');
SELECT pg_temp.expect(public.prepare_paystack_split(:'payment_id',true)->>'retained_cents'='11000', 'licence and management fee retained separately');
SELECT pg_temp.reject($$UPDATE public.payments SET status='success' WHERE reference='TEST-ROUTED'$$, 'must be verified');
SELECT pg_temp.expect(public.verify_paystack_organisation_split('TEST-ROUTED',
    '{"reference":"TEST-ROUTED","amount":61000,"domain":"live","currency":"ZAR","status":"success",
      "subaccount":{"subaccount_code":"ACCT_wrong"},"fees_split":{"integration":11000,"paystack":1500,"subaccount":48500}}')='review',
    'wrong provider account pauses checkout');
SELECT pg_temp.expect((SELECT paused FROM private.event_paystack_routes WHERE event_id=1), 'mismatch pauses tournament');
SELECT pg_temp.expect((SELECT paystack_subaccount_checkout FROM public.calendar WHERE id=1), 'paused tournament cannot fall back to 4M');
SELECT pg_temp.expect(public.verify_paystack_organisation_split('TEST-ROUTED',
    '{"reference":"TEST-ROUTED","amount":61000,"domain":"live","currency":"ZAR","status":"success",
      "subaccount":{"subaccount_code":"ACCT_pilot"},"fees_split":{"integration":11000,"paystack":1500,"subaccount":48500}}')='verified',
    'correct Paystack shares match the pinned destination');
UPDATE public.payments SET status='success' WHERE reference='TEST-ROUTED';
SELECT pg_temp.expect((SELECT (metadata->'organisation_paystack'->>'net_cents')::int=48500 FROM public.payments
    WHERE reference='TEST-ROUTED'), 'finance receives verified allocation');
SELECT pg_temp.reject($$INSERT INTO banking_private.payout_requests VALUES(1,1)$$, 'held by 4M');
SELECT public.manage_paystack_subaccounts('save','a0000000-0000-0000-0000-000000000001',
    jsonb_build_object('code','ACCT_replacement','providerId',23,'domain','live','businessName','SA Grand','expectedVersion',
        public.manage_paystack_subaccounts('events','a0000000-0000-0000-0000-000000000001')->'account'->>'updated_at'),
    'c0000000-0000-0000-0000-000000000001');
SELECT pg_temp.expect((SELECT code FROM private.payment_paystack_splits WHERE reference='TEST-ROUTED')='ACCT_pilot',
    'replacement preserves prior destination');
SELECT pg_temp.reject($$SELECT public.manage_paystack_subaccounts('save','a0000000-0000-0000-0000-000000000002',
    jsonb_build_object('code','ACCT_pilot','providerId',12,'domain','live','businessName','Another organisation','expectedVersion',
        public.manage_paystack_subaccounts('events','a0000000-0000-0000-0000-000000000002')->'account'->>'updated_at'),
    'c0000000-0000-0000-0000-000000000001')$$, 'already linked');

INSERT INTO public.event_registrations(id,event_id,email,status,payment_status)
VALUES ('b0000000-0000-0000-0000-000000000001',1,'payer@test.invalid','registered','paid');
INSERT INTO public.payment_refunds(id,payment_id,event_registration_id,paystack_reference,amount)
VALUES ('a0000000-0000-0000-0000-000000000099',:'payment_id','b0000000-0000-0000-0000-000000000001','TEST-ROUTED',250),
    ('a0000000-0000-0000-0000-000000000098',:'payment_id','b0000000-0000-0000-0000-000000000001','TEST-ROUTED',250);
SELECT pg_temp.reject($$SELECT public.claim_paystack_split_refund('TEST-ROUTED','a0000000-0000-0000-0000-000000000099',25000,false)$$, 'funding review');
SELECT pg_temp.expect(public.claim_paystack_split_refund('TEST-ROUTED','a0000000-0000-0000-0000-000000000099',25000,true)
    = public.claim_paystack_split_refund('TEST-ROUTED','a0000000-0000-0000-0000-000000000099',25000,true), 'retry reuses stable reference');
SELECT pg_temp.reject($$SELECT public.claim_paystack_split_refund('TEST-ROUTED','a0000000-0000-0000-0000-000000000098',25000,true)$$, 'already recorded');
SELECT pg_temp.expect(public.apply_paystack_split_refund('a0000000-0000-0000-0000-000000000099',
    '{"reference":"ORGREF-a0000000-0000-0000-0000-000000000099","transaction_reference":"TEST-ROUTED",
      "domain":"live","currency":"ZAR","amount":25000,"id":867}','processed'), 'process exact refund webhook');
SELECT pg_temp.expect(NOT public.apply_paystack_split_refund('a0000000-0000-0000-0000-000000000099',
    '{"reference":"ORGREF-a0000000-0000-0000-0000-000000000099","transaction_reference":"TEST-ROUTED",
      "domain":"live","currency":"ZAR","amount":25000,"id":867}','processing'), 'never regress completed refund');
SELECT pg_temp.expect((SELECT payment_status FROM public.event_registrations
    WHERE id='b0000000-0000-0000-0000-000000000001')='paid', 'a late refund preserves a paid re-entry');
SELECT 'Paystack subaccount DB checks passed' AS result;
