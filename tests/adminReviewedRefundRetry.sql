\set ON_ERROR_STOP on
DO $$ BEGIN IF current_database() <> 'fourm_refund_retry_test' THEN RAISE EXCEPTION 'Use the isolated fourm_refund_retry_test database'; END IF; END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE TABLE public.calendar (id bigint PRIMARY KEY);
CREATE TABLE public.event_registrations (id uuid PRIMARY KEY, event_id bigint REFERENCES calendar, email text, status text, payment_status text, division text, refunded_at timestamptz, refund_amount numeric);
CREATE TABLE public.payments (id uuid PRIMARY KEY, event_id bigint REFERENCES calendar, reference text, payment_method text, status text, amount numeric, metadata jsonb, is_test boolean);
CREATE TABLE public.payment_refunds (
    id uuid PRIMARY KEY, event_registration_id uuid REFERENCES event_registrations, payment_id uuid REFERENCES payments,
    paystack_refund_id text UNIQUE, paystack_reference text, amount numeric NOT NULL, currency text, status text, reason text, metadata jsonb, processed_at timestamptz
);
CREATE TABLE public.players (id bigint PRIMARY KEY, email text);
CREATE TABLE public.temporary_licenses (id bigint PRIMARY KEY, event_id bigint REFERENCES calendar, payment_id uuid REFERENCES payments, player_id bigint REFERENCES players, revoked_at timestamptz);
ALTER TABLE public.payment_refunds ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON ALL TABLES IN SCHEMA public TO service_role;
\ir ../supabase/migrations/20261120112000_reviewed_event_refund_retry.sql
INSERT INTO calendar VALUES (11), (22);
INSERT INTO event_registrations (id,event_id,email,status,payment_status,division,refund_amount) VALUES
 ('11111111-0000-4000-8000-000000000001',11,'match@example.invalid','withdrawn','paid','Open',100),
 ('11111111-0000-4000-8000-000000000002',22,'other@example.invalid','registered','paid','Open',0);
INSERT INTO payments (id,event_id,reference,payment_method,status,amount,metadata,is_test) VALUES
 ('22222222-0000-4000-8000-000000000001',11,'paid-split','paystack','success',200,'{"parent_reference":"confirmed-parent","division_entry_fees":{"Open":100}}',false),
 ('22222222-0000-4000-8000-000000000002',22,'other-event','paystack','success',400,'{}',false),
 ('22222222-0000-4000-8000-000000000003',11,'confirmed-parent','paystack','success',250,'{}',false),
 ('22222222-0000-4000-8000-000000000004',11,'new-annual','paystack','success',200,'{}',false),
 ('22222222-0000-4000-8000-000000000005',11,'entry-only','paystack','success',250,'{"division_entry_fees":{"Open":100}}',false);
INSERT INTO payment_refunds(id,event_registration_id,payment_id,paystack_refund_id,amount,currency,status,reason,metadata) VALUES
 ('33333333-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000001','41',100,'ZAR','failed','admin_removal','{"cover_type":"license","keep":"metadata"}'),
 ('33333333-0000-4000-8000-000000000002','11111111-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000002',null,100,'ZAR','failed','owner_withdraw','{}'),
 ('33333333-0000-4000-8000-000000000003','11111111-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000001',null,70,'ZAR','failed','owner_withdraw','{}'),
 ('33333333-0000-4000-8000-000000000004','11111111-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000001',null,30,'ZAR','processed','admin_removal','{}'),
 ('33333333-0000-4000-8000-000000000005','11111111-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000003',null,60,'ZAR','failed','owner_withdraw','{}'),
 ('33333333-0000-4000-8000-000000000006','11111111-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000001',null,71,'ZAR','failed','owner_withdraw','{}'),
 ('33333333-0000-4000-8000-000000000007','11111111-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000005',null,60,'ZAR','pending','owner_withdraw','{"cover_type":"entry"}'),
 ('33333333-0000-4000-8000-000000000008','11111111-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000005',null,50,'ZAR','failed','owner_withdraw','{"cover_type":"entry"}'),
 ('33333333-0000-4000-8000-000000000009','11111111-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000005',null,40,'ZAR','failed','owner_withdraw','{"cover_type":"entry"}');
INSERT INTO players VALUES (1,'match@example.invalid');
INSERT INTO temporary_licenses VALUES
 (1,11,'22222222-0000-4000-8000-000000000003',1,null),
 (2,11,'22222222-0000-4000-8000-000000000004',1,null);

