-- Run with psql -v ON_ERROR_STOP=1 after the disposable fixture and migration.
-- All identities/data in this integration test are fictitious and rolled back.
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.denied(action text, org uuid, data jsonb DEFAULT '{}'::jsonb) RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN PERFORM public.organisation_banking(action,org,data); RETURN false; EXCEPTION WHEN OTHERS THEN RETURN true; END $$;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
('00000000-0000-0000-0000-000000000001','owner@example.test',now()),
('00000000-0000-0000-0000-000000000002','other@example.test',now()),
('00000000-0000-0000-0000-000000000003','staff@example.test',now()),
('00000000-0000-0000-0000-000000000004','super@example.test',now()),
('00000000-0000-0000-0000-000000000005','custom@example.test',now());
INSERT INTO auth.sessions SELECT id,id,NULL,id FROM auth.users;
INSERT INTO auth.mfa_factors SELECT id,id,'totp','verified' FROM auth.users;
INSERT INTO public.organisations VALUES ('10000000-0000-0000-0000-000000000001','Test organisation','approved'),('10000000-0000-0000-0000-000000000002','Other organisation','approved');
INSERT INTO public.organisation_members VALUES
('10000000-0000-0000-0000-000000000001','owner@example.test','owner'),
('10000000-0000-0000-0000-000000000001','staff@example.test','staff'),
('10000000-0000-0000-0000-000000000002','other@example.test','owner');
INSERT INTO public.admin_sidebar_permissions VALUES('super@example.test','super_admin'),('custom@example.test','custom');
INSERT INTO public.calendar(id,organisation_id,event_name) VALUES(1,'10000000-0000-0000-0000-000000000001','Test event'),(2,'10000000-0000-0000-0000-000000000002','Other event');
CREATE FUNCTION pg_temp.identity(n int,aal text DEFAULT 'aal2',age_seconds int DEFAULT 0) RETURNS void LANGUAGE sql AS $$
SELECT set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-0000-0000-'||lpad(n::text,12,'0'),'session_id','00000000-0000-0000-0000-'||lpad(n::text,12,'0'),'aal',aal,'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch FROM now())-age_seconds)))::text,true)::void $$;
SELECT pg_temp.assert(NOT has_function_privilege('anon','public.organisation_banking(text,uuid,jsonb)','EXECUTE'),'anonymous RPC denied');
SELECT pg_temp.assert(NOT has_table_privilege('authenticated','banking_private.accounts','SELECT'),'direct table SELECT denied');
SELECT pg_temp.assert(NOT has_table_privilege('service_role','banking_private.accounts','SELECT'),'service-role direct SELECT denied');
SELECT pg_temp.assert(NOT has_table_privilege('authenticated','vault.decrypted_secrets','SELECT'),'Vault key denied');
SELECT pg_temp.assert(NOT has_table_privilege('authenticated','banking_private.audit','INSERT'),'audit forgery denied');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert(pg_temp.denied('summary','10000000-0000-0000-0000-000000000001'),'missing identity denied');
SELECT pg_temp.identity(2);
SELECT pg_temp.assert(pg_temp.denied('summary','10000000-0000-0000-0000-000000000001'),'cross-organisation access denied');
SELECT pg_temp.identity(3);
SELECT pg_temp.assert(pg_temp.denied('summary','10000000-0000-0000-0000-000000000001'),'staff denied');
SELECT pg_temp.identity(5);
SELECT pg_temp.assert(pg_temp.denied('summary','10000000-0000-0000-0000-000000000001'),'custom platform admin denied');
SELECT pg_temp.identity(1,'aal1');
SELECT pg_temp.assert((public.organisation_banking('summary','10000000-0000-0000-0000-000000000001')->>'saved')='false','masked status without MFA');
SELECT pg_temp.assert(pg_temp.denied('save','10000000-0000-0000-0000-000000000001'),'aal1 write denied');
SELECT pg_temp.identity(1,'aal2',301);
SELECT pg_temp.assert(pg_temp.denied('save','10000000-0000-0000-0000-000000000001'),'expired MFA denied');
SELECT pg_temp.identity(1);
CREATE TEMP TABLE bank_summary AS SELECT public.organisation_banking('save','10000000-0000-0000-0000-000000000001','{"bank_name":"Test Bank","account_holder":"Test Org","account_number":"000123456789","branch_code":"001234","account_type":"current"}') AS summary;
SELECT pg_temp.assert((SELECT summary->>'last_four'='6789' AND NOT summary ? 'account_number' AND NOT summary ? 'account_holder' FROM bank_summary),'save returns masked fields only');
SELECT pg_temp.assert(pg_temp.denied('save','10000000-0000-0000-0000-000000000001','{"bank_name":"Stale"}'),'stale account write denied');
SELECT pg_temp.assert(pg_temp.denied('request','10000000-0000-0000-0000-000000000001',jsonb_build_object('event_id',2,'amount',500,'request_id','20000000-0000-0000-0000-000000000001','expected_version',(SELECT summary->>'version' FROM bank_summary))),'cross-org event request denied');
SELECT public.organisation_banking('request','10000000-0000-0000-0000-000000000001',jsonb_build_object('event_id',1,'amount',500,'request_id','20000000-0000-0000-0000-000000000001','expected_version',(SELECT summary->>'version' FROM bank_summary)));
SELECT public.organisation_banking('request','10000000-0000-0000-0000-000000000001',jsonb_build_object('event_id',1,'amount',500,'request_id','20000000-0000-0000-0000-000000000001','expected_version',(SELECT summary->>'version' FROM bank_summary)));
SELECT pg_temp.assert(pg_temp.denied('request','10000000-0000-0000-0000-000000000001',jsonb_build_object('event_id',1,'amount',400,'request_id','20000000-0000-0000-0000-000000000002','expected_version',(SELECT summary->>'version' FROM bank_summary))),'duplicate pending request denied');
SELECT pg_temp.assert(pg_temp.denied('reveal',NULL,'{"request_id":"20000000-0000-0000-0000-000000000001"}'),'owner cannot reveal full banking');
SELECT pg_temp.assert(NOT (public.organisation_banking('notification',NULL,'{"request_id":"20000000-0000-0000-0000-000000000001"}') ? 'account_number'),'email metadata has no banking');
UPDATE bank_summary SET summary=public.organisation_banking('save','10000000-0000-0000-0000-000000000001',jsonb_build_object('expected_version',summary->>'version','bank_name','Replacement Bank','account_holder','New Holder','account_number','999987654321','branch_code','009876','account_type','savings'));
SELECT pg_temp.assert((public.organisation_banking('list','10000000-0000-0000-0000-000000000001')->'requests'->0->>'account_changed')='true','replacement marks existing snapshot');
SELECT pg_temp.identity(4,'aal2',301);
SELECT pg_temp.assert(pg_temp.denied('reveal',NULL,'{"request_id":"20000000-0000-0000-0000-000000000001"}'),'super admin also needs fresh MFA');
SELECT pg_temp.identity(4);
SELECT pg_temp.assert((public.organisation_banking('reveal',NULL,'{"request_id":"20000000-0000-0000-0000-000000000001"}')->>'account_number')='000123456789','snapshot remains original including leading zeros');
SELECT public.organisation_banking('resolve',NULL,'{"request_id":"20000000-0000-0000-0000-000000000001","status":"paid"}');
SELECT pg_temp.assert(pg_temp.denied('reveal',NULL,'{"request_id":"20000000-0000-0000-0000-000000000001"}'),'paid request cannot reveal');
SELECT pg_temp.assert(pg_temp.denied('resolve',NULL,'{"request_id":"20000000-0000-0000-0000-000000000001","status":"paid"}'),'repeat payment recording denied');
SELECT pg_temp.identity(1);
SELECT public.organisation_banking('remove','10000000-0000-0000-0000-000000000001',jsonb_build_object('expected_version',(SELECT summary->>'version' FROM bank_summary)));
SELECT pg_temp.assert(pg_temp.denied('request','10000000-0000-0000-0000-000000000001','{"event_id":1,"amount":500,"request_id":"20000000-0000-0000-0000-000000000003"}'),'request without saved bank denied');
RESET ROLE;
SELECT pg_temp.assert((SELECT jsonb_array_length(organiser_interim_payments)=1 AND (organiser_interim_payments->0->>'amount')::numeric=500 FROM public.calendar WHERE id=1),'manual payment ledger updated exactly once');
SELECT pg_temp.assert((SELECT count(*)=1 FROM banking_private.payout_requests),'retry is idempotent');
SELECT pg_temp.assert((SELECT position('000123456789' in encode(encrypted_details,'escape'))=0 FROM banking_private.payout_requests),'ciphertext has no plaintext account number');
SELECT pg_temp.assert((SELECT count(*)=6 FROM banking_private.audit),'all sensitive actions audited exactly once');
UPDATE auth.mfa_factors SET status='unverified' WHERE user_id='00000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT pg_temp.identity(1);
SELECT pg_temp.assert(pg_temp.denied('save','10000000-0000-0000-0000-000000000001'),'revoked MFA factor denied');
RESET ROLE;
DELETE FROM auth.sessions WHERE user_id='00000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT pg_temp.identity(1);
SELECT pg_temp.assert(pg_temp.denied('summary','10000000-0000-0000-0000-000000000001'),'revoked session denied');
RESET ROLE;
DELETE FROM public.organisations WHERE id='10000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert((SELECT count(*)=0 FROM banking_private.payout_requests),'hard-deleting an organisation removes confidential snapshots');
ROLLBACK;
SELECT 'Banking security integration tests passed' AS result;
