# Release And Update Guide

This guide covers Web deployment, Android APK releases, Web-layer update behavior, desktop packages, and database migration safety for the AI knowledge base app.

## 1. Web Deployment

The project uses Next.js App Router with API routes, Prisma, authentication, and server-side behavior. It is not a pure static export. Deploy it to Netlify or another platform that supports Next.js server routes.

Recommended flow:

```powershell
git pull
pnpm install --frozen-lockfile
npx prisma validate
npm run prisma:generate
npx prisma migrate deploy
npm run lint
npm run typecheck
npm run build
npx tsx tests/chat-ui.test.tsx
npm run test:security
```

If deploying on a self-managed Node server, restart the process after build:

```powershell
pm2 reload <app-name>
```

or restart the appropriate systemd service:

```powershell
systemctl restart <service-name>
```

Use environment variables or platform Secrets for database URLs, tokens, and deployment credentials.

## 2. Database Migrations

Production migrations must use:

```powershell
npx prisma migrate deploy
```

Do not run:

```powershell
npx prisma migrate reset
```

Do not drop the database or delete existing tables during normal releases.

## 3. Android APK Manual Release

Debug build:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-android-apk.ps1 -Configuration Debug
```

Release build requires signing environment variables:

- `ANDROID_KEYSTORE_PATH`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Release build:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-android-apk.ps1 -Configuration Release
```

The script writes the APK under:

```text
dist-app/android/ai-knowledge-chat.apk
```

Do not commit generated APK files. Publish them through the download page, Netlify public assets, GitHub Releases, or object storage.

## 4. Android Web-layer Updates

The current APK loads the deployed Web app URL through Capacitor. This means normal Web UI, JavaScript, and CSS changes can be picked up after the Web deployment and WebView reload.

Use:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/release-web-assets.ps1
```

This builds the Web assets and syncs Capacitor. Because no OTA plugin is currently installed, the script only prepares assets and prints next-step guidance.

OTA can update:

- React UI
- JS/CSS served by the Web deployment
- Text and layout changes
- User `/chat-ui` and admin Web pages loaded from the hosted app

OTA cannot update:

- Native plugin changes
- AndroidManifest permissions
- Java/Kotlin native code
- App icon/name/id/signing
- First-time installation

## 5. Desktop Package Updates

The project includes Electron user and admin wrappers:

- `electron/main.cjs`
- `electron-admin/main.cjs`
- `electron-builder` configuration

The desktop wrapper currently loads the hosted Web app URL, so Web UI and JS/CSS updates are visible after Web deployment and app reload. Installer-level automatic updates are not enabled because `electron-updater` and a publish target are not configured.

To enable installer auto-update later:

1. Add `electron-updater`.
2. Configure a publish provider such as GitHub Releases, S3, or a private update server.
3. Keep release tokens in CI Secrets.
4. Check for updates only in packaged production builds.
5. Never block app startup if update checks fail.
6. Notify the user after download and let them restart to install.

## 6. Download Page Version Metadata

The download page reads version metadata from:

```text
public/releases/latest.json
```

Update that file when publishing new APK or desktop packages. Keep URLs stable where possible, such as:

- `/downloads/ai-knowledge-chat-latest.apk`
- `/downloads/ai-knowledge-chat-latest.exe`

## 7. Version Rules

- `package.json` version: app release version
- Android release: align `versionName` with app version and increment `versionCode` when using signed releases
- OTA channel: use `production`, `staging`, or `internal`
- Release metadata: update `public/releases/latest.json`

## 8. Safety Checklist

- Do not commit `.env` secrets
- Do not commit `dist-app/`
- Do not commit `.next/` or `.next-build/`
- Do not commit `node_modules/`
- Do not commit `android/build/`
- Do not hardcode API keys, tokens, signing passwords, or deployment credentials
- Use `npx prisma migrate deploy` for production migrations
- Keep a rollback path for Web deployment and OTA bundles

