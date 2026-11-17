# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

Follow root `AGENTS.md` and `docs/development-workflow.md` for branch, worktree
and release rules. Native app tasks use `brad/app-*`; use backend/shared branches
for coordinated changes. Preserve legacy `brad/mobile-messaging` while current
phone testing finishes. Run `npm run check` here before a phone build. The root
`app:preview` command prepares committed source and a receipt for internal testing.
Apple/Google submission and production OTA updates need explicit release approval
after Brad's testing; never trigger them automatically from Git pushes.
