# Calendar preview checkpoint

## Reference and scope

Existing `CalendarManager.jsx` owns the feature reference. The Players preview owns the visual target: light data surfaces, restrained borders, lime actions, semantic tier colours and side drawers. Refero's existing-product workflow and craft guidance were used; live Refero tools were unavailable.

The old CalendarManager is not mounted: its fetch path calls `promoteFinishedTiersToRecentResults`, which can mutate data. This implementation loads calendar records through SELECT-only queries, retaining the existing authenticated Calendar permission gate and database RLS.

## Included

- Dashboard: totals, upcoming events, homepage/live flags, hidden records and setup gaps.
- Monday-first month calendar; inclusive multi-day spans; day-overflow modal.
- Search/filter/sort and 50-row event list; URL state; entire rows open drawers.
- Drawer: location, organiser, description, registration windows, prices, licence settings, actual division records, publication flags and creator/source details.
- All recorded calendar fields remain inspectable in Source. Missing data is explicit.
- Event Manager and public-event links, clipboard copy, Excel export.
- Existing manual events use the shared six-tab event editor for authenticated super-admins in All 4M Padel, including the original save/publish/media logic and fresh access/conflict preflight. Closing without attempting a change does not reload Calendar; attempted changes refresh its records.
- Create event uses the same EventBuilder, with fresh super-admin verification before saves/uploads. Successful creation closes the builder and opens the new event's Calendar drawer after reloading. Failures after an attempted write block blind retries. Calendar day selection does not prefill this builder; choose dates in Basics.
- Quick-event creation uses the current main checkout's QuickEventBuilder with its five original steps, payment choices, club/Google lookup, media uploads and access-code RPC. Fresh super-admin checks precede saves/uploads. Creation keeps the original confirmation screen open for copying the access code before Done reloads Calendar and selects the new event. The better-ui skill guided reuse of the light editor theme and image outlines; no fields were regrouped.
- Local-only quick-edit/duplicate demonstrations and reset. Delete is a non-mutating confirmation demonstration. Imported and cancelled records cannot open the manual editor.

## Intentional limits

- Viewing Calendar never writes, syncs or promotes results. Existing-event editing can save, publish and upload through the same guarded editor used by Event Manager; these actions are labelled as live.
- Existing quick-event editing, duplication and deletion are not integrated yet. Quick creation is connected. Like the source workflow, quick creation publishes after event/division/access-code setup; it is not a draft-save action.
- New/duplicated demo events do not create database divisions or registrations.
- Calendar stored player counts are not reconciled finance/registration totals.
- Real authenticated data remains to be checked by a signed-in admin. Synthetic QA never calls the database.

## Verification

Quick creation: `node tests/admin-preview/quick-creation-qa.mjs` mocks all data
and RPC writes, blocks external requests, verifies hidden insert → division →
access-code setup → visibility update, permission denial, duplicate protection,
partial-failure retry blocking and all five steps at 1440px/390px. Mobile review
was visually inspected. Unit suite remains 224 passing and build passes. No real
quick event, access code or upload was created. Saves are still nontransactional;
partial failure requires reviewing Calendar, not blindly resubmitting.

Creation integration: `node tests/admin-preview/event-creation-qa.mjs` exercises
the real EventBuilder with mocked database methods: hidden draft creation,
division persistence, new-ID callback, denied permissions and prevention of
repeat writes after successful creation. External requests are blocked. The
Calendar runner also checks the new-event drawer handoff. Unit suite: 224 passing;
production build passes. No real event creation, upload, publish or deployment.

Calendar editor integration: `node tests/admin-preview/calendar-editor-qa.mjs`
checks shared-editor routing, no reload on a no-op close, one paginated reload
after an attempted change, retained URL filters/selection and hidden edit actions
for read-only accounts and imported records. The editor callback and all records
are synthetic; external requests are blocked. The shared editor itself is covered
by `event-advanced-engine-qa.mjs`. Full unit suite: 222 passing; production build
passes with the existing bundle-size warning. No live changes or deployment.

`node --test tests/admin-preview/calendarData.test.mjs tests/admin-preview/playersData.test.mjs`

20 passing tests cover pagination, failures, multi-day events, date validation, filtering, source joins, scoped division reads and existing Players data logic. Browser checks used 105 synthetic calendar events: dashboard, event drawer, local edit application, South African timestamps and 50-row pagination. Production build passed with existing size/gradient warnings.
