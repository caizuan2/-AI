param(
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "../..")
$ManifestDir = Join-Path $Root "artifacts/admin-ingest/web"
$ManifestPath = Join-Path $ManifestDir "manifest.json"

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

Push-Location $Root
try {
  $ReleaseInfo = node scripts/release/resolve-version.mjs --environment $env:RELEASE_ENV | ConvertFrom-Json
  $ReleaseHead = $env:RELEASE_HEAD
  if (-not $ReleaseHead) {
    $ReleaseHead = $ReleaseInfo.commit
  }
  $ReleaseTag = $env:RELEASE_TAG
  if (-not $ReleaseTag) {
    $ReleaseTag = $ReleaseInfo.tag
  }

  if ($DryRun) {
    Write-Host "WEB_BUILD_DRY_RUN=true"
    Write-Host "APP=admin-ingest"
    Write-Host "RELEASE_HEAD=$ReleaseHead"
    Write-Host "RELEASE_TAG=$ReleaseTag"
    Write-Host "COMMANDS=npm install --include=dev; npm run typecheck; npm run lint; npm run build; npx prisma validate"
    exit 0
  }

  node scripts/ci/verify-release-head.mjs --expected $ReleaseHead --label web
  Invoke-ProjectCommand -FilePath "npm" -Arguments @("install", "--include=dev")
  Invoke-ProjectCommand -FilePath "npm" -Arguments @("run", "typecheck")
  Invoke-ProjectCommand -FilePath "npm" -Arguments @("run", "lint")
  Invoke-ProjectCommand -FilePath "npm" -Arguments @("run", "build")
  Invoke-ProjectCommand -FilePath "npx" -Arguments @("prisma", "validate")

  $BuildIdPath = Join-Path $Root ".next/BUILD_ID"
  if (-not (Test-Path $BuildIdPath)) {
    throw "WEB_BUILD_ID_MISSING: .next/BUILD_ID was not generated."
  }

  $BuildId = (Get-Content -LiteralPath $BuildIdPath -Raw).Trim()
  New-Item -ItemType Directory -Force -Path $ManifestDir | Out-Null
  $Manifest = [ordered]@{
    platform = "web"
    app = "admin-ingest"
    available = $true
    head = $ReleaseHead
    commit = $ReleaseHead
    branch = $ReleaseInfo.branch
    tag = $ReleaseTag
    buildTime = (Get-Date).ToUniversalTime().ToString("o")
    buildId = $BuildId
    webUrl = $ReleaseInfo.webUrl
    path = ".next"
  }
  $Manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ManifestPath -Encoding UTF8
  Write-Host "WEB_BUILD_OK=true"
  Write-Host "WEB_MANIFEST=$ManifestPath"
} finally {
  Pop-Location
}
