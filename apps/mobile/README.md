# BathroomBestie mobile

Expo, Android-first. **Not part of the pnpm workspace** (Metro and pnpm's symlinked layout don't mix); install separately:

    cd apps/mobile && npm install

Background location needs a **development build**, not Expo Go:

    npx expo prebuild --platform android   # generates android/ (gitignored; regenerate, don't edit)
    npx expo run:android          # or: eas build --profile development --platform android
    npx expo start --dev-client

Expo Go works for the Plan, Pre-flight and Watcher screens only; the evidence reporter will stop when the app is backgrounded.

`assets/sweep.json` is copied here by `pnpm sim sweep`. Set `EXPO_PUBLIC_API_URL` to point at the API.

Checks that need no device (also `pnpm mobile:check` from the repo root):

    npm run check                                  # typecheck + Expo SDK version check
    npx expo-doctor
    npx expo export --platform android --output-dir /tmp/bb-export   # bundles the JS like a build

These pass; the app has not yet been launched on a device or emulator. See TODOs in `src/evidenceReporter.ts` (foreground service, home geofence region events).
