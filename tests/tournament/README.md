# Tournament Manager tests

Unit tests run with the other project tests:

```sh
node --test tests/*.test.mjs tests/tournament/*.test.mjs
```

The database integration suite must run only on the disposable local PostgreSQL instance on port **55439**. It starts a transaction, replaces the test schemas, runs assertions and rolls back. It refuses other ports. Do not run it against a hosted or shared database.

The implementation session created `/private/tmp/4m-tournament-db` with a Unix socket at `/private/tmp`, port 55439. To recreate it on another machine, initialise an empty PostgreSQL data directory and start it on that port. `schema.sql` defines a minimal calendar/registration/player/auth host schema and imports the repository's actual native-draw and timing migrations. It is not a replacement for the full Supabase migration history.

```sh
node tests/tournament/build-fixtures.mjs
psql -h /private/tmp -p 55439 -d postgres -f tests/tournament/integration.sql -q
```

Assertions exercise:

- authenticated event access and results-only snapshot redaction;
- rejected schedule publication/access escalation/completed corrections for scorers;
- outsiders rejected from event snapshots;
- private drafts not changing public times, followed by complete atomic publication;
- starting and recording a fixed-pair match and advancing its winner;
- registration editing, division creation and all preparation confirmations;
- saved private draws and explicit publication;
- full group results, SQL standings, qualifier creation and preserved elimination bookings.

Generated synthetic SQL is ignored by Git and can be regenerated. No user data or secrets are included. Hosted RLS, triggers and broader legacy access must also be tested in a development Supabase environment before release.
