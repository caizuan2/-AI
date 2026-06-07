# APK OTA / Live Update Plan

This project already uses Capacitor for Android, but it does not currently include a live update plugin such as `@capgo/capacitor-updater` or Ionic Appflow. The safe state for this release is documentation plus reusable build scripts; no token, app id, signing password, or OTA credential is stored in code.

## Current Status

- Capacitor config exists: `capacitor.config.ts`
- Android project exists: `android/`
- iOS project is not present
- OTA plugin is not installed
- The Android WebView currently points to the deployed web app URL, so many UI changes are visible after the server is deployed and the app reloads the web page

## What Can Be Updated Without Reinstalling APK

- Web UI under the deployed Next.js app
- JavaScript and CSS served by the web deployment
- Text, layout, and normal React component changes
- User-side `/chat-ui` and admin-side web pages when the WebView loads the hosted URL

## What Still Requires a New APK

- New native Android permissions
- Capacitor plugin additions or removals
- AndroidManifest changes
- Native Java/Kotlin code changes
- App id, app name, icon, splash, signing, or WebView entry behavior changes
- First install for new users

## Recommended Capgo Path

Only enable Capgo after an account, app id, and release channels are ready.

Required secrets:

- `CAPGO_TOKEN`
- `CAPGO_APP_ID`
- `OTA_CHANNEL`, for example `production`, `staging`, or `internal`

Safe setup outline:

1. Install `@capgo/capacitor-updater`.
2. Add the minimal Capacitor updater initialization in the app startup layer.
3. Keep all Capgo tokens in CI Secrets or `.env.local`.
4. Build web assets with `npm run build`.
5. Sync Capacitor with `npx cap sync android`.
6. Upload a bundle to the configured channel.
7. Roll back by promoting the previous known-good bundle.

Do not hardcode Capgo tokens or channel credentials in source files.

## Ionic Appflow Alternative

Ionic Appflow can provide Live Updates, but this project does not currently include an Appflow configuration. Do not enable it until the Appflow app, channels, and secrets are available.

Required secrets:

- Appflow token
- App id
- Channel name

## Self-hosted OTA Alternative

A self-hosted OTA service should include:

- `manifest.json` with version, channel, bundle URL, checksum, and created date
- Bundle zip containing only web assets
- SHA-256 hash verification
- Channel separation for production/staging
- Rollback to the previous manifest
- Client-side update failure fallback

This project does not currently implement a self-hosted OTA service.

## Reusable Scripts

- `scripts/build-android-apk.ps1` builds a fresh Android APK.
- `scripts/release-web-assets.ps1` builds web assets and syncs Capacitor. If no OTA plugin is installed, it prints the next steps instead of publishing.

