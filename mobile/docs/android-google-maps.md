# Android venue maps

The event Location card uses `GoogleMaps.View` from Expo Maps on Android and `AppleMaps.View` on iOS. The selected venue drives both the map lookup and Directions. Android Directions opens Google Maps with a navigation intent, with a Google Maps web fallback when the app is unavailable.

The Google Maps SDK key is configured through `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY`. `app.config.js` writes it into `android.config.googleMaps.apiKey` during prebuild. Set the variable in the appropriate EAS environment before a store build. The key is embedded in the Android binary, so restrict it in Google Cloud rather than treating it as a server secret.

For production:

1. Enable Maps SDK for Android in the intended Google Cloud project with its required billing setup.
2. Use an Android Maps key restricted to Maps SDK for Android and package `com.fourmpadel.app`.
3. Add the signing certificate SHA-1 used by each permitted build. The local emulator build uses `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`. Apps installed through Google Play use the **Play app signing certificate**, which can differ from the upload certificate; use the certificate shown in Play Console's app signing settings.
4. Configure the key in EAS's production environment and rebuild the Android App Bundle.

The website's existing Maps key was approved for a local Android compatibility test on 12 October 2026. The user confirmed that the map preview loads in the rebuilt Android emulator app. Its restrictions have not been inspected because the local Google Cloud CLI is not authenticated. No Cloud key restrictions or billing settings were changed. The test confirms this local build works; production key restrictions and the Play app signing certificate still need to be verified before a store build.

Expo Location requires foreground location permission on Android to geocode a venue address. The preview requests that permission when opened; if denied, Directions remains available. This code does not obtain or track the user's GPS position. Native map rendering keeps the user-location layer disabled.

Coordinate lookups share in-flight requests, cache at most 100 successful addresses, and ignore stale results after venue changes. The Google map has a bounded load timeout and an actionable fallback if it cannot finish loading.

Use the installed Java 17 toolchain for local Android builds. The bundled Android Studio Java 25 runtime produced a native CMake configuration error in this environment. The fallback toolchain is `/opt/homebrew/Cellar/openjdk@17/17.0.15/libexec/openjdk.jdk/Contents/Home`.

References:

- https://docs.expo.dev/versions/v57.0.0/sdk/maps/
- https://docs.expo.dev/versions/v57.0.0/sdk/location/
- https://developers.google.com/maps/documentation/android-sdk/get-api-key
- https://developer.android.com/guide/components/google-maps-intents
