# Draw testing sandbox

URL: https://4mpadel-draw-sandbox.vercel.app

This standalone entry renders the current draw manager. It does not deploy the full live application. Changes to the production app remain local until separately reviewed and released.

- Vercel project: `4mpadel-draw-sandbox`, ID `prj_GGukhZVZMIkXk65MK3ySOX9AcoV5`.
- Supabase: **4M Padel Staging**, `cefmzkwabdqqoagxhekc`.
- Production Supabase is a different project: `uzglrpbixubfijvjbtgz`.
- Entry/config: `sandbox/draws/`. Client URL and public publishable key are pinned to staging; production `.env` cannot override them.
- Browser CSP restricts backend connections to staging. The client refuses Edge Function calls. No payment or event-email modules are included.
- Approved tester emails: brad@dotsandcoms.co.za and markstillerman@gmail.com. These are staging permissions only; passwords are separate from live.
- Sample event ID `90000001`, slug `draw-sandbox`: 16 individual ladies, 32 men's pairs, 16 Division 2 pairs, four courts on 11–13 September 2026.
- Draws are shared between testers. No destructive reset has been exposed.

On 10 September 2026, applied the four `20260910` draw migrations and `sandbox/draws/seed.sql` together in a transaction using the verified staging SQL editor. The seed uses an existing-ID guard and does not reset saved draws. Supabase's `main PRODUCTION` branch badge belongs to the staging project; it is not the live 4M Padel project.

## Updating the sandbox

Run from the repository root:

```sh
node sandbox/draws/build.mjs
npx --yes vercel link --yes --project 4mpadel-draw-sandbox --scope brad-elins-projects --cwd .tmp/draw-sandbox-dist
```

Remove the generated `.tmp/draw-sandbox-dist/.env.local` before deploying (Vercel link creates an ephemeral OIDC token there), then:

```sh
npx --yes vercel deploy --prod --yes --scope brad-elins-projects --cwd .tmp/draw-sandbox-dist
```

Here `--prod` targets the **sandbox Vercel project's** stable URL. Never run this from the repository root: its `.vercel` link points to the live site.

No Git auto-deployment is connected to the sandbox. Build verification checks that the compiled JavaScript contains staging's project reference and excludes production's reference.

## Authentication

Staging Site URL is the sandbox URL. Confirm email delivery or provision the two test accounts through Supabase before handing off for testing. Do not disable email verification or RLS to make sign-in work. Full authenticated save/schedule verification requires a tester to complete their own account setup.

The sandbox's custom tester role also needs `sandbox/draws/registration-read-policy.sql`. Its SELECT-only policy covers test rows in event 90000001 for existing draw managers. This lets the invoker-mode Americano save validate paid registrations without granting super-admin or disabling RLS.

### 11 September workflow revision

The sandbox starts with player/payment/licence review and seed confirmation. An organiser can exclude a registration or record an exception reason; confirmations persist in `draw_player_reviews` with organiser ID and time. An exception does not mark a registration paid. Americano's save RPC accepts a saved exception for an active registration. The sandbox wrapper supplies explicitly simulated full-licence profiles for its synthetic entrants; this is not a licence lookup against production.

Player and seeding lists export separately as paginated PDFs. Ranking controls are in step 1. The Draw step includes optional custom placement ranges, retaining prerequisite feeder matches. Scheduling includes selected fixed-pair divisions, editable round priority, dependency ordering, gap-aware court allocation, and main finals on the last active date with overflow staggered. Americano's rotation remains managed by its wave scheduler and appears as reserved bookings in the shared calendar. Group-to-knockout qualification still uses the existing result-completion workflow.

Applied to staging only: `20260911090000_draw_player_reviews.sql`. Database regression in `sandbox/draws/player-review-test.sql` verifies unpaid rejection, approved exception acceptance, original payment status preservation and unauthorised read denial; it rolls all fixture writes back. Local UI checks cover confirmation, custom 13–16 placement feeders, PDF downloads, and saving 46 matches across two divisions with concurrent last-day finals.

Deployment verified 11 September 2026: `dpl_4mfNJgQMvBe12FSgcbyAJh1PQcbr`, aliased to https://4mpadel-draw-sandbox.vercel.app. HTTP 200 and staging-only CSP verified. Targeted suite: 56 passing tests; touched-file lint and isolated sandbox build passed. Existing CSS gradient and bundle-size build warnings remain.

The Schedule step now opens a full-screen native dialog for calendar edits. It keeps day/snap/zoom/save/close controls visible, provides a hideable searchable match sidebar, and shows conflicts inside the dialog. Escape/Close preserves component preview state and restores focus to the opener. Timeline geometry uses minutes × zoom rather than a fixed row height. Local browser checks verified assignment, save, close/reopen preservation, keyboard focus and desktop/mobile layouts; 19 scheduling-related tests and lint/build passed.
