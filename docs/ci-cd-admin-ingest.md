# Admin Ingest CI/CD

This document describes the Worktree 2 admin-ingest release pipeline. It is configuration only: the workflows build, verify, publish manifests, and optionally deploy. They do not change Prisma schema, migrations, RAG storage, provider routing, login, license, or production environment files.

## Workflow Map

- `.github/workflows/admin-ingest-release.yml`
  - Enterprise release orchestrator.
  - Builds Web, APK, and EXE.
  - Writes and verifies one unified release manifest.
  - Optionally runs QA and deploys Web.
- `.github/workflows/admin-ingest-deploy-web.yml`
  - Builds the Next.js Web app and writes `artifacts/admin-ingest/web/manifest.json`.
  - When `deploy=true`, deploys the verified commit to Aliyun by SSH key.
- `.github/workflows/admin-ingest-build-apk.yml`
  - Builds the admin-ingest APK if Android or Flutter mobile entrypoints are available.
  - If the APK cannot be produced in non-strict mode, it still uploads a manifest with an explicit `reason`.
- `.github/workflows/admin-ingest-build-exe.yml`
  - Builds the admin-ingest EXE using the available Electron, Flutter Windows, or Tauri entrypoint.
  - If the EXE cannot be produced in non-strict mode, it still uploads a manifest with an explicit `reason`.
- `.github/workflows/admin-ingest-qa.yml`
  - Performs route-level smoke checks for the Web shell and public expert market API.
- `.github/workflows/admin-ingest-rollback.yml`
  - Requires manual confirmation.
  - Runs `scripts/rollback/rollback-admin-ingest.sh` remotely.

## Release Scripts

- `scripts/release/resolve-version.mjs`
  - Resolves app version, environment, Git commit, release tag, build number, and canonical Web URL.
- `scripts/release/write-release-manifest.mjs`
  - Merges Web/APK/EXE manifests into `artifacts/admin-ingest/release-manifest.json`.
  - Supports `--dry-run`.
- `scripts/release/verify-release-sync.mjs`
  - Ensures all available artifacts were produced from the same release head.
  - Allows unavailable APK/EXE artifacts only when their manifest contains a clear `reason`.
- `scripts/rollback/rollback-admin-ingest.sh`
  - Guarded rollback script.
  - Requires `CONFIRM_ROLLBACK=true`.
  - Accepts only `release/admin-ingest-*` or `backup/admin-ingest-*` refs unless explicitly overridden.

## Release Console APIs

The admin-ingest UI exposes a read-only release console through the top tab `发布中心`.

- `GET /api/admin/ingest-release/summary`
  - Aggregates manifest, workflow files, environments, health checks, rollback metadata, and permissions.
- `GET /api/admin/ingest-release/manifest`
  - Reads `artifacts/admin-ingest/release-manifest.json`, `public/releases/latest.json`, `.next/BUILD_ID`, and Git HEAD.
- `GET /api/admin/ingest-release/health`
  - Checks `/ingest/login`, `/admin-ingest`, `/chat-ui`, `/api/ingest/auth/me`, and `/api/public/expert-market`.
- `POST /api/admin/ingest-release/rollback-plan`
  - Generates a rollback command draft only.
  - It never executes `git reset`, `pm2 restart`, SSH, migrations, or deletion commands.

## Required GitHub Secrets

Do not place secret values in the repository.

- `ALIYUN_HOST`
- `ALIYUN_USER`
- `ALIYUN_SSH_KEY`
- `ALIYUN_APP_DIR`

Optional repository variable:

- `ADMIN_INGEST_BASE_URL`
  - Defaults to `http://47.238.0.23` when not set.

## Environments

- `dev`
  - Local or CI dry-run Web URL defaults to `http://localhost:3063/admin-ingest?app=ingest-admin&platform=web`.
- `staging`
  - Intended for pre-production checks.
- `prod`
  - Current Aliyun Web target.

## Local Dry Run

Use these commands before opening a release PR:

```powershell
node scripts/release/resolve-version.mjs
node scripts/release/write-release-manifest.mjs --dry-run
node scripts/release/verify-release-sync.mjs --dry-run
powershell -ExecutionPolicy Bypass -File scripts/build/build-admin-ingest-web.ps1 -DryRun
powershell -ExecutionPolicy Bypass -File scripts/build/build-admin-ingest-apk.ps1 -DryRun
powershell -ExecutionPolicy Bypass -File scripts/build/build-admin-ingest-exe.ps1 -DryRun
```

## Release Gates

The enterprise release must keep these gates green:

```powershell
npm run typecheck
npm run lint
npm run build
npx prisma validate
git diff --check
```

If `public/releases/latest.json` changes because of `npm run build`, restore it unless the release task explicitly requires that file.

## Rollback

Rollback is manual and guarded:

1. Open the `Admin Ingest Rollback` workflow.
2. Select the environment.
3. Enter a `release/admin-ingest-*` or `backup/admin-ingest-*` ref.
4. Type `CONFIRM_ROLLBACK`.
5. Verify Web route and expert-market route after the workflow finishes.

The rollback script creates a backup branch before moving the deployed working tree.
