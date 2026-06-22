# Admin Ingest Regression Guard

This guard is only for Worktree 2 admin-ingest checks.

## 1. Enter Worktree 2

```powershell
cd "C:\Users\PC\.codex\worktrees\7927\XT"
```

Confirm the branch and project root:

```powershell
git branch --show-current
Test-Path package.json
```

Expected:

```text
feature-admin-feed
True
```

## 2. Start Web

```powershell
npm run dev -- -p 3015
```

Open Web:

```powershell
Start-Process "http://localhost:3015/admin-ingest?app=ingest-admin&platform=web"
```

Run Web smoke:

```powershell
$env:ADMIN_INGEST_SMOKE_URL="http://localhost:3015/admin-ingest?app=ingest-admin&platform=web"
npm run admin-ingest:smoke:web
```

The Web smoke checks:

- `/admin-ingest` HTML returns 200.
- The HTML does not contain `Cannot find module`, `Server Error`, missing error component text, not-found text, or `404`.
- Next static assets under `/_next/static/...` are present.
- `layout.css`, `main-app.js`, `webpack.js`, and `app/admin-ingest/page.js` all return 200.

## 3. Open EXE

```powershell
$env:ADMIN_INGEST_APP_URL="http://localhost:3015/admin-ingest?app=ingest-admin&platform=exe"
npm run admin-ingest:desktop:dev
```

Run EXE smoke:

```powershell
npm run admin-ingest:smoke:exe
```

The EXE smoke checks:

- `admin-ingest:desktop:dev` exists.
- `electron/admin-ingest/main.js` exists.
- The shell targets `/admin-ingest`.
- The shell uses `platform=exe`.
- The shell target is not the user client and is not `/chat-ui`.

## 4. If Next chunks are missing

Symptoms:

- `Cannot find module './xxxx.js'`
- `/_next/static/...` returns 404
- Web or EXE shows native HTML controls
- EXE opens a blank or fallback page

Safe recovery:

```powershell
Get-CimInstance Win32_Process |
Where-Object { $_.CommandLine -like "*\.codex\worktrees\7927\XT*" } |
Select-Object ProcessId, Name, CommandLine
```

After confirming the processes belong to Worktree 2:

```powershell
Get-CimInstance Win32_Process |
Where-Object { $_.CommandLine -like "*\.codex\worktrees\7927\XT*" } |
ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

Back up `.next` by renaming it. Do not delete it.

```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
if (Test-Path ".next") {
  Rename-Item ".next" ".next-bak-$stamp"
}
```

Rebuild and restart:

```powershell
npm run build
npm run dev -- -p 3015
```

## 5. Hard boundaries

- Do not open Worktree 1 user EXE.
- Do not test `/chat-ui` for this admin-ingest guard.
- Do not modify user client code.
- Do not modify super-admin code.
- Do not modify Flutter.
- Do not modify Prisma or migrations.

If either smoke script fails, do not report the admin-ingest stage as complete.
