# Tournament Manager tests

Unit tests run with the other project tests:

```sh
node --test tests/*.test.mjs tests/tournament/*.test.mjs
```

Create an empty `fourm_tournament_integration_test` database on a disposable local PostgreSQL instance. The suite creates its fixtures inside a transaction and rolls back. It refuses other database names and checks that the schemas are empty before creating any records. `schema.sql` defines the minimum calendar, registration, player and auth schema for the actual draw and timing migrations exercised here.

```sh
node tests/tournament/build-fixtures.mjs
createdb -h /private/tmp -p 55439 fourm_tournament_integration_test
psql -h /private/tmp -p 55439 -d fourm_tournament_integration_test -f tests/tournament/integration.sql -q
```

Assertions exercise:

- authenticated event access and results-only snapshot redaction;
- rejected schedule publication/access escalation/completed corrections for scorers;
- outsiders rejected from event snapshots;
- private drafts not changing public times, followed by complete atomic publication;
- starting and recording a fixed-pair match and advancing its winner;
- registration editing, division creation and all preparation confirmations;
- saved private draws and explicit publication;
- full group results, SQL standings, qualifier creation and preserved elimination bookings;
- event-year and revoked temporary licences, scoped organisation preparation, private Americano and Team Americano drafts, and exact reviewed host qualifiers.

Generated synthetic SQL is ignored by Git and can be regenerated. No user data or secrets are included. Hosted RLS, triggers and broader legacy access must also be tested in a development Supabase environment before release.
