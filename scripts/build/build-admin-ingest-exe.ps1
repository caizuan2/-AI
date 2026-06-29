param(
  [switch]$DryRun,
  [switch]$FailOnMissingExe
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "../..")
$ManifestDir = Join-Path $Root "artifacts/admin-ingest/exe"
$ManifestPath = Join-Path $ManifestDir "manifest.json"
$ElectronIngestConfig = Join-Path $Root "electron/admin-ingest/electron-builder.yml"
$FlutterPubspec = Join-Path $Root "flutter_app/pubspec.yaml"
$TauriConfig = Join-Path $Root "src-tauri/tauri.conf.json"

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory = $true)][scriptblock]$Command,
    [Parameter(Mandatory = $true)][string]$FailureReason
  )

  $PreviousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $Output = & $Command 2>&1
    $ExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $PreviousErrorActionPreference
  }
  $Output | ForEach-Object { Write-Host $_ }

  if ($ExitCode -ne 0) {
    $OutputText = ($Output | Out-String)
    if ($OutputText -match "ETIMEDOUT|ECONNRESET|ENOTFOUND|connect|timeout|Timeout") {
      throw "EXE_DEPENDENCY_DOWNLOAD_TIMEOUT"
    }

    throw $FailureReason
  }
}

function Write-ExeManifest {
  param(
    [Parameter(Mandatory = $true)][bool]$Available,
    [string]$Path,
    [string]$Reason,
    [object]$ReleaseInfo,
    [string]$ReleaseHead,
    [string]$ReleaseTag
  )

  New-Item -ItemType Directory -Force -Path $ManifestDir | Out-Null
  $Size = $null
  $Sha256 = $null
  $LastWriteTime = $null
  if ($Available -and $Path -and (Test-Path $Path)) {
    $Item = Get-Item -LiteralPath $Path
    $Size = $Item.Length
    $Sha256 = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    $LastWriteTime = $Item.LastWriteTimeUtc.ToString("o")
  }

  $Manifest = [ordered]@{
    platform = "exe"
    app = "admin-ingest"
    available = $Available
    head = $ReleaseHead
    commit = $ReleaseHead
    branch = $ReleaseInfo.branch
    tag = $ReleaseTag
    buildTime = (Get-Date).ToUniversalTime().ToString("o")
    path = $Path
    size = $Size
    sha256 = $Sha256
    lastWriteTime = $LastWriteTime
    reason = $Reason
  }
  $Manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ManifestPath -Encoding UTF8
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

  $UsesElectron = Test-Path $ElectronIngestConfig
  $UsesFlutterWindows = (Test-Path $FlutterPubspec) -and (Test-Path (Join-Path $Root "flutter_app/windows"))
  $UsesTauri = Test-Path $TauriConfig

  if ($DryRun) {
    $EntryType = if ($UsesElectron) { "Electron" } elseif ($UsesFlutterWindows) { "Flutter Windows" } elseif ($UsesTauri) { "Tauri" } else { "none" }
    Write-Host "EXE_BUILD_DRY_RUN=true"
    Write-Host "APP=admin-ingest"
    Write-Host "RELEASE_HEAD=$ReleaseHead"
    Write-Host "RELEASE_TAG=$ReleaseTag"
    Write-Host "EXE_BUILD_AVAILABLE=$($UsesElectron -or $UsesFlutterWindows -or $UsesTauri)"
    Write-Host "EXE_ENTRY_TYPE=$EntryType"
    Write-Host "ELECTRON_AVAILABLE=$UsesElectron"
    Write-Host "FLUTTER_WINDOWS_AVAILABLE=$UsesFlutterWindows"
    Write-Host "TAURI_AVAILABLE=$UsesTauri"
    Write-Host "APP_TYPE=ingest-admin"
    Write-Host "WEB_URL=$($ReleaseInfo.webUrl)"
    Write-Host "BUILD_COMMIT=$ReleaseHead"
    Write-Host "BUILD_TAG=$ReleaseTag"
    Write-Host "BUILD_ENV=$($ReleaseInfo.environment)"
    exit 0
  }

  node scripts/ci/verify-release-head.mjs --expected $ReleaseHead --label exe
  $BuildStartedAtUtc = (Get-Date).ToUniversalTime().AddSeconds(-5)

  if (-not $UsesElectron -and -not $UsesFlutterWindows -and -not $UsesTauri) {
    Write-Host "EXE_BUILD_AVAILABLE=false"
    Write-Host "EXE_BUILD_REASON=EXE_ENTRY_NOT_FOUND"
    Write-ExeManifest -Available $false -Reason "EXE_ENTRY_NOT_FOUND" -ReleaseInfo $ReleaseInfo -ReleaseHead $ReleaseHead -ReleaseTag $ReleaseTag
    if ($FailOnMissingExe) {
      exit 1
    }
    exit 0
  }

  $env:APP_TYPE = "ingest-admin"
  $env:WEB_URL = $ReleaseInfo.webUrl
  $env:ADMIN_INGEST_APP_URL = $ReleaseInfo.webUrl
  $env:ADMIN_APP_URL = $ReleaseInfo.webUrl
  $env:BUILD_COMMIT = $ReleaseHead
  $env:BUILD_TAG = $ReleaseTag
  $env:BUILD_ENV = $ReleaseInfo.environment

  if ($UsesElectron) {
    Invoke-CheckedCommand -FailureReason "EXE_NPM_INSTALL_FAILED" -Command { npm install --include=dev }
    Invoke-CheckedCommand -FailureReason "EXE_BUILD_FAILED" -Command { npm run admin-ingest:desktop:build }
  } elseif ($UsesFlutterWindows) {
    Push-Location (Join-Path $Root "flutter_app")
    try {
      Invoke-CheckedCommand -FailureReason "EXE_FLUTTER_VERSION_FAILED" -Command { flutter --version }
      Invoke-CheckedCommand -FailureReason "EXE_FLUTTER_PUB_GET_FAILED" -Command { flutter pub get }
      Invoke-CheckedCommand -FailureReason "EXE_FLUTTER_BUILD_FAILED" -Command { flutter build windows --release --dart-define=APP_TYPE=ingest-admin --dart-define=WEB_URL=$($ReleaseInfo.webUrl) --dart-define=BUILD_COMMIT=$ReleaseHead --dart-define=BUILD_TAG=$ReleaseTag }
    } finally {
      Pop-Location
    }
  } elseif ($UsesTauri) {
    Invoke-CheckedCommand -FailureReason "EXE_NPM_INSTALL_FAILED" -Command { npm install --include=dev }
    Invoke-CheckedCommand -FailureReason "EXE_TAURI_BUILD_FAILED" -Command { npm run tauri build }
  }

  $Exe = Get-ChildItem -LiteralPath $Root -Recurse -File -Filter "*.exe" -ErrorAction SilentlyContinue |
    Where-Object {
      $_.FullName -match "\\(dist-app|build|target)\\|/dist-app/|/build/|/target/" -and
      $_.FullName -notmatch "\\node_modules\\|/node_modules/" -and
      $_.FullName -notmatch "\\resources\\elevate\.exe$" -and
      $_.LastWriteTimeUtc -ge $BuildStartedAtUtc
    } |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1

  if (-not $Exe) {
    throw "EXE_BUILD_OUTPUT_NOT_FOUND"
  }

  Write-ExeManifest -Available $true -Path $Exe.FullName -ReleaseInfo $ReleaseInfo -ReleaseHead $ReleaseHead -ReleaseTag $ReleaseTag
  Write-Host "EXE_BUILD_OK=true"
  Write-Host "EXE_PATH=$($Exe.FullName)"
  Write-Host "EXE_HEAD=$ReleaseHead"
  Write-Host "EXE_MATCHES_RELEASE_HEAD=true"
} catch {
  $Reason = $_.Exception.Message
  if ($Reason -match "ETIMEDOUT|ECONNRESET|ENOTFOUND|connect|timeout") {
    $Reason = "EXE_DEPENDENCY_DOWNLOAD_TIMEOUT"
  }
  Write-ExeManifest -Available $false -Reason $Reason -ReleaseInfo $ReleaseInfo -ReleaseHead $ReleaseHead -ReleaseTag $ReleaseTag
  Write-Host "EXE_BUILD_AVAILABLE=false"
  Write-Host "EXE_BUILD_REASON=$Reason"
  if ($FailOnMissingExe) {
    throw
  }
  exit 0
} finally {
  Pop-Location
}
