$ErrorActionPreference = "Stop"

Write-Host "=== AI Knowledge User Local 3051 Start Script ==="

$ProjectRoot = "C:\Users\PC\.codex\worktrees\352b\XT"
$LocalDatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:54330/xt_local_license?schema=public"

Set-Location $ProjectRoot

Write-Host "=== 1. Check Docker pgvector ==="
$dockerStatus = docker ps --filter "name=xt-local-pgvector"
Write-Host $dockerStatus
$dockerStatusText = $dockerStatus -join "`n"

if ($dockerStatusText -notmatch "xt-local-pgvector") {
  Write-Host "ERROR: xt-local-pgvector is not running. Start Docker Desktop and the local pgvector container first."
  exit 1
}

Write-Host "=== 2. Check local database ==="
docker exec xt-local-pgvector psql -U postgres -d xt_local_license -c "SELECT 1;"
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERROR: local database SELECT 1 check failed."
  exit 1
}

Write-Host "=== 3. Stop old 3051 service ==="
$connections = Get-NetTCPConnection -LocalPort 3051 -ErrorAction SilentlyContinue
if ($connections) {
  $processIds = $connections |
    Where-Object { $_.OwningProcess -gt 0 } |
    Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($processId in $processIds) {
    Write-Host "Stopping process on 3051 PID=$processId"
    Stop-Process -Id $processId -Force
  }
  Start-Sleep -Seconds 2
}

Write-Host "=== 4. Force local DATABASE_URL ==="
$env:DATABASE_URL = $LocalDatabaseUrl
$env:DIRECT_URL = $LocalDatabaseUrl
$env:NEXT_PUBLIC_APP_ENV = "local-test"

if ($env:DATABASE_URL -match "supabase|aws-|pooler|47\.238\.0\.23") {
  Write-Host "ERROR: online database signature detected. Startup blocked. DATABASE_URL=$env:DATABASE_URL"
  exit 1
}

if ($env:DATABASE_URL -notmatch "127\.0\.0\.1:54330") {
  Write-Host "ERROR: DATABASE_URL does not point to 127.0.0.1:54330."
  exit 1
}

Write-Host "DATABASE_URL confirmed: 127.0.0.1:54330"
Write-Host "=== 5. Start Next local service on 3051 ==="
npm run dev -- -p 3051
