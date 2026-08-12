# Legacy SQL (archived)

Ad-hoc SQL that used to live loose in the repo root. Most of it predates
`supabase/migrations/` (first migration: `20260325_add_live_fields.sql`).

Nothing here is wired into any tooling. It is kept for history and because — for
the files under `uncovered-schema/` — it is the **only written record of how parts
of the live database were built**.

## `superseded/`

A later migration explicitly recreates or replaces the object. Safe to ignore.

| File | Superseded by |
| --- | --- |
| `setup_rpc.sql` | `20260509_add_region_to_players.sql`, `20260511_add_racket_brand_to_players.sql` — both `CREATE OR REPLACE` `create_player_profile` with a superset signature |
| `fix_tournament_participants_unique.sql` | `20260510_multi_division_participants.sql` — drops `tournament_participants_event_participant_unique` and replaces it with a `class_name`-aware constraint |

## `data-loads/`

One-off row inserts / updates against a schema that already existed. No DDL worth
migrating; re-running them would clobber live data (several begin with `TRUNCATE`).

`supabase_data.sql`, `seed_blog_posts.sql`, `update_odyssey_finals.sql`

## `uncovered-schema/` — the gap

**These changes are live in the database but no migration creates them.** A rebuild
from `supabase/migrations/` alone would produce a schema that is missing every table
below, and the app would not boot against it.

Verified against the linked project: all nine tables and every column listed exist
live; `grep` over `supabase/migrations/` finds no `CREATE TABLE` / `ADD COLUMN` for
any of them.

### Tables created only here

| Table | File |
| --- | --- |
| `players`, `events` | `supabase_schema.sql` (+ RLS in `supabase_security.sql`) |
| `calendar` | `supabase_calendar.sql` (+ RLS in `update_calendar_rls.sql`) |
| `blogs` | `create_blog_table.sql` |
| `event_registrations` | `create_registrations_table.sql` |
| `tournament_participants`, `payments` | `update_finance_schema.sql` |
| `settings` | `social_settings_schema.sql` |

### Other objects created only here

- `increment_blog_views(uuid)` — `create_increment_views_rpc.sql`
- `blog-images` storage bucket + its 4 policies — `create_storage_bucket.sql`

### Columns created only here

- **`players`** — `update_players_schema.sql` (nationality, category, level, bio,
  sponsors, contact_number, email, gender, id_number, home_club, approved,
  paid_registration), `add_player_stats_columns.sql` (skill_rating, age, match_form,
  rankings, rankedin_profile_url), `add_rankedin_id_column.sql` (rankedin_id),
  `add_additional_images_column.sql` (additional_images),
  `supabase_update_players.sql` (home_club, age_group)
- **`calendar`** — `update_calendar_schema.sql` (description, start_time, end_time,
  address, organizer_*, image_url, start_date, slug),
  `add_featured_event_column.sql` (featured_event, registered_players, rankedin_url
  — note `sponsor_logos` from that same file *is* covered, by
  `20260703_wizard_columns_catchup.sql`), `update_finance_schema.sql` (entry_fee),
  `update_events_dates.sql` (end_date), `update_events_times.sql` (converts
  start_time/end_time from text to `TIME`)
- **`events`** — `import_calendar.sql` (city, organiser, sapa_category,
  event_number, venue)

### Special case: `coach_applications`

`fix_coaches_rls.sql` adds an RLS policy to `coach_applications`. That table is
read by 9 files under `src/` and exists live, but **no SQL anywhere in this repo
creates it** — not in migrations, not in the archive. Its definition exists only
in the remote database.
