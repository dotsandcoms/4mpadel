# EAS iOS build 31 dependency failure

Failed build: `b8300150-4b5f-40f1-93e3-c6169533a76d`, production/store, version 1.0.0 (31).

The build failed during `npm ci --include=dev`, before native compilation. The log reported `Missing: typescript@5.9.3 from lock file`.

The local npm version was 12.0.2; the EAS builder used npm 10.9.8. The app uses TypeScript 6.0.3. The older `@expo/require-utils` nested under `@bacons/apple-targets` declares an optional TypeScript 5 peer dependency. npm 10 requires a nested TypeScript 5.9.3 lockfile entry that was absent from the npm 12-generated lockfile.

## Fix

Regenerated the existing lockfile with npm 10.9.8 in an isolated directory. The only additional change is the nested TypeScript 5.9.3 entry under `@bacons/apple-targets`. The app's TypeScript 6.0.3 and all other locked package versions remain unchanged.

For future lockfile regeneration against this builder, use:

```sh
npx --yes npm@10.9.8 install --package-lock-only --ignore-scripts --no-audit --no-fund
```

## Verification

- Reproduced the original error using npm 10.9.8.
- Installed all 772 dependencies from the repaired lockfile with `npm ci --include=dev --ignore-scripts` in an isolated directory.
- `npm run typecheck` passed.
- Retry build 32 (`52b43fec-2cbf-4efb-a405-9bbf28e5b5ef`) passed EAS's actual `npm ci --include=dev` phase and completed the production store build.
- Downloaded the IPA and verified its archive integrity, all four target versions (1.0.0 / 32), signatures and store provisioning profiles.

Build 32 confirmed the lockfile fix; replacement build 33 adds the implemented direct account-deletion flow and also completed successfully. The current final status is recorded in `release/app-store-1.0.0/build/build-status.json`. Expo Doctor also reported nine newer SDK 57 patch versions; that warning did not cause the dependency failure. Release preparation still requires the separately documented backend hardening and real-device QA.
