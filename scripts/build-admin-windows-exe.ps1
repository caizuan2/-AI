$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$OutputDir = Join-Path $Root "dist-app/admin-windows"
$OutputExe = Join-Path $OutputDir "ai-knowledge-admin.exe"
$LatestOutputExe = Join-Path $OutputDir "ai-knowledge-admin-latest.exe"

function Invoke-ProjectCommand {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )

  Push-Location $Root
  try {
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed: $FilePath $($Arguments -join ' ')"
    }
  } finally {
    Pop-Location
  }
}

if (-not (Test-Path (Join-Path $Root "node_modules/electron"))) {
  throw "Electron dependencies are missing. Please run pnpm install before building admin Windows EXE."
}

if (-not (Test-Path (Join-Path $Root "node_modules/electron-builder"))) {
  throw "electron-builder dependency is missing. Please run pnpm install before building admin Windows EXE."
}

if (Test-Path $OutputDir) {
  Get-ChildItem -LiteralPath $OutputDir -Force -ErrorAction SilentlyContinue |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
} else {
  New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
}

if (-not $env:ADMIN_APP_URL) {
  $env:ADMIN_APP_URL = "https://stately-sawine-1efd4d.netlify.app/login?app=admin&next=/ingest"
}

Invoke-ProjectCommand -FilePath "npx" -Arguments @("electron-builder", "--config", "electron-builder.admin.yml", "--win")

$GeneratedExe = Get-ChildItem -LiteralPath $OutputDir -File -Filter "*.exe" -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -ne $LatestOutputExe } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $GeneratedExe) {
  $GeneratedExe = Get-ChildItem -LiteralPath $OutputDir -Recurse -File -Filter "*.exe" -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch "\\resources\\elevate\.exe$" -and $_.FullName -ne $LatestOutputExe } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
}

if (-not $GeneratedExe) {
  throw "No admin Windows EXE was generated under $OutputDir."
}

if ($GeneratedExe.FullName -ne $OutputExe) {
  Copy-Item -LiteralPath $GeneratedExe.FullName -Destination $OutputExe -Force
}
Copy-Item -LiteralPath $OutputExe -Destination $LatestOutputExe -Force

Get-ChildItem -LiteralPath $OutputDir -File |
  Where-Object { $_.Name -in @("ai-knowledge-admin.exe", "ai-knowledge-admin-latest.exe") } |
  Sort-Object Name |
  Select-Object Name, Length, LastWriteTime, FullName |
  Format-Table -AutoSize
