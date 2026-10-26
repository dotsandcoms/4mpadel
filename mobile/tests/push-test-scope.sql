-- Isolated fixture database only, after all push migrations.
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
INSERT INTO players(email,name) VALUES('test@example.com','Test'),('other@example.com','Other');
INSERT INTO player_push_tokens(email,token,platform,token_kind) VALUES
 ('test@example.com','ExpoPushToken[test-scope]','ios','expo'),
 ('other@example.com','ExpoPushToken[other-scope]','ios','expo');
-- Also exercise an already expanded delivery for a non-test recipient.
INSERT INTO push_deliveries(outbox_id,token_id)
 SELECT o.id,t.id FROM push_outbox o JOIN player_push_tokens t ON t.email=o.email
 WHERE o.email='other@example.com';
SELECT pg_temp.assert((SELECT count(*)=0 FROM claim_push_deliveries(ARRAY[]::text[])), 'empty scope must claim nothing');
SELECT pg_temp.assert((SELECT bool_and(expanded_at IS NULL) FROM push_outbox), 'empty scope must not expand any outbox');
SELECT pg_temp.assert((SELECT count(*)=1 FROM claim_push_deliveries(ARRAY['test@example.com'])), 'only test account claimed');
SELECT pg_temp.assert((SELECT bool_and(status='pending' AND expanded_at IS NULL) FROM push_outbox WHERE email='other@example.com'), 'other inbox queue untouched');
SELECT pg_temp.assert((SELECT bool_and(d.status='pending' AND d.attempts=0 AND d.lease_id IS NULL) FROM push_deliveries d JOIN push_outbox o ON o.id=d.outbox_id WHERE o.email='other@example.com'), 'other existing deliveries untouched');
SELECT pg_temp.assert((SELECT count(*)=0 FROM claim_push_deliveries(ARRAY['test@example.com'])), 'active leases not reclaimed');
SELECT pg_temp.assert((SELECT count(*)=1 FROM claim_push_deliveries()), 'unrestricted API remains compatible');
ROLLBACK;