DO $$ BEGIN
  IF has_function_privilege('authenticated','public.claim_event_refund_retry(uuid,bigint,uuid,uuid,numeric,text,text,text,text,text,bigint,text,text,boolean)','EXECUTE')
     OR has_function_privilege('anon','public.apply_event_refund_retry_evidence(uuid,bigint,uuid,text,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Refund RPCs leaked to Data API clients';
  END IF;
END $$;
SET ROLE service_role;
DO $$
DECLARE
  refund constant uuid := '33333333-0000-4000-8000-000000000001';
  reg constant uuid := '11111111-0000-4000-8000-000000000001';
  payment constant uuid := '22222222-0000-4000-8000-000000000001';
  claim jsonb;
  result jsonb;
  id text;
BEGIN
  IF public.claim_event_refund_retry(refund,22,reg,payment,100,'41',null,'paystack','confirmed-parent','125',25000,'live','synthetic',false) IS NOT NULL THEN
    RAISE EXCEPTION 'wrong event was claimed'; END IF;
  IF public.claim_event_refund_retry('33333333-0000-4000-8000-000000000002',11,reg,'22222222-0000-4000-8000-000000000002',100,null,null,'paystack','confirmed-parent','125',25000,'live','synthetic',false) IS NOT NULL THEN
    RAISE EXCEPTION 'cross-event payment was claimed'; END IF;
  IF public.claim_event_refund_retry(refund,11,reg,payment,99,'41',null,'paystack','confirmed-parent','125',25000,'live','synthetic',false) IS NOT NULL THEN
    RAISE EXCEPTION 'stale amount was accepted'; END IF;
  claim := public.claim_event_refund_retry(refund,11,reg,payment,100,'41',null,'paystack','confirmed-parent','125',25000,'live','synthetic',false);
  id := claim->>'reference';
  IF claim IS NULL OR id !~ '^4m-refund-[0-9a-f]{32}$' OR claim->>'phase' <> 'held'
      OR (SELECT status FROM payment_refunds WHERE payment_refunds.id = refund) <> 'needs_attention' THEN
    RAISE EXCEPTION 'refund claim failed: %', claim; END IF;
  IF public.claim_event_refund_retry(refund,11,reg,payment,100,null,id,'paystack','confirmed-parent','125',25000,'live','synthetic',false) IS NOT NULL THEN
    RAISE EXCEPTION 'held refund claim could be acquired again'; END IF;
  IF public.apply_event_refund_retry_evidence(refund,11,reg,'4m-refund-wrong','88','processed') IS NOT NULL THEN
    RAISE EXCEPTION 'wrong evidence reference was applied'; END IF;
  result := public.apply_event_refund_retry_evidence(refund,11,reg,id,'88','processing');
  IF result->>'status' <> 'processing' OR (SELECT payment_status FROM event_registrations WHERE event_registrations.id = reg) <> 'paid' THEN
    RAISE EXCEPTION 'queue acknowledgement must not settle the registration: %', result; END IF;
  IF public.apply_event_refund_retry_evidence(refund,11,reg,id,'89','processed') IS NOT NULL THEN
    RAISE EXCEPTION 'wrong provider ID was accepted'; END IF;
  result := public.apply_event_refund_retry_evidence(refund,11,reg,id,'88','processed');
  IF result->>'status' <> 'processed' OR (SELECT refund_amount FROM event_registrations WHERE event_registrations.id = reg) <> 130 THEN
    RAISE EXCEPTION 'settled amount was wrong: %', result; END IF;
  IF (SELECT revoked_at FROM temporary_licenses WHERE temporary_licenses.id = 1) IS NULL
      OR (SELECT revoked_at FROM temporary_licenses WHERE temporary_licenses.id = 2) IS NOT NULL THEN
    RAISE EXCEPTION 'refund did not narrowly revoke its own linked licence'; END IF;
  result := public.apply_event_refund_retry_evidence(refund,11,reg,id,'88','processing');
  IF result->>'status' <> 'processed' OR (SELECT refund_amount FROM event_registrations WHERE event_registrations.id = reg) <> 130 THEN
    RAISE EXCEPTION 'late webhook regressed the status or replayed the balance'; END IF;
  IF (SELECT metadata->>'keep' FROM payment_refunds WHERE payment_refunds.id = refund) <> 'metadata' THEN
    RAISE EXCEPTION 'receipt metadata was discarded'; END IF;

  result := public.claim_event_refund_retry('33333333-0000-4000-8000-000000000006',11,reg,payment,71,null,null,'paystack','confirmed-parent','125',25000,'live','synthetic',false);
  IF result->>'unavailable' IS DISTINCT FROM 'ledger_allowance' THEN RAISE EXCEPTION 'receipt allowance not enforced: %', result; END IF;
  result := public.claim_event_refund_retry('33333333-0000-4000-8000-000000000008',11,reg,'22222222-0000-4000-8000-000000000005',50,null,null,'paystack','entry-only','126',25000,'live','synthetic',false);
  IF result->>'unavailable' IS DISTINCT FROM 'component_allowance' THEN RAISE EXCEPTION 'entry allowance not enforced: %', result; END IF;
  result := public.claim_event_refund_retry('33333333-0000-4000-8000-000000000009',11,reg,'22222222-0000-4000-8000-000000000005',40,null,null,'paystack','entry-only','126',25000,'live','synthetic',false);
  IF result->>'phase' IS DISTINCT FROM 'held' THEN RAISE EXCEPTION 'valid second partial was rejected: %', result; END IF;

  -- A smaller split licence and a larger sibling receipt can both reserve a
  -- valid partial against their respective amounts and the same original charge.
  BEGIN
    result := public.claim_event_refund_retry('33333333-0000-4000-8000-000000000003',11,reg,payment,70,null,null,'paystack','confirmed-parent','125',30000,'live','synthetic',false);
    IF result->>'phase' IS DISTINCT FROM 'held' THEN RAISE EXCEPTION 'valid partial on first receipt failed: %', result; END IF;
    result := public.claim_event_refund_retry('33333333-0000-4000-8000-000000000005',11,reg,'22222222-0000-4000-8000-000000000003',60,null,null,'paystack','confirmed-parent','125',30000,'live','synthetic',false);
    IF result->>'phase' IS DISTINCT FROM 'held' THEN RAISE EXCEPTION 'valid partial on sibling receipt failed: %', result; END IF;
    RAISE SQLSTATE 'P0002';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL;
  END;
END $$;
RESET ROLE;
