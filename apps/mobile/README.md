# BathroomBestie mobile

Expo, Android-first. **Not part of the pnpm workspace** (Metro and pnpm's symlinked layout don't mix); install separately:

    cd apps/mobile && npm install

Background location needs a **development build**, not Expo Go:

    npx expo prebuild --platform android   # generates android/ (gitignored; regenerate, don't edit)
    npx expo run:android          # or: eas build --profile development --platform android
    npx expo start --dev-client

No Android Studio needed: JDK 17 plus Google's command-line tools work. Install
`platform-tools`, `emulator`, `platforms;android-35`, `build-tools;35.0.0`,
`ndk;26.1.10909125` and `system-images;android-35;google_apis;arm64-v8a` with `sdkmanager`, set
`JAVA_HOME` and `ANDROID_HOME`, create an AVD with `avdmanager`, start it with `emulator -avd <name>`,
then `npx expo run:android`. The emulator reaches the local API at 10.0.2.2:3000.

During a night the app reports from an Android foreground service (persistent notification), so
updates continue with the app closed. It asks for Balanced (Wi-Fi/cell) location, which the
emulator doesn't have: run Metro with `EXPO_PUBLIC_REPORT_ACCURACY=high npx expo start` there, and
feed positions with `adb emu geo fix <lon> <lat>` (repeating the same position registers nothing;
vary it slightly).

Home is a geofence on the phone (`src/home.ts`, invariant 5). "Set home to where I am now" on the
Pre-flight screen stores the position on this device only and registers a 150 m geofence. When she
enters it during a night, the phone sends one report with `homeArrived: true` and no area at all,
then stops reporting: the engine treats her as home for the rest of the night, and an ordinary
report from home would reveal where home is. Entering home outside a night does nothing. Android
geofences can take a minute or two to fire, so the last ordinary reports before arrival may come
from near home (documented limit).

Motion: when Android gives no speed (common with Balanced location), the app estimates it from the
distance to the previous fix (kept on the phone), so walking/vehicle reach the engine.

No device? The screens run in a browser against the local API (`pnpm api` first):

    npx expo start --web          # http://localhost:8081

Web is for the UI only: background location, the foreground service, the home geofence and battery settings are Android features and need a device or emulator.

`assets/sweep.json` is copied here by `pnpm sim sweep`. Set `EXPO_PUBLIC_API_URL` to point at the API.

Checks that need no device (also `pnpm mobile:check` from the repo root):

    npm run check                                  # typecheck + Expo SDK version check
    npx expo-doctor
    npx expo export --platform android --output-dir /tmp/bb-export   # bundles the JS like a build

These pass; the app has not yet been launched on a device or emulator. See TODOs in `src/evidenceReporter.ts` (foreground service, home geofence region events).
