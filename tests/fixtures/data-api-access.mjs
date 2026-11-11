export const CRUD = ['delete', 'insert', 'select', 'update'];
// Reviewed against browser/native callers, server workers and RLS intent.
// A new public table needs a deliberate contract here and grants beside CREATE.
export const contracts = new Map();
function group(tables, anon = [], authenticated = []) {
    for (const table of tables.split(' ')) contracts.set(`public.${table}`, { anon, authenticated, service_role: CRUD });
}
group('player_profile_details playtomic_extraction_usage playtomic_profile_extractions');
group('admin_sidebar_permissions organization_members club_members', [], CRUD);
group('tournament_divisions clubs club_organisations draws draw_entries draw_groups draw_matches draw_match_sets draw_standings', ['select'], CRUD);
group('payment_refunds org_audit_log event_activity_log player_devices player_push_tokens event_management_completion pro_match_bookmarks', [], ['select']);
group('club_claim_invites draw_player_reviews', [], ['insert', 'select', 'update']);
group('club_google_matches', [], ['select', 'update']);
group('player_schedule_events pro_player_follows local_player_follows', [], ['delete', 'insert', 'select']);
group('commerce_config', ['select'], ['insert', 'select', 'update']);
group('ranking_tiers ranking_points_table', ['select'], ['select']);
group('player_ranking_points draw_match_audit', [], ['insert', 'select']);
group('event_play_days', [], CRUD);
group('license_seasons', ['select'], ['select']);
group('player_fip_links', ['select'], ['delete', 'insert', 'select']);
group('push_outbox tournament_access tournament_workspace tournament_confirmations tournament_schedules tournament_finalisations tournament_audit license_accounts annual_licenses license_audit_log push_broadcasts push_deliveries event_notification_follows notification_match_snapshots notification_event_snapshots tournament_notification_jobs native_license_checkouts native_welcome_emails following_activity following_sync_state padel_api_backoff padel_api_cache padel_api_control padel_api_requests padel_api_leases padel_api_players rankedin_draw_refresh_leases rankedin_draw_refresh_budget fip_tournament_cache fip_refresh_budget');


// RPC-only messaging schema: no client table or sequence privileges, even if a
// project accidentally exposes the schema through PostgREST. Checked by the
// messaging PostgreSQL fixture; these are deliberately outside public contracts.
export const privateMessagingContracts = new Map(
  'configuration accounts conversations members messages blocks event_approvals entry_confirmations guardian_consents reports audit deliveries badge_cache push_budget groups group_members admin_batches'
    .split(' ').map(table => [`messaging.${table}`, { anon: [], authenticated: [], service_role: CRUD }])
);

// Additional group metadata is RPC-only even for workers.
for (const table of ['groups','group_members','admin_batches']) privateMessagingContracts.set(`messaging.${table}`, { anon: [], authenticated: [], service_role: [] });
