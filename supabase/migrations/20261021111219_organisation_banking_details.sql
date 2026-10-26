-- Payout bank details are NEVER stored on the public organisations/calendar rows.
-- All data access is through an authenticated RPC; the private tables have no API grants.
BEGIN;
CREATE SCHEMA IF NOT EXISTS banking_private;
REVOKE ALL ON SCHEMA banking_private FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA banking_private TO authenticated;

CREATE TABLE banking_private.accounts (
    organisation_id uuid PRIMARY KEY REFERENCES public.organisations(id) ON DELETE CASCADE,
    version uuid NOT NULL DEFAULT gen_random_uuid(),
    encrypted_details bytea NOT NULL,
    last_four text NOT NULL CHECK (last_four ~ '^[0-9]{4}$'),
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid NOT NULL
);
CREATE TABLE banking_private.payout_requests (
    id uuid PRIMARY KEY,
    organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
    event_id bigint NOT NULL REFERENCES public.calendar(id) ON DELETE CASCADE,
    amount numeric(14,2) NOT NULL CHECK (amount > 0 AND amount <= 99999999.99),
    account_version uuid NOT NULL,
    encrypted_details bytea NOT NULL,
    last_four text NOT NULL,
    requested_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
    resolved_at timestamptz,
    resolved_by uuid
);
CREATE UNIQUE INDEX one_pending_payout_per_event ON banking_private.payout_requests(event_id) WHERE status = 'pending';
CREATE INDEX payout_requests_org ON banking_private.payout_requests(organisation_id, created_at DESC);
CREATE TABLE banking_private.audit (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organisation_id uuid NOT NULL,
    request_id uuid,
    actor_id uuid NOT NULL,
    action text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX banking_audit_org ON banking_private.audit(organisation_id, created_at DESC);
ALTER TABLE banking_private.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE banking_private.payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE banking_private.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA banking_private FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA banking_private FROM PUBLIC, anon, authenticated, service_role;
-- No RLS policies: only the narrowly scoped function owner can access these tables.

-- The randomly generated encryption key stays in Supabase Vault. Never return it
-- from an RPC, put it in a VITE_* variable, or write it to logs/source control.
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'organisation_payout_banking_v1') THEN
        PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'organisation_payout_banking_v1', 'Private organisation payout encryption key v1');
    END IF;
END $$;

