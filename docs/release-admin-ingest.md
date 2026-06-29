# Admin Ingest Release Runbook

## Goal

Release the admin-ingest product as one consistent Web + APK + EXE version, with a single release manifest and a guarded rollback path.

## Do Not Change During Release

- Prisma schema or migrations
- Database structure or production data
- RAG/vector storage
- Model provider/router logic
- Login, license, or permission core logic
- `.env` or `.env.production`
- Aliyun Nginx/PM2 configuration unless a separate deployment task explicitly requires it

## Standard Release Flow

1. Ensure the target branch is ready.
2. Run local gates:

```powershell
npm run typecheck
npm run lint
npm run build
npx prisma validate
git diff --check
```

3. Run release dry-runs:

```powershell
node scripts/release/resolve-github-repo.mjs
node scripts/release/resolve-version.mjs
node scripts/release/write-release-manifest.mjs --dry-run
node scripts/release/write-release-notes.mjs --dry-run
node scripts/release/verify-release-sync.mjs --dry-run
node scripts/release/verify-github-release-assets.mjs --dry-run
powershell -ExecutionPolicy Bypass -File scripts/build/build-admin-ingest-web.ps1 -DryRun
powershell -ExecutionPolicy Bypass -File scripts/build/build-admin-ingest-apk.ps1 -DryRun
powershell -ExecutionPolicy Bypass -File scripts/build/build-admin-ingest-exe.ps1 -DryRun
```

4. Create a release tag using the project release process.
5. Run `Admin Ingest Enterprise Release`.
   - `buildWeb=true` builds the Web package on GitHub Actions.
   - `buildApk=true` builds the APK on GitHub Actions; local Android SDK is not required.
   - `buildExe=true` builds the EXE on GitHub Actions; local Electron dependency download stability is not required.
   - `deployWeb=false` keeps the run as build/verify only.
   - GitHub Release assets are uploaded only from real artifact files. APK and EXE keep fixed asset names:
     - `admin-ingest.apk`
     - `admin-ingest.exe`
6. Confirm the unified release manifest:
   - Web artifact is available.
   - APK artifact is available or has a clear unavailable reason.
   - EXE artifact is available or has a clear unavailable reason.
   - All available artifacts point to the same `releaseHead`.
   - APK/EXE download buttons appear only when `available=true` and a real `downloadUrl` exists.
7. If deploy is enabled, confirm:
   - `/admin-ingest?app=ingest-admin&platform=web`
   - `/api/public/expert-market`

## Local QA Address

If no dev server is running, start one manually when needed:

```powershell
$env:QA_MODE="true"
$env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54330/xt_local_license?schema=public"
$env:DIRECT_URL="postgresql://postgres:postgres@127.0.0.1:54330/xt_local_license?schema=public"
npm run dev -- -p 3063
```

Then open:

```text
http://localhost:3063/admin-ingest?app=ingest-admin&platform=web
```

Inside admin-ingest, use the top tab:

```text
发布中心
```

The console should show:

- Release overview
- Web/APK/EXE sync status
- Artifact reason when APK or EXE is unavailable
- Workflow file status
- dev / staging / prod environment cards
- Health checks
- Rollback command draft
- Current role permissions

## Artifact Manifest Contract

The unified manifest lives at:

```text
artifacts/admin-ingest/release-manifest.json
```

Required top-level fields:

- `app`
- `version`
- `environment`
- `releaseHead`
- `releaseTag`
- `web`
- `apk`
- `exe`
- `rollback`

Unavailable APK/EXE artifacts are acceptable only when the manifest includes a clear `reason`, such as:

- `ANDROID_SDK_NOT_FOUND`
- `APK_ENTRY_NOT_FOUND`
- `EXE_DEPENDENCY_DOWNLOAD_TIMEOUT`
- `EXE_ENTRY_NOT_FOUND`

Available APK/EXE artifacts must include:

- `head`
- `path`
- `assetName`
- `downloadUrl`
- `size`
- `sha256`

The release is invalid when any available artifact `head` differs from `releaseHead`.

## Rollback Checklist

Use rollback only when production validation fails after a release.

1. Identify the last known good `release/admin-ingest-*` tag or `backup/admin-ingest-*` branch.
2. Run the `Admin Ingest Rollback` workflow.
3. First run with `deploy=false` to review the rollback plan.
4. Only for real execution, set `deploy=true` and enter `CONFIRM_ROLLBACK`.
5. Confirm the remote `ROLLBACK_DONE=true` output.
6. Re-check:
   - Web page returns 200 or expected auth redirect.
   - Expert market public API returns 200.
   - PM2 process is online.

Rollback does not run migrations and must not modify environment files.

The UI rollback panel is intentionally plan-only. It generates commands for review and copy, but does not execute production rollback.
