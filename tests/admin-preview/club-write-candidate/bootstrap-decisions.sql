-- Explicit staging-only prerequisite for approval candidates.
-- Does not install the unrelated profile RPC or change existing table policies.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE SCHEMA club_preview_private;
REVOKE ALL ON SCHEMA club_preview_private FROM PUBLIC, anon, authenticated;
COMMIT;