CREATE FUNCTION banking_private.manage(p_action text, p_org_id uuid, p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_actor uuid := auth.uid();
    v_email text;
    v_super boolean;
    v_org uuid := p_org_id;
    v_request banking_private.payout_requests%ROWTYPE;
    v_account banking_private.accounts%ROWTYPE;
    v_details jsonb;
    v_key text;
    v_result jsonb;
    v_version uuid;
    v_event bigint;
    v_amount numeric;
    v_id uuid;
    v_status text;
    v_recent_mfa boolean;
BEGIN
    PERFORM set_config('response.headers', '[{"Cache-Control":"no-store, private"},{"Pragma":"no-cache"}]', true);
    -- Validate against live Auth state, including revoked/deleted sessions.
    SELECT lower(u.email) INTO v_email FROM auth.users u
    JOIN auth.sessions s ON s.user_id = u.id
    WHERE u.id = v_actor AND u.deleted_at IS NULL AND u.email_confirmed_at IS NOT NULL
      AND NOT coalesce(u.is_anonymous, false)
      AND (u.banned_until IS NULL OR u.banned_until < now())
      AND s.id::text = (auth.jwt()->>'session_id')
      AND (s.not_after IS NULL OR s.not_after > now());
    IF v_email IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sign in again to access banking.';
    END IF;
    v_super := coalesce(public.is_super_admin(v_email), false);
    IF p_action IS NULL OR p_action NOT IN ('summary','save','remove','request','list','reveal','resolve','notification') THEN
        RAISE EXCEPTION 'Unknown banking action.';
    END IF;
    IF p_action IN ('reveal','resolve','notification') THEN
        SELECT * INTO v_request FROM banking_private.payout_requests WHERE id = (p_data->>'request_id')::uuid;
        IF NOT FOUND THEN RAISE EXCEPTION 'Payout request not found.'; END IF;
        v_org := v_request.organisation_id;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.organisations o WHERE o.id = v_org)
       OR NOT (v_super OR EXISTS (
            SELECT 1 FROM public.organisation_members m
            WHERE m.organisation_id = v_org AND lower(m.user_email) = v_email AND m.role IN ('owner','admin')
       )) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only organisation owners, admins and 4M super admins can access banking.';
    END IF;
    IF p_action IN ('reveal','resolve') AND NOT v_super THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only 4M super admins can process payouts.';
    END IF;
    IF p_action IS NULL OR p_action NOT IN ('summary','list') THEN
        -- A refreshed token alone is insufficient: require an actual recent MFA challenge.
        SELECT auth.jwt()->>'aal' = 'aal2' AND EXISTS (
            SELECT 1 FROM auth.sessions s JOIN auth.mfa_factors f ON f.id=s.factor_id AND f.user_id=s.user_id
            WHERE s.id::text=auth.jwt()->>'session_id' AND s.user_id=v_actor
              AND f.factor_type='totp' AND f.status='verified'
        ) AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) amr
            WHERE amr->>'method' IN ('totp','mfa/totp')
              AND (amr->>'timestamp')::numeric BETWEEN extract(epoch FROM now()) - 300 AND extract(epoch FROM now()) + 30
        ) INTO v_recent_mfa;
        IF NOT coalesce(v_recent_mfa, false) THEN
            RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MFA_REQUIRED: Verify an authenticator code to continue.';
        END IF;
    END IF;
    -- Serialise bank changes and request snapshots for this organisation.
    PERFORM pg_advisory_xact_lock(hashtextextended(v_org::text, 0));
    IF p_action IN ('reveal','resolve','notification') THEN
        SELECT * INTO v_request FROM banking_private.payout_requests WHERE id = v_request.id;
    END IF;
    SELECT * INTO v_account FROM banking_private.accounts WHERE organisation_id = v_org;
    IF p_action = 'list' THEN
        SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'event_id',r.event_id,'event_name',c.event_name,
            'amount',r.amount,'last_four',r.last_four,'created_at',r.created_at,'status',r.status,
            'account_changed',v_account.version IS DISTINCT FROM r.account_version) ORDER BY r.created_at DESC),'[]'::jsonb)
        INTO v_result FROM banking_private.payout_requests r JOIN public.calendar c ON c.id=r.event_id
        WHERE r.organisation_id=v_org AND (p_data->>'event_id' IS NULL OR r.event_id=(p_data->>'event_id')::bigint);
        RETURN jsonb_build_object('requests',v_result,'can_process',v_super);
    END IF;
    IF p_action = 'resolve' THEN
        v_status := p_data->>'status';
        IF v_status NOT IN ('paid','cancelled') OR v_status IS NULL THEN RAISE EXCEPTION 'Choose paid or cancelled.'; END IF;
        UPDATE banking_private.payout_requests SET status=v_status,resolved_at=now(),resolved_by=v_actor
        WHERE id=v_request.id AND status='pending';
        IF NOT FOUND THEN RAISE EXCEPTION 'This request has already been processed.'; END IF;
        IF v_status = 'paid' THEN
            -- This records a payment already made outside the app. It never sends
            -- money. Keep the existing event payout ledger/balance in sync.
            UPDATE public.calendar c SET organiser_interim_payments = coalesce(c.organiser_interim_payments,'[]'::jsonb)
                || jsonb_build_array(jsonb_build_object('id',v_request.id,'amount',v_request.amount,
                    'paid_at',(now() AT TIME ZONE 'Africa/Johannesburg')::date,'created_at',now(),
                    'note','Manual payout request '||v_request.id::text))
            WHERE c.id=v_request.event_id AND NOT EXISTS (
                SELECT 1 FROM jsonb_array_elements(coalesce(c.organiser_interim_payments,'[]'::jsonb)) item
                WHERE item->>'id'=v_request.id::text
            );
            SELECT organiser_interim_payments INTO v_result FROM public.calendar WHERE id=v_request.event_id;
        END IF;
        INSERT INTO banking_private.audit(organisation_id,request_id,actor_id,action) VALUES(v_org,v_request.id,v_actor,'request_'||v_status);
        RETURN jsonb_build_object('status',v_status,'interim_payments',v_result);
    END IF;
    IF p_action = 'notification' THEN
        IF NOT v_super AND v_request.requested_by <> v_actor THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Request access denied.'; END IF;
        IF v_request.status <> 'pending' THEN RAISE EXCEPTION 'This request has already been processed.'; END IF;
        SELECT jsonb_build_object('payoutRequestId',v_request.id,'eventId',c.id,'eventName',c.event_name,
            'organiserName',o.name,'amountRequested',v_request.amount,'requestedAt',v_request.created_at)
        INTO v_result FROM public.calendar c JOIN public.organisations o ON o.id=v_org WHERE c.id=v_request.event_id;
        RETURN v_result;
    END IF;
    IF p_action = 'remove' THEN
        IF v_account.version IS DISTINCT FROM (p_data->>'expected_version')::uuid THEN RAISE EXCEPTION 'Banking details changed. Refresh and try again.'; END IF;
        DELETE FROM banking_private.accounts WHERE organisation_id=v_org;
        INSERT INTO banking_private.audit(organisation_id,actor_id,action) VALUES(v_org,v_actor,'account_removed');
        RETURN jsonb_build_object('saved',false,'can_process',v_super);
    END IF;
    IF p_action = 'request' THEN
        v_event := (p_data->>'event_id')::bigint;
        v_amount := (p_data->>'amount')::numeric;
        v_id := (p_data->>'request_id')::uuid;
        IF v_id IS NULL OR v_amount IS NULL OR v_amount <= 0 OR v_amount > 99999999.99 OR v_amount <> round(v_amount,2) THEN
            RAISE EXCEPTION 'Enter a valid payout amount.';
        END IF;
        IF NOT EXISTS(SELECT 1 FROM public.calendar c JOIN public.organisations o ON o.id=c.organisation_id
            WHERE c.id=v_event AND c.organisation_id=v_org AND o.status='approved') THEN
            RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='This event is not linked to an approved organisation.';
        END IF;
        -- Retry with the same id returns the original request without creating another.
        SELECT * INTO v_request FROM banking_private.payout_requests WHERE id=v_id;
        IF FOUND THEN
            IF v_request.requested_by<>v_actor OR v_request.event_id<>v_event OR v_request.organisation_id<>v_org OR v_request.amount<>v_amount THEN
                RAISE EXCEPTION 'Payout request does not match the original request.';
            END IF;
            RETURN jsonb_build_object('request_id',v_id);
        END IF;
        IF v_account.organisation_id IS NULL THEN RAISE EXCEPTION 'Save banking details in Club Settings before requesting a payout.'; END IF;
        IF v_account.version IS DISTINCT FROM (p_data->>'expected_version')::uuid THEN RAISE EXCEPTION 'Banking details changed. Refresh and confirm the new account.'; END IF;
        IF EXISTS (SELECT 1 FROM banking_private.payout_requests WHERE event_id=v_event AND status='pending') THEN RAISE EXCEPTION 'This event already has a pending payout request.'; END IF;
        INSERT INTO banking_private.payout_requests(id,organisation_id,event_id,amount,account_version,encrypted_details,last_four,requested_by)
        VALUES(v_id,v_org,v_event,v_amount,v_account.version,v_account.encrypted_details,v_account.last_four,v_actor);
        INSERT INTO banking_private.audit(organisation_id,request_id,actor_id,action) VALUES(v_org,v_id,v_actor,'payout_requested');
        RETURN jsonb_build_object('request_id',v_id);
    END IF;
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name='organisation_payout_banking_v1';
    IF v_key IS NULL THEN RAISE EXCEPTION 'Secure banking is temporarily unavailable.'; END IF;
    IF p_action = 'save' THEN
        IF EXISTS(SELECT 1 FROM public.organisations WHERE id=v_org AND status IN ('rejected','suspended')) THEN RAISE EXCEPTION 'This organisation cannot update banking.'; END IF;
        IF v_account.version IS DISTINCT FROM (p_data->>'expected_version')::uuid THEN RAISE EXCEPTION 'Banking details changed. Refresh and try again.'; END IF;
        v_details := jsonb_build_object('bank_name',trim(p_data->>'bank_name'),'account_holder',trim(p_data->>'account_holder'),
            'account_number',p_data->>'account_number','branch_code',p_data->>'branch_code','account_type',p_data->>'account_type');
        IF coalesce(length(v_details->>'bank_name'),0) NOT BETWEEN 2 AND 80
          OR coalesce(length(v_details->>'account_holder'),0) NOT BETWEEN 2 AND 120
          OR coalesce(v_details->>'account_number','') !~ '^[0-9]{6,20}$'
          OR coalesce(v_details->>'branch_code','') !~ '^[0-9]{6}$'
          OR coalesce(v_details->>'account_type','') NOT IN ('current','savings','transmission')
          OR (v_details->>'bank_name') ~ '[[:cntrl:]]' OR (v_details->>'account_holder') ~ '[[:cntrl:]]' THEN
            RAISE EXCEPTION 'Check the bank, account holder, account number, 6-digit branch code and account type.';
        END IF;
        v_version := gen_random_uuid();
        v_details := v_details || jsonb_build_object('organisation_id',v_org,'version',v_version);
        INSERT INTO banking_private.accounts(organisation_id,version,encrypted_details,last_four,updated_by)
        VALUES(v_org,v_version,extensions.pgp_sym_encrypt(v_details::text,v_key,'cipher-algo=aes256,compress-algo=0'),right(v_details->>'account_number',4),v_actor)
        ON CONFLICT(organisation_id) DO UPDATE SET version=excluded.version,encrypted_details=excluded.encrypted_details,
            last_four=excluded.last_four,updated_at=now(),updated_by=v_actor;
        INSERT INTO banking_private.audit(organisation_id,actor_id,action) VALUES(v_org,v_actor,'account_saved');
        SELECT * INTO v_account FROM banking_private.accounts WHERE organisation_id=v_org;
    ELSIF p_action = 'reveal' THEN
        IF v_request.status <> 'pending' THEN RAISE EXCEPTION 'Only pending requests can reveal banking details.'; END IF;
        v_details := extensions.pgp_sym_decrypt(v_request.encrypted_details,v_key)::jsonb;
        IF v_details->>'organisation_id' IS DISTINCT FROM v_org::text OR v_details->>'version' IS DISTINCT FROM v_request.account_version::text THEN RAISE EXCEPTION 'Banking snapshot integrity check failed.'; END IF;
        INSERT INTO banking_private.audit(organisation_id,request_id,actor_id,action) VALUES(v_org,v_request.id,v_actor,'banking_revealed');
        RETURN v_details - 'organisation_id' - 'version';
    END IF;
    IF v_account.organisation_id IS NULL THEN RETURN jsonb_build_object('saved',false,'can_process',v_super); END IF;
    v_details := extensions.pgp_sym_decrypt(v_account.encrypted_details,v_key)::jsonb;
    IF v_details->>'organisation_id' IS DISTINCT FROM v_org::text OR v_details->>'version' IS DISTINCT FROM v_account.version::text THEN RAISE EXCEPTION 'Banking integrity check failed.'; END IF;
    RETURN jsonb_build_object('saved',true,'bank_name',v_details->>'bank_name','last_four',v_account.last_four,
        'version',v_account.version,'updated_at',v_account.updated_at,'can_process',v_super);
END $$;
REVOKE ALL ON FUNCTION banking_private.manage(text,uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION banking_private.manage(text,uuid,jsonb) TO authenticated;

-- Invoker wrapper delegates to a fixed, non-exposed, authenticated private endpoint.
CREATE FUNCTION public.organisation_banking(p_action text, p_org_id uuid DEFAULT NULL, p_data jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
    SELECT banking_private.manage(p_action,p_org_id,p_data);
$$;
REVOKE ALL ON FUNCTION public.organisation_banking(text,uuid,jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.organisation_banking(text,uuid,jsonb) TO authenticated;
COMMIT;
