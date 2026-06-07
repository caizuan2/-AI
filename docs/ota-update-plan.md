# APK OTA / Live Update Plan

This project uses Capacitor for Android and now includes Capgo live update support through `@capgo/capacitor-updater`. The integration is intentionally narrow: it can update Web-layer files after users install an APK that contains the updater plugin, while the existing manual APK download flow remains available. No token, app id, signing password, or OTA credential is stored in code.

## Current Status

- Capacitor config exists: `capacitor.config.ts`
- Android project exists: `android/`
- iOS project is not present
- Capgo OTA plugin is installed: `@capgo/capacitor-updater`
- OTA initialization is mounted in client-only React code
- Android has been synced with the plugin through `npx cap sync android`
- The Android WebView currently points to the deployed web app URL, so normal hosted Web changes are still visible after the server is deployed and the app reloads the web page
- Current `webDir` is `app-shell`, which is a lightweight redirect shell rather than a full static Next.js export
- A newly built APK that includes the Capgo plugin must be installed before OTA checks can run on user devices

## What Can Be Updated Through Web Deployment Or OTA

- Web UI
- JavaScript
- CSS
- Images and other normal Web assets
- Text, layout, and normal React component changes
- User-side `/chat-ui` and admin-side web pages when the WebView loads the hosted URL

## What Still Requires a New APK

- New native Android permissions
- Capacitor plugin additions or removals
- AndroidManifest changes
- Native Java/Kotlin code changes
- App id, app name, icon, splash, signing, or WebView entry behavior changes
- Database schema changes; production databases still require `npx prisma migrate deploy`
- First install for new users

## Capgo Runtime Integration

Runtime code lives in:

```text
components/ota/CapacitorOtaUpdater.tsx
```

The component:

- runs only on Capacitor native platforms
- calls `notifyAppReady()` so a successfully loaded bundle is not rolled back
- queues the native Capgo update check with `triggerUpdateCheck()`
- catches all failures so app startup is not blocked
- skips update checks when `NEXT_PUBLIC_OTA_ENABLED=false`

## Capgo Release Requirements

Create a Capgo app and release channels before publishing OTA bundles.

Required secrets:

- `CAPGO_TOKEN`
- `CAPGO_APP_ID`
- `OTA_CHANNEL`, for example `production`, `staging`, or `internal`
- `NEXT_PUBLIC_OTA_ENABLED=true` for native runtime checks

Safe setup outline:

1. Keep all Capgo tokens in CI Secrets or `.env.local`.
2. Build web assets.
3. Sync Capacitor with `npx cap sync android`.
4. Upload the Web bundle to the configured Capgo channel.
5. Build and distribute a new APK that contains the updater plugin.
6. After users install that APK, future Web-layer updates can be delivered through Capgo.
7. Roll back by promoting the previous known-good bundle or by publishing a corrected bundle to the channel.

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
- `scripts/release-web-assets.ps1` builds web assets and syncs Capacitor.
- `scripts/release-ota-capgo.ps1` builds Web assets, syncs Capacitor, checks Capgo environment variables, and prints the masked Capgo upload command.
- Add `-ExecuteUpload` only after confirming `app-shell` is the intended OTA bundle path.

Because this project currently loads a hosted Next.js app through `server.url`, most UI, JS, and CSS changes are still delivered through Web deployment. Capgo should be tested on a real device before declaring production OTA complete.

## Manual APK Fallback

Keep publishing APK files to the download page. If OTA fails, users can still install the latest APK manually from `/download`.
