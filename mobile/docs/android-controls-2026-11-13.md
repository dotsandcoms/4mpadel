# Android controls — 13 November 2026

The audit used the user's eight screenshots, the existing 4M iOS/Android product and Expo SDK 57 component documentation. Refero live tools were unavailable; its bundled touch/typography craft references and the supplied screens ground this focused, brand-preserving polish.

Direction: a padel companion for players; direct, courtside and restrained. Keep the current light canvas, system type and event/player imagery. Blue identifies actions and selected views; Help keeps its plum category colour. Event imagery and scores carry content emphasis.

| Finding | Change | Reference |
| --- | --- | --- |
| Stock Material segmented buttons add checks and squeeze Women onto two lines | Page views use underlined tabs; directory/category controls occupy full-width rows on Android | User screenshots; existing app hierarchy |
| Green default Material tint differs from the new action blue | Explicit blue selected/control states, without changing event tier data | User's blue-default request |
| Header icons cross a Compose/RNHostView boundary inside the clickable control | One React Native Pressable touch target, with decorative content ignoring pointer events | User tap reports; native touch craft |
| Shortcuts have uneven labels and no consistent icon treatment | Short visible Android labels, centred icon tiles and shared heights; full accessible names remain | User screenshots; 4M destinations |
| Large capsule actions compete with content | Compact inner button geometry within 48 dp touch targets | Touch craft; existing 4M blue actions |

Android controls use native React Native views and press/ripple handling. Page tabs are custom app controls with tab/radio accessibility semantics; they are not stock Compose segmented buttons. The bottom navigation still uses Expo Router NativeTabs. iOS keeps its platform SwiftUI controls.

Tests exercise immediate header callbacks, touch-target sizes, label line limits, selection semantics and large-font filter labels. TypeScript and native builds are checked separately. The user chose to visually review the Android emulator, as the computer-use tool cannot attach to its standalone window; ADB is limited to build/install/startup diagnostics.

Unslop by Damir Sokolovsky ([@heydamir](https://x.com/heydamir)), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), [original skill](https://heydamir.design/unslop).
