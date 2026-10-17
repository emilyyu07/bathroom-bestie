# BathroomBestie mobile (skeleton)

Expo, Android-first. **Not part of the pnpm workspace** (Metro and pnpm's symlinked layout don't mix); install separately:

    cd apps/mobile && npm install

Background location needs a **development build**, not Expo Go:

    npx expo prebuild --platform android
    npx expo run:android          # or: eas build --profile development --platform android
    npx expo start --dev-client

Expo Go works for the Plan, Pre-flight and Watcher screens only; the evidence reporter will stop when the app is backgrounded.

`assets/sweep.json` is copied here by `pnpm sim sweep`. Set `EXPO_PUBLIC_API_URL` to point at the API.

Not typechecked or run in this scaffold (dependencies were not installed). See TODOs in `src/evidenceReporter.ts` (foreground service, home geofence region events).
