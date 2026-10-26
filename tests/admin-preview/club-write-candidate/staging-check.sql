-- STAGING ONLY: synthetic assertions against the installed candidate RPCs.
-- Execute this WHOLE file in one connection as the staging migration owner.
-- No migration, delivery worker, email function, or external request is invoked.
-- All rows, temporary functions and failure triggers are rolled back. Failures
-- abort the transaction; the final ROLLBACK also leaves a successful run clean.
-- Inspect staging's triggers before execution: .invalid recipients are a second
-- safeguard, not a substitute for confirming no outbound insert triggers exist.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION pg_temp.club_candidate_fail_outbox() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'Synthetic candidate outbox failure' USING ERRCODE = 'P7777';
END $$;

DO $test$
DECLARE
  actor uuid := gen_random_uuid();
  wrong_actor uuid := gen_random_uuid();
  suffix text := replace(gen_random_uuid()::text, '-', '');
  actor_email text;
  wrong_email text;
  claimant_email text;
  fixture_player_id bigint;
  claim_club uuid := gen_random_uuid();
  null_club uuid := gen_random_uuid();
  failure_club uuid := gen_random_uuid();
  linked_claim uuid := gen_random_uuid();
  null_claim uuid := gen_random_uuid();
  rejected_claim uuid := gen_random_uuid();
  stale_claim uuid := gen_random_uuid();
  failed_claim uuid := gen_random_uuid();
  application_club uuid := gen_random_uuid();
  rejected_application uuid := gen_random_uuid();
  no_email_application uuid := gen_random_uuid();
  failed_application uuid := gen_random_uuid();
  nonpending_application uuid := gen_random_uuid();
  primary_application uuid := gen_random_uuid();
  first_contact_application uuid := gen_random_uuid();
  existing_membership uuid := gen_random_uuid();
  snapshot jsonb;
  null_snapshot jsonb;
  reject_snapshot jsonb;
  stale_snapshot jsonb;
  failure_snapshot jsonb;
  outcome jsonb;
  before_row jsonb;
  application_snapshot jsonb;
  rejection_application_snapshot jsonb;
  no_email_snapshot jsonb;
  failed_application_snapshot jsonb;
  nonpending_snapshot jsonb;
  primary_snapshot jsonb;
  first_contact_snapshot jsonb;
