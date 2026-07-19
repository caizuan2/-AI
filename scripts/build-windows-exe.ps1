$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$OutputDir = Join-Path $Root "dist-app/windows"
$OutputExe = Join-Path $OutputDir "ai-knowledge-chat.exe"
$LegacyOutputExe = Join-Path $OutputDir "AI知识库助手.exe"

function Invoke-ProjectCommand {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [ValidateRange(1, 3)][int]$MaxAttempts = 1
  )

  Push-Location $Root
  try {
    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
      & $FilePath @Arguments
      if ($LASTEXITCODE -eq 0) {
        return
      }

      if ($attempt -eq $MaxAttempts) {
        throw "Command failed after $MaxAttempts attempt(s): $FilePath (exit $LASTEXITCODE)"
      }

      Write-Warning "Command failed with exit $LASTEXITCODE. Retrying attempt $($attempt + 1) of $MaxAttempts..."
      Start-Sleep -Seconds 5
    }
  } finally {
    Pop-Location
  }
}

if (-not (Test-Path (Join-Path $Root "node_modules/electron"))) {
  throw "Electron dependencies are missing. Please run pnpm install before building Windows EXE."
}

if (-not (Test-Path (Join-Path $Root "node_modules/electron-builder"))) {
  throw "electron-builder dependency is missing. Please run pnpm install before building Windows EXE."
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

if (-not $env:USER_APP_URL) {
  $env:USER_APP_URL = "https://stately-sawine-1efd4d.netlify.app/login?app=user&next=/chat-ui"
}

$VersionInfo = Get-Content -LiteralPath (Join-Path $Root "version.json") -Raw | ConvertFrom-Json
if (-not ($VersionInfo.version -is [string]) -or $VersionInfo.version -notmatch '^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$') {
  throw "version.json does not contain a valid semantic version."
}

$BuildStartedAt = (Get-Date).ToUniversalTime()
Invoke-ProjectCommand -FilePath "npx" -Arguments @(
  "electron-builder",
  "--win",
  "portable",
  "--publish",
  "never",
  "--config.extraMetadata.version=$($VersionInfo.version)"
) -MaxAttempts 3

$GeneratedExe = Get-ChildItem -LiteralPath $OutputDir -File -Filter "*.exe" -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -ne $OutputExe -and $_.LastWriteTimeUtc -ge $BuildStartedAt.AddSeconds(-2) } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $GeneratedExe) {
  $GeneratedExe = Get-ChildItem -LiteralPath $OutputDir -Recurse -File -Filter "*.exe" -ErrorAction SilentlyContinue |
    Where-Object {
      $_.FullName -notmatch "\\resources\\elevate\.exe$" -and
      $_.FullName -ne $OutputExe -and
      $_.LastWriteTimeUtc -ge $BuildStartedAt.AddSeconds(-2)
    } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
}

if (-not $GeneratedExe) {
  throw "No Windows EXE was generated under $OutputDir."
}

if ($GeneratedExe.FullName -ne $OutputExe) {
  Copy-Item -LiteralPath $GeneratedExe.FullName -Destination $OutputExe -Force
}

Write-Host "Windows EXE generated: $OutputExe"
