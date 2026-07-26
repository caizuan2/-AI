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
   - `buildApk=true` builds the APK on GitHub Actions; a real APK is mandatory.
   - `buildExe=true` builds the EXE on GitHub Actions; a real EXE is mandatory.
   - `deployWeb=false` keeps the run as build/verify only.
   - First run with `deployWeb=false`. Publish and verify the native packages before changing production Web.
   - APK and EXE keep fixed asset names:
     - `admin-ingest.apk`
     - `admin-ingest.exe`
6. Confirm the unified release manifest:
   - Web, APK, and EXE are all `available=true`.
   - Web, APK, and EXE have the same `releaseHead`, `version`, and `build`.
   - APK and EXE have a non-empty SHA-256, byte size, fixed asset name, and download URL.
   - The GitHub Release contains both fixed native asset names.
7. Re-run the same release commit with `deployWeb=true`. Web deployment is allowed only after the package release and sync checks pass.
   - The standalone Web workflow cannot deploy production on its own.
   - Production deploy requires `releaseVerified=true` from the unified release workflow.
8. After deployment, confirm:
   - `/admin-ingest?app=ingest-admin&platform=web`
   - `/api/public/expert-market`
   - `/releases/latest.json` reports the exact deployed SHA, version, build, and `force_update=true` for `admin`.
   - The Web shell receives a forced content-update prompt when its SHA is stale.
   - Older APK and EXE builds receive a forced package-update prompt.
   - Current APK and EXE builds load the deployed Web content and do not receive a false package update.
9. Record the deployed SHA/tag/build and the immediately previous production SHA/tag before closing the release.

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
- `build`
- `environment`
- `releaseHead`
- `releaseTag`
- `web`
- `apk`
- `exe`
- `rollback`

Web, APK, and EXE are all mandatory for a production release. APK/EXE must include:

- `head`
- `version`
- `build`
- `path`
- `assetName`
- `downloadUrl`
- `size`
- `sha256`

The release is invalid when an artifact is missing, or when any artifact `head`, `version`, or `build` differs from the top-level release identity.

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
