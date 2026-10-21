-- The annual-license migration revoked execution on all private helpers, including
-- the existing read-only helper required by player RLS. Restore its original
-- authenticated grant; license mutation helpers stay private.
grant execute on function private.managed_event_player_emails() to authenticated;
notify pgrst, 'reload schema';
