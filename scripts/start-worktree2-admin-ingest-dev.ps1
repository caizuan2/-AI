$ErrorActionPreference = "Stop"
$projectCandidates = @("C:\Users\PC\.codex\worktrees\7927\XT", "C:\Users\PC.codex\worktrees\7927\XT")
$project = $projectCandidates | Where-Object { Test-Path -LiteralPath (Join-Path $_ "package.json") } | Select-Object -First 1
$port = 3021
if (-not $project) { Write-Host "[worktree2] ERROR: project directory not found." -ForegroundColor Red; exit 1 }
$project = (Resolve-Path -LiteralPath $project).Path
Set-Location -LiteralPath $project
Write-Host "[worktree2] project: $project" -ForegroundColor Cyan
Write-Host "[worktree2] port: $port" -ForegroundColor Cyan
$owners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
if ($owners.Count -eq 0) { Write-Host "[worktree2] old process on 3021: none" -ForegroundColor DarkGray }
foreach ($ownerPid in $owners) { if ($ownerPid -and $ownerPid -ne 0) { Write-Host "[worktree2] stopping old process PID: $ownerPid" -ForegroundColor Yellow; Stop-Process -Id $ownerPid -Force -ErrorAction SilentlyContinue } }
Start-Sleep -Milliseconds 500
function Remove-CacheSafely([string]$target) {
  $fullTarget = [System.IO.Path]::GetFullPath($target)
  $fullProject = [System.IO.Path]::GetFullPath($project)
  if (-not $fullTarget.StartsWith($fullProject, [System.StringComparison]::OrdinalIgnoreCase)) { Write-Host "[worktree2] unsafe cache target blocked: $fullTarget" -ForegroundColor Red; exit 1 }
  if (Test-Path -LiteralPath $fullTarget) { Write-Host "[worktree2] clearing cache: $fullTarget" -ForegroundColor Cyan; Remove-Item -LiteralPath $fullTarget -Recurse -Force -ErrorAction Stop } else { Write-Host "[worktree2] cache not present: $fullTarget" -ForegroundColor DarkGray }
}
Remove-CacheSafely (Join-Path $project ".next")
Remove-CacheSafely (Join-Path $project "node_modules\.cache")
Write-Host "[worktree2] starting dev server: npm run dev -- -p $port" -ForegroundColor Green
Write-Host "[worktree2] url: http://localhost:$port/admin-ingest?app=ingest-admin&platform=web" -ForegroundColor Green
npm run dev -- -p $port
