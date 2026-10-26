-- Read-only. Run against the SAME Supabase project used by the website/mobile app.
-- All shared tables should be present before applying the mobile migrations.
SELECT name AS shared_table, to_regclass('public.' || name) IS NOT NULL AS present
FROM unnest(ARRAY['players','calendar','event_registrations','tournament_divisions',
'draws','draw_entries','draw_matches','draw_match_sets','tournament_schedules',
'tournament_finalisations','player_ranking_points']) AS name;

-- This is a targeted check, not a substitute for the shared migration history.
SELECT required.table_name, required.column_name, EXISTS (
 SELECT 1 FROM information_schema.columns c
 WHERE c.table_schema='public' AND c.table_name=required.table_name AND c.column_name=required.column_name
) AS present
FROM (VALUES ('calendar','event_status'),('calendar','registration_opens_at'),
('calendar','registration_closes_at'),('calendar','early_bird_ends_at'),
('tournament_divisions','cancelled_at'),('tournament_divisions','entries_close_at'),
('draws','scoring_rules'),('draw_matches','americano_fixture_key'),
('tournament_schedules','published_assignments'),('tournament_finalisations','fingerprint'),
('player_ranking_points','reversal_of')) AS required(table_name,column_name);

-- Presence markers help identify what is installed; also check your migration history.
SELECT to_regclass('public.push_outbox') IS NOT NULL AS push_foundation_present,
       to_regclass('public.push_deliveries') IS NOT NULL AS delivery_migration_present,
       to_regclass('public.tournament_notification_jobs') IS NOT NULL AS tournament_migration_present;