BEGIN
  actor_email := 'candidate-admin-' || suffix || '@example.invalid';
  wrong_email := 'candidate-denied-' || suffix || '@example.invalid';
  claimant_email := 'candidate-player-' || suffix || '@example.invalid';
  -- Explicit ID avoids advancing a live sequence, which ROLLBACK cannot undo.
  fixture_player_id := -(('x' || substr(suffix, 1, 12))::bit(48)::bigint + 1);
  IF EXISTS (SELECT 1 FROM public.players WHERE id = fixture_player_id) THEN
    RAISE EXCEPTION 'Synthetic player ID collision: retry with a new UUID';
  END IF;
  INSERT INTO auth.users(id, email, aud, role, created_at, updated_at)
    VALUES(actor, actor_email, 'authenticated', 'authenticated', now(), now()),
          (wrong_actor, wrong_email, 'authenticated', 'authenticated', now(), now());
  INSERT INTO public.admin_sidebar_permissions(email, role)
    VALUES(actor_email, 'super_admin'), (wrong_email, 'custom');
  INSERT INTO public.players(id, name, email) OVERRIDING SYSTEM VALUE
    VALUES(fixture_player_id, 'Synthetic candidate player', claimant_email);
  INSERT INTO public.clubs(id, name, slug, status, verified, contact_email, created_by)
    VALUES
      (claim_club, 'Synthetic linked claim', 'qa-linked-' || suffix, 'unclaimed', false, NULL, NULL),
      (null_club, 'Synthetic email-only claim', 'qa-null-' || suffix, 'unclaimed', false, NULL, NULL),
      (failure_club, 'Synthetic atomic claim', 'qa-atomic-' || suffix, 'unclaimed', false, NULL, NULL),
      (application_club, 'Synthetic email-only application', 'qa-app-' || suffix, 'in_review', false, 'app-' || suffix || '@example.invalid', NULL),
      (rejected_application, 'Synthetic rejected application', 'qa-reject-' || suffix, 'in_review', false, 'reject-' || suffix || '@example.invalid', NULL),
      (no_email_application, 'Synthetic no-email application', 'qa-no-email-' || suffix, 'in_review', false, NULL, NULL),
      (failed_application, 'Synthetic atomic application', 'qa-app-atomic-' || suffix, 'in_review', false, 'atomic-' || suffix || '@example.invalid', NULL),
      (nonpending_application, 'Synthetic nonpending application', 'qa-notpending-' || suffix, 'published', false, NULL, NULL);
  INSERT INTO public.club_claim_requests(id, club_id, requester_email, requester_player_id, status, full_name)
    VALUES
      (linked_claim, claim_club, claimant_email, fixture_player_id, 'pending', 'Synthetic linked claimant'),
      (null_claim, null_club, 'null-' || suffix || '@example.invalid', NULL, 'pending', 'Synthetic email claimant'),
      (rejected_claim, claim_club, 'claim-reject-' || suffix || '@example.invalid', NULL, 'pending', 'Synthetic rejected claimant'),
      (stale_claim, claim_club, 'stale-' || suffix || '@example.invalid', NULL, 'pending', 'Synthetic stale claimant'),
      (failed_claim, failure_club, 'claim-atomic-' || suffix || '@example.invalid', NULL, 'pending', 'Synthetic atomic claimant');
  SELECT jsonb_build_object('club_id', club_id, 'requester_email', requester_email, 'requester_player_id', requester_player_id, 'status', status, 'full_name', full_name)
    INTO snapshot FROM public.club_claim_requests WHERE id = linked_claim;
  SELECT jsonb_build_object('club_id', club_id, 'requester_email', requester_email, 'requester_player_id', requester_player_id, 'status', status)
    INTO null_snapshot FROM public.club_claim_requests WHERE id = null_claim;
  SELECT jsonb_build_object('club_id', club_id, 'requester_email', requester_email, 'requester_player_id', requester_player_id, 'status', status)
    INTO reject_snapshot FROM public.club_claim_requests WHERE id = rejected_claim;
  SELECT jsonb_build_object('club_id', club_id, 'requester_email', requester_email, 'requester_player_id', requester_player_id, 'status', status, 'full_name', full_name)
    INTO stale_snapshot FROM public.club_claim_requests WHERE id = stale_claim;
  SELECT jsonb_build_object('club_id', club_id, 'requester_email', requester_email, 'requester_player_id', requester_player_id, 'status', status)
    INTO failure_snapshot FROM public.club_claim_requests WHERE id = failed_claim;
  SELECT jsonb_build_object('name', name, 'status', status, 'contact_email', contact_email, 'contacts', contacts, 'created_by', created_by)
    INTO application_snapshot FROM public.clubs WHERE id = application_club;
  SELECT jsonb_build_object('name', name, 'status', status, 'contact_email', contact_email, 'contacts', contacts, 'created_by', created_by)
    INTO rejection_application_snapshot FROM public.clubs WHERE id = rejected_application;
  SELECT jsonb_build_object('name', name, 'status', status, 'contact_email', contact_email, 'contacts', contacts, 'created_by', created_by)
    INTO no_email_snapshot FROM public.clubs WHERE id = no_email_application;
  SELECT jsonb_build_object('name', name, 'status', status, 'contact_email', contact_email, 'contacts', contacts, 'created_by', created_by)
    INTO failed_application_snapshot FROM public.clubs WHERE id = failed_application;
  SELECT jsonb_build_object('name', name, 'status', status, 'contact_email', contact_email, 'contacts', contacts, 'created_by', created_by)
    INTO nonpending_snapshot FROM public.clubs WHERE id = nonpending_application;

  IF has_function_privilege('anon', 'public.preview_decide_club_claim(uuid,text,text,uuid,jsonb)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.preview_decide_club_application(uuid,text,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous RPC execution is permitted';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.preview_decide_club_claim(uuid,text,text,uuid,jsonb)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.preview_decide_club_application(uuid,text,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated RPC execution grant is missing';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', wrong_actor::text, true);
  BEGIN
    PERFORM public.preview_decide_club_claim(linked_claim, 'approved', NULL, claim_club, snapshot);
    RAISE EXCEPTION 'Wrong role approved a claim';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.preview_decide_club_application(application_club, 'approved', NULL, application_snapshot);
    RAISE EXCEPTION 'Wrong role approved an application';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF EXISTS(SELECT 1 FROM public.club_members WHERE club_id IN (claim_club, application_club)) THEN
    RAISE EXCEPTION 'Denied call changed memberships'; END IF;

  PERFORM set_config('request.jwt.claim.sub', actor::text, true);
  -- Two case-distinct authority rows must never create ambiguous permission.
  INSERT INTO public.admin_sidebar_permissions(email, role) VALUES(upper(actor_email), 'super_admin');
  BEGIN
    PERFORM public.preview_decide_club_claim(linked_claim, 'approved', NULL, claim_club, snapshot);
    RAISE EXCEPTION 'Duplicate authority rows authorized a claim';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.preview_decide_club_application(application_club, 'approved', NULL, application_snapshot);
    RAISE EXCEPTION 'Duplicate authority rows authorized an application';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  DELETE FROM public.admin_sidebar_permissions WHERE email = upper(actor_email);
  BEGIN
    PERFORM public.preview_decide_club_claim(linked_claim, 'approved', NULL, claim_club, NULL);
    RAISE EXCEPTION 'Missing claim snapshot was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  UPDATE public.club_claim_requests SET full_name = 'Changed after review' WHERE id = stale_claim;
  BEGIN
    PERFORM public.preview_decide_club_claim(stale_claim, 'approved', NULL, claim_club, stale_snapshot);
    RAISE EXCEPTION 'Stale claim snapshot was accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  IF EXISTS(SELECT 1 FROM club_preview_private.claim_decisions WHERE claim_id = stale_claim) THEN
    RAISE EXCEPTION 'Stale claim left an audit row'; END IF;

  outcome := public.preview_decide_club_claim(linked_claim, 'approved', NULL, claim_club, snapshot);
  IF outcome->>'already_applied' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Initial claim result incorrect'; END IF;
  outcome := public.preview_decide_club_claim(linked_claim, 'approved', NULL, claim_club, snapshot);
  IF outcome->>'already_applied' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Claim retry not idempotent'; END IF;
  BEGIN
    PERFORM public.preview_decide_club_claim(linked_claim, 'rejected', 'Conflicting retry', claim_club, snapshot);
    RAISE EXCEPTION 'Conflicting claim retry was accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  IF (SELECT count(*) FROM club_preview_private.claim_notifications WHERE claim_id = linked_claim) <> 1
    OR (SELECT count(*) FROM public.club_members WHERE club_id = claim_club AND user_email = claimant_email AND player_id = fixture_player_id AND role = 'owner') <> 1 THEN
    RAISE EXCEPTION 'Linked claim did not create exactly one owner/outbox row'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.clubs WHERE id = claim_club AND status = 'published' AND verified IS TRUE) THEN
    RAISE EXCEPTION 'Claim approval did not publish its unclaimed club'; END IF;
  PERFORM public.preview_decide_club_claim(null_claim, 'approved', NULL, null_club, null_snapshot);
  IF NOT EXISTS(SELECT 1 FROM public.club_members WHERE club_id = null_club AND player_id IS NULL AND role = 'owner') THEN
    RAISE EXCEPTION 'Nullable claimant player was not preserved'; END IF;
  BEGIN
    PERFORM public.preview_decide_club_claim(rejected_claim, 'rejected', '', claim_club, reject_snapshot);
    RAISE EXCEPTION 'Blank rejection feedback was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM public.preview_decide_club_claim(rejected_claim, 'rejected', 'Synthetic feedback', claim_club, reject_snapshot);
  IF NOT EXISTS(SELECT 1 FROM public.club_claim_requests WHERE id = rejected_claim AND status = 'rejected' AND rejection_notes = 'Synthetic feedback')
    OR EXISTS(SELECT 1 FROM public.club_members WHERE club_id = claim_club AND user_email = reject_snapshot->>'requester_email') THEN
    RAISE EXCEPTION 'Claim rejection state or membership incorrect'; END IF;

  BEGIN
    PERFORM public.preview_decide_club_application(application_club, 'approved', NULL, application_snapshot || '{"name":"Changed after review"}'::jsonb);
    RAISE EXCEPTION 'Stale application snapshot was accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  outcome := public.preview_decide_club_application(application_club, 'approved', NULL, application_snapshot);
  IF outcome->>'already_applied' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Initial application result incorrect'; END IF;
  outcome := public.preview_decide_club_application(application_club, 'approved', NULL, application_snapshot);
  IF outcome->>'already_applied' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Application retry not idempotent'; END IF;
  BEGIN
    PERFORM public.preview_decide_club_application(application_club, 'rejected', 'Conflicting retry', application_snapshot);
    RAISE EXCEPTION 'Conflicting application retry was accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  IF (SELECT count(*) FROM club_preview_private.application_notifications WHERE club_id = application_club) <> 1
    OR (SELECT count(*) FROM public.club_members WHERE club_id = application_club AND player_id IS NULL AND role = 'owner') <> 1 THEN
    RAISE EXCEPTION 'Email-only application owner/outbox incorrect'; END IF;
  BEGIN
    PERFORM public.preview_decide_club_application(rejected_application, 'rejected', '   ', rejection_application_snapshot);
    RAISE EXCEPTION 'Blank application rejection feedback was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM public.preview_decide_club_application(rejected_application, 'rejected', 'Synthetic feedback', rejection_application_snapshot);
  IF NOT EXISTS(SELECT 1 FROM public.clubs WHERE id = rejected_application AND status = 'rejected' AND rejection_notes = 'Synthetic feedback')
    OR EXISTS(SELECT 1 FROM public.club_members WHERE club_id = rejected_application) THEN
    RAISE EXCEPTION 'Application rejection state or membership incorrect'; END IF;
  PERFORM public.preview_decide_club_application(no_email_application, 'approved', NULL, no_email_snapshot);
  IF EXISTS(SELECT 1 FROM club_preview_private.application_notifications WHERE club_id = no_email_application)
    OR EXISTS(SELECT 1 FROM public.club_members WHERE club_id = no_email_application) THEN
    RAISE EXCEPTION 'Missing applicant email invented membership or notification'; END IF;
  BEGIN
    PERFORM public.preview_decide_club_application(nonpending_application, 'approved', NULL, nonpending_snapshot);
    RAISE EXCEPTION 'Nonpending application was approved';
  EXCEPTION WHEN serialization_failure THEN NULL; END;

  -- With no contact_email, choose the first primary contact, otherwise the
  -- first contact. An existing staff row must be upgraded, not duplicated.
  INSERT INTO public.clubs(id, name, slug, status, verified, contact_email, contacts, created_by)
    VALUES
      (primary_application, 'Synthetic primary contact application', 'qa-primary-' || suffix, 'in_review', false, NULL,
       jsonb_build_array(
         jsonb_build_object('email', 'nonprimary-' || suffix || '@example.invalid'),
         jsonb_build_object('email', claimant_email, 'is_primary', true),
         jsonb_build_object('email', 'laterprimary-' || suffix || '@example.invalid', 'is_primary', true)), fixture_player_id),
      (first_contact_application, 'Synthetic first contact application', 'qa-first-contact-' || suffix, 'in_review', false, NULL,
       jsonb_build_array(
         jsonb_build_object('email', 'first-' || suffix || '@example.invalid', 'is_primary', false),
         jsonb_build_object('email', 'second-' || suffix || '@example.invalid')), NULL);
  INSERT INTO public.club_members(id, club_id, user_email, player_id, role)
    VALUES(existing_membership, primary_application, claimant_email, NULL, 'staff');
  SELECT jsonb_build_object('name', name, 'status', status, 'contact_email', contact_email, 'contacts', contacts, 'created_by', created_by)
    INTO primary_snapshot FROM public.clubs WHERE id = primary_application;
  SELECT jsonb_build_object('name', name, 'status', status, 'contact_email', contact_email, 'contacts', contacts, 'created_by', created_by)
    INTO first_contact_snapshot FROM public.clubs WHERE id = first_contact_application;
  PERFORM public.preview_decide_club_application(primary_application, 'approved', NULL, primary_snapshot);
  PERFORM public.preview_decide_club_application(first_contact_application, 'approved', NULL, first_contact_snapshot);
  IF (SELECT count(*) FROM public.club_members WHERE club_id = primary_application) <> 1
    OR NOT EXISTS(SELECT 1 FROM public.club_members WHERE id = existing_membership AND club_id = primary_application AND role = 'owner' AND player_id = fixture_player_id AND user_email = claimant_email)
    OR NOT EXISTS(SELECT 1 FROM club_preview_private.application_notifications WHERE club_id = primary_application AND recipient = claimant_email AND template = 'club_approved') THEN
    RAISE EXCEPTION 'Primary contact/created_by/staff upgrade behavior incorrect'; END IF;
  IF (SELECT count(*) FROM public.club_members WHERE club_id = first_contact_application) <> 1
    OR NOT EXISTS(SELECT 1 FROM public.club_members WHERE club_id = first_contact_application AND role = 'owner' AND player_id IS NULL AND user_email = 'first-' || suffix || '@example.invalid')
    OR NOT EXISTS(SELECT 1 FROM club_preview_private.application_notifications WHERE club_id = first_contact_application AND recipient = 'first-' || suffix || '@example.invalid') THEN
    RAISE EXCEPTION 'First contact fallback behavior incorrect'; END IF;

  -- Only these synthetic IDs fail. Triggers exist solely in this transaction.
  EXECUTE format('CREATE TRIGGER qa_claim_outbox_failure BEFORE INSERT ON club_preview_private.claim_notifications FOR EACH ROW WHEN (NEW.claim_id = %L::uuid) EXECUTE FUNCTION pg_temp.club_candidate_fail_outbox()', failed_claim);
  SELECT to_jsonb(c) INTO before_row FROM public.clubs c WHERE id = failure_club;
  BEGIN
    PERFORM public.preview_decide_club_claim(failed_claim, 'approved', NULL, failure_club, failure_snapshot);
    RAISE EXCEPTION 'Forced claim outbox failure did not occur';
  EXCEPTION WHEN SQLSTATE 'P7777' THEN NULL; END;
  IF (SELECT to_jsonb(c) FROM public.clubs c WHERE id = failure_club) IS DISTINCT FROM before_row
    OR NOT EXISTS(SELECT 1 FROM public.club_claim_requests WHERE id = failed_claim AND status = 'pending' AND reviewed_at IS NULL)
    OR EXISTS(SELECT 1 FROM public.club_members WHERE club_id = failure_club)
    OR EXISTS(SELECT 1 FROM club_preview_private.claim_decisions WHERE claim_id = failed_claim)
    OR EXISTS(SELECT 1 FROM club_preview_private.claim_notifications WHERE claim_id = failed_claim) THEN
    RAISE EXCEPTION 'Claim outbox failure was not atomic'; END IF;

  EXECUTE format('CREATE TRIGGER qa_application_outbox_failure BEFORE INSERT ON club_preview_private.application_notifications FOR EACH ROW WHEN (NEW.club_id = %L::uuid) EXECUTE FUNCTION pg_temp.club_candidate_fail_outbox()', failed_application);
  SELECT to_jsonb(c) INTO before_row FROM public.clubs c WHERE id = failed_application;
  BEGIN
    PERFORM public.preview_decide_club_application(failed_application, 'approved', NULL, failed_application_snapshot);
    RAISE EXCEPTION 'Forced application outbox failure did not occur';
  EXCEPTION WHEN SQLSTATE 'P7777' THEN NULL; END;
  IF (SELECT to_jsonb(c) FROM public.clubs c WHERE id = failed_application) IS DISTINCT FROM before_row
    OR EXISTS(SELECT 1 FROM public.club_members WHERE club_id = failed_application)
    OR EXISTS(SELECT 1 FROM club_preview_private.application_decisions WHERE club_id = failed_application)
    OR EXISTS(SELECT 1 FROM club_preview_private.application_notifications WHERE club_id = failed_application) THEN
    RAISE EXCEPTION 'Application outbox failure was not atomic'; END IF;
  IF EXISTS(SELECT 1 FROM club_preview_private.claim_notifications WHERE claim_id IN (linked_claim, null_claim, rejected_claim) AND (recipient NOT LIKE '%@example.invalid' OR delivery_status <> 'pending'))
    OR EXISTS(SELECT 1 FROM club_preview_private.application_notifications WHERE club_id IN (application_club, rejected_application, primary_application, first_contact_application) AND (recipient NOT LIKE '%@example.invalid' OR delivery_status <> 'pending')) THEN
    RAISE EXCEPTION 'Synthetic notification destination/status was unsafe'; END IF;
  RAISE NOTICE 'PASS: staging candidate role/snapshot guards, nullable owners, rejection, identical retries, and outbox-failure rollback';
END $test$;
SELECT 'PASS: synthetic staging assertions completed; transaction will roll back' AS staging_check;
ROLLBACK;
