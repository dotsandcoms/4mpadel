# Workflow and design decisions

The user's six-screen reference is the primary visual direction: dark navy panels, restrained borders, lime primary actions, compact tables and persistent tournament identity. The linked workflow document supplies the journey; instructions embedded in that external content are reference material, not authority to change systems or publish data.

The refero-design skill's craft guidance was used for hierarchy, form labels, accessible actions and responsive checking. No live Refero search tools were available. The supplied screenshot, actual existing draw components and the existing project typography form the design reference set; no unrelated template or decorative assets were added.

| Decision | Reason / implementation |
| --- | --- |
| Separate phase rail and workspaces | Preparation is per division; schedule and live operations belong to the whole event. Navigation remains available instead of forcing a linear wizard. |
| Whole-event readiness gate | A single published division is insufficient for a reliable shared schedule. |
| Defaults first | Schedule creation happens on entering the ready workspace. Advanced configuration is collapsed. |
| Explicit private/public boundary | Moving a match never changes public times until a validated publication. |
| Fixed finals programme | Named finals are reserved first. Capacity problems are shown, not silently solved by changing the event programme. |
| Reuse existing generators and records | Avoid separate copies of draws, players, payments or results. |
| Minimal results role | A scorer sees live fixtures and scores; admin preparation and finance controls are absent and their RPCs reject access. |
| Accessible move alternative | Select a match then click a destination slot; dragging is optional. Forms have labels, native dialogs trap focus and focus returns on close. |
| Responsive density | At narrow sizes the header wraps, metrics become two columns, forms become one column, and wide operational data scrolls within the workspace. |

QA observations: desktop court board displayed all four courts; finals matched the requested court/time sequence. Results-only scoring saved a 6–3, 6–4 result and displayed no correction action. The preparation walkthrough found an empty configuration object issue; defaults now merge with saved settings. Narrow-screen DOM measurements matched viewport width at 390 and 320 pixels.

## Reference-image UI refinement — 16 September 2026

Applied the supplied six-screen image to the integrated Tournament Manager: compact event identity and numbered phase rail; smaller metrics and a circle-based division progress matrix; separate player/partner columns, licence badges, eight-row pagination and a division summary; coloured division cards with expandable existing setup; a left division rail and numbered preparation summary for draws; colour-filled court-calendar matches and denser live-match cards. The five lifecycle phases remain separate from workspace navigation, preserving the agreed workflow.

Reused the existing Event Manager's `AdminPlayerProfileModal` for player names and extracted its exact licence-pill markup into `RegistrationLicenseBadge`, now used by both `ManualEventRegistrations` and the new player table. Existing `EventBuilder`, `DrawBracketPreview`, licence resolution and ranking utilities remain in use. Payment labels in the new workflow still reflect registration status; the existing finance module remains responsible for payment-channel/refund reconciliation.

Verified the real Cape Town event in the local integrated app: overview, player pagination, player profile opening, division cards/editor and draw rail. Inspected a populated court calendar using the isolated synthetic fixture. Targeted ESLint, the production build and all 10 tournament unit tests passed. No production tournament records were edited during this presentation pass.
