param(
  [switch]$DryRun,
  [switch]$FailOnMissingApk
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "../..")
$ManifestDir = Join-Path $Root "artifacts/admin-ingest/apk"
$ManifestPath = Join-Path $ManifestDir "manifest.json"
$ExistingAdminApkScript = Join-Path $Root "scripts/build-admin-android-apk.ps1"
$AndroidDir = Join-Path $Root "android"
$FlutterPubspec = Join-Path $Root "flutter_app/pubspec.yaml"
$AdminConfig = Join-Path $Root "capacitor.admin.config.ts"

function Write-ApkManifest {
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
    platform = "apk"
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
  $ReleaseInfo = node scripts/ci/resolve-admin-ingest-release-info.mjs | ConvertFrom-Json
  $ReleaseHead = $env:RELEASE_HEAD
  if (-not $ReleaseHead) {
    $ReleaseHead = $ReleaseInfo.commit
  }
  $ReleaseTag = $env:RELEASE_TAG
  if (-not $ReleaseTag) {
    $ReleaseTag = $ReleaseInfo.tag
  }

  $UsesCapacitor = (Test-Path $ExistingAdminApkScript) -and (Test-Path $AdminConfig) -and (Test-Path $AndroidDir)
  $UsesFlutter = Test-Path $FlutterPubspec

  if ($DryRun) {
    Write-Host "APK_BUILD_DRY_RUN=true"
    Write-Host "APP=admin-ingest"
    Write-Host "RELEASE_HEAD=$ReleaseHead"
    Write-Host "RELEASE_TAG=$ReleaseTag"
    Write-Host "APK_BUILD_AVAILABLE=$($UsesCapacitor -or $UsesFlutter)"
    Write-Host "CAPACITOR_ADMIN_AVAILABLE=$UsesCapacitor"
    Write-Host "FLUTTER_AVAILABLE=$UsesFlutter"
    Write-Host "WEB_URL=$($ReleaseInfo.webUrl)"
    exit 0
  }

  node scripts/ci/verify-release-head.mjs --expected $ReleaseHead --label apk

  if (-not $UsesCapacitor -and -not $UsesFlutter) {
    Write-Host "APK_BUILD_AVAILABLE=false"
    Write-Host "APK_BUILD_REASON=APK_BUILD_ENTRY_NOT_FOUND"
    Write-ApkManifest -Available $false -Reason "APK_BUILD_ENTRY_NOT_FOUND" -ReleaseInfo $ReleaseInfo -ReleaseHead $ReleaseHead -ReleaseTag $ReleaseTag
    if ($FailOnMissingApk) {
      exit 1
    }
    exit 0
  }

  if (-not $env:ANDROID_HOME -and -not (Test-Path (Join-Path $AndroidDir "local.properties"))) {
    Write-Host "ANDROID_SDK_NOT_FOUND"
    Write-ApkManifest -Available $false -Reason "ANDROID_SDK_NOT_FOUND" -ReleaseInfo $ReleaseInfo -ReleaseHead $ReleaseHead -ReleaseTag $ReleaseTag
    if ($FailOnMissingApk) {
      exit 1
    }
    exit 0
  }

  $env:APP_TYPE = "ingest-admin"
  $env:WEB_URL = $ReleaseInfo.webUrl
  $env:NEXT_PUBLIC_ADMIN_APP_URL = $ReleaseInfo.webUrl
  $env:BUILD_COMMIT = $ReleaseHead
  $env:BUILD_TAG = $ReleaseTag

  if ($UsesCapacitor) {
    & powershell -ExecutionPolicy Bypass -File $ExistingAdminApkScript
  } elseif ($UsesFlutter) {
    Push-Location (Join-Path $Root "flutter_app")
    try {
      flutter --version
      flutter pub get
      flutter build apk --release --dart-define=APP_TYPE=ingest-admin --dart-define=WEB_URL=$($ReleaseInfo.webUrl) --dart-define=BUILD_COMMIT=$ReleaseHead --dart-define=BUILD_TAG=$ReleaseTag
    } finally {
      Pop-Location
    }
  }

  $Apk = Get-ChildItem -LiteralPath $Root -Recurse -File -Filter "*.apk" -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match "\\(dist-app|build)\\|/dist-app/|/build/" } |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1

  if (-not $Apk) {
    throw "APK_BUILD_OUTPUT_NOT_FOUND"
  }

  Write-ApkManifest -Available $true -Path $Apk.FullName -ReleaseInfo $ReleaseInfo -ReleaseHead $ReleaseHead -ReleaseTag $ReleaseTag
  Write-Host "APK_BUILD_OK=true"
  Write-Host "APK_PATH=$($Apk.FullName)"
  Write-Host "APK_HEAD=$ReleaseHead"
  Write-Host "APK_MATCHES_RELEASE_HEAD=true"
} catch {
  $Reason = $_.Exception.Message
  if ($Reason -match "SDK location not found|ANDROID_HOME|sdk.dir") {
    $Reason = "ANDROID_SDK_NOT_FOUND"
  }
  Write-ApkManifest -Available $false -Reason $Reason -ReleaseInfo $ReleaseInfo -ReleaseHead $ReleaseHead -ReleaseTag $ReleaseTag
  Write-Host "APK_BUILD_AVAILABLE=false"
  Write-Host "APK_BUILD_REASON=$Reason"
  throw
} finally {
  Pop-Location
}
