# Database migrations

New or recreated public tables must declare API access in the migration that
creates them. Do not depend on Supabase's former automatic grants.

- Enable RLS and define policies for intended row access.
- Explicitly GRANT only the operations needed by `anon`, `authenticated` and
  `service_role`; explicitly REVOKE client access for RPC-only/worker tables.
- Keep private schemas private and preserve intentional column-level grants.
- Grant sequence USAGE to roles that need it; service-role RLS bypass does not
  replace table or sequence grants.
- Add the table's reviewed access contract to `tests/fixtures/data-api-access.mjs`
  and run `npm run test:data-api`. Use `npm run test:data-api:db` for database
  verification against the empty local `fourm_data_api_grant_test` database.
- Audit both `supabase/migrations` and `mobile/supabase/migrations`: they share
  the hosted database. Do not replay old migrations or reset a hosted project
  to apply historical grant corrections.

See `docs/data-api-grants.md` for the audit scope and verification limits.
