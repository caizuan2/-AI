# Admin Ingest CI/CD

This document describes the Worktree 2 admin-ingest release pipeline. It is configuration only: the workflows build, verify, publish manifests, and optionally deploy. They do not change Prisma schema, migrations, RAG storage, provider routing, login, license, or production environment files.

## Workflow Map

- `.github/workflows/admin-ingest-release.yml`
  - Enterprise release orchestrator.
  - Builds Web, APK, and EXE.
  - Writes and verifies one unified release manifest.
  - Optionally runs QA and deploys Web.
- `.github/workflows/admin-ingest-build-web.yml`
  - Builds the Next.js Web app in GitHub Actions.
  - Writes `artifacts/admin-ingest/web/manifest.json`.
  - Uploads the Web manifest and `.next/BUILD_ID`.
- `.github/workflows/admin-ingest-deploy-web.yml`
  - Optionally deploys the verified commit to Aliyun by SSH key.
  - If SSH secrets are missing, prints `DEPLOY_SKIPPED_MISSING_SECRETS=true` and skips deployment.
- `.github/workflows/admin-ingest-build-apk.yml`
  - Builds the admin-ingest APK if Android or Flutter mobile entrypoints are available.
  - If the APK cannot be produced in non-strict mode, it still uploads a manifest with an explicit `reason`.
- `.github/workflows/admin-ingest-build-exe.yml`
  - Builds the admin-ingest EXE using the available Electron, Flutter Windows, or Tauri entrypoint.
  - If the EXE cannot be produced in non-strict mode, it still uploads a manifest with an explicit `reason`.
- `.github/workflows/admin-ingest-qa.yml`
  - Performs route-level smoke checks for the Web shell and public expert market API.
- `.github/workflows/admin-ingest-rollback.yml`
  - Defaults to plan-only mode.
  - Executes remote rollback only when `deploy=true` and `confirm=CONFIRM_ROLLBACK`.

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

Optional QA secrets:

- `QA_USER_PHONE`
- `QA_USER_PASSWORD`

If QA login secrets are missing, the QA workflow prints `QA_LOGIN_SKIPPED_MISSING_SECRETS=true` and still runs route-level health checks.

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

Or run the bundled dry-run:

```powershell
npm run ci:admin-ingest:dry-run
```

The dry-run does not require local Android SDK or Electron dependency downloads. It only detects entrypoints and prints the build plan.

## Zero Local Dependency Build

Local machines do not need Android SDK or a working Electron download mirror for release packaging:

- Web is built by `admin-ingest-build-web.yml` on `ubuntu-latest`.
- APK is built by `admin-ingest-build-apk.yml` on `ubuntu-latest` with Java, Flutter, Android tooling, and Gradle cache.
- EXE is built by `admin-ingest-build-exe.yml` on `windows-latest` with Node, optional Flutter Windows, Electron cache, and mirror variables.

Each available artifact must include:

- `head`
- `path`
- `size`
- `sha256`
- `buildTime`

Unavailable APK/EXE artifacts are allowed only with a reason such as:

- `APK_ENTRY_NOT_FOUND`
- `ANDROID_SDK_NOT_FOUND`
- `EXE_ENTRY_NOT_FOUND`
- `EXE_DEPENDENCY_DOWNLOAD_TIMEOUT`

The unified `release-manifest.json` fails verification if any available artifact was built from a different commit.

## Triggering Releases

Manual release:

1. Open `Admin Ingest Enterprise Release`.
2. Choose `dev`, `staging`, or `prod`.
3. Keep `buildWeb`, `buildApk`, and `buildExe` enabled unless intentionally testing a partial flow.
4. Enable `deployWeb` only when Aliyun SSH key secrets are configured.
5. Review artifacts: `admin-ingest-web-manifest`, `admin-ingest-apk`, `admin-ingest-exe`, and `admin-ingest-release-manifest`.

Tag release:

```powershell
git tag release/admin-ingest-YYYYMMDD-HHMMSS
git push origin release/admin-ingest-YYYYMMDD-HHMMSS
```

The tag workflow checks out one commit and builds Web/APK/EXE from that same HEAD.

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

Rollback is manual, guarded, and defaults to plan-only:

1. Open the `Admin Ingest Rollback` workflow.
2. Select the environment.
3. Enter a `release/admin-ingest-*` or `backup/admin-ingest-*` ref.
4. Leave `deploy=false` to print the plan only.
5. Set `deploy=true` and type `CONFIRM_ROLLBACK` only when executing a real rollback.
6. Verify Web route and expert-market route after the workflow finishes.

The rollback script creates a backup branch before moving the deployed working tree.
