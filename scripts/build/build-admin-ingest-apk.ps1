param(
  [switch]$DryRun,
  [switch]$FailOnMissingApk
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "../..")
$ManifestDir = Join-Path $Root "artifacts/admin-ingest/apk"
$ManifestPath = Join-Path $ManifestDir "manifest.json"
$ReleaseAssetName = "admin-ingest.apk"
$ReleaseAssetPath = Join-Path $ManifestDir $ReleaseAssetName
$ExistingAdminApkScript = Join-Path $Root "scripts/build-admin-android-apk.ps1"
$AndroidDir = Join-Path $Root "android"
$FlutterPubspec = Join-Path $Root "flutter_app/pubspec.yaml"
$AdminConfig = Join-Path $Root "capacitor.admin.config.ts"
$PowerShellExecutable = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
if (-not $PowerShellExecutable) {
  $PowerShellExecutable = (Get-Command powershell -ErrorAction SilentlyContinue).Source
}

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
    if ($OutputText -match "SDK location not found|ANDROID_HOME|sdk.dir") {
      throw "ANDROID_SDK_NOT_FOUND"
    }

    throw $FailureReason
  }
}

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
    New-Item -ItemType Directory -Force -Path $ManifestDir | Out-Null
    $ResolvedSource = (Resolve-Path -LiteralPath $Path).Path
    $ResolvedAsset = if (Test-Path $ReleaseAssetPath) { (Resolve-Path -LiteralPath $ReleaseAssetPath).Path } else { $ReleaseAssetPath }
    if ($ResolvedSource -ne $ResolvedAsset) {
      Copy-Item -LiteralPath $Path -Destination $ReleaseAssetPath -Force
      $Path = $ReleaseAssetPath
    }
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
    assetName = $ReleaseAssetName
    downloadUrl = $ReleaseInfo.apkDownloadUrl
    latestDownloadUrl = $ReleaseInfo.latestApkUrl
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

  $UsesCapacitor = (Test-Path $ExistingAdminApkScript) -and (Test-Path $AdminConfig) -and (Test-Path $AndroidDir)
  $UsesFlutter = Test-Path $FlutterPubspec

  if ($DryRun) {
    $EntryType = if ($UsesCapacitor) { "Capacitor" } elseif ($UsesFlutter) { "Flutter" } else { "none" }
    Write-Host "APK_BUILD_DRY_RUN=true"
    Write-Host "APP=admin-ingest"
    Write-Host "RELEASE_HEAD=$ReleaseHead"
    Write-Host "RELEASE_TAG=$ReleaseTag"
    Write-Host "APK_BUILD_AVAILABLE=$($UsesCapacitor -or $UsesFlutter)"
    Write-Host "APK_ENTRY_TYPE=$EntryType"
    Write-Host "CAPACITOR_ADMIN_AVAILABLE=$UsesCapacitor"
    Write-Host "FLUTTER_AVAILABLE=$UsesFlutter"
    Write-Host "APP_TYPE=ingest-admin"
    Write-Host "WEB_URL=$($ReleaseInfo.webUrl)"
    Write-Host "BUILD_COMMIT=$ReleaseHead"
    Write-Host "BUILD_TAG=$ReleaseTag"
    Write-Host "BUILD_ENV=$($ReleaseInfo.environment)"
    exit 0
  }

  node scripts/ci/verify-release-head.mjs --expected $ReleaseHead --label apk
  $BuildStartedAtUtc = (Get-Date).ToUniversalTime().AddSeconds(-5)

  if (-not $UsesCapacitor -and -not $UsesFlutter) {
    Write-Host "APK_BUILD_AVAILABLE=false"
    Write-Host "APK_BUILD_REASON=APK_ENTRY_NOT_FOUND"
    Write-ApkManifest -Available $false -Reason "APK_ENTRY_NOT_FOUND" -ReleaseInfo $ReleaseInfo -ReleaseHead $ReleaseHead -ReleaseTag $ReleaseTag
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
  $env:BUILD_ENV = $ReleaseInfo.environment

  if ($UsesCapacitor) {
    if (-not $PowerShellExecutable) {
      throw "POWERSHELL_RUNTIME_NOT_FOUND"
    }
    Invoke-CheckedCommand -FailureReason "APK_CAPACITOR_BUILD_FAILED" -Command { & $PowerShellExecutable -ExecutionPolicy Bypass -File $ExistingAdminApkScript }
  } elseif ($UsesFlutter) {
    Push-Location (Join-Path $Root "flutter_app")
    try {
      Invoke-CheckedCommand -FailureReason "APK_FLUTTER_VERSION_FAILED" -Command { flutter --version }
      Invoke-CheckedCommand -FailureReason "APK_FLUTTER_PUB_GET_FAILED" -Command { flutter pub get }
      Invoke-CheckedCommand -FailureReason "APK_FLUTTER_BUILD_FAILED" -Command { flutter build apk --release --dart-define=APP_TYPE=ingest-admin --dart-define=WEB_URL=$($ReleaseInfo.webUrl) --dart-define=BUILD_COMMIT=$ReleaseHead --dart-define=BUILD_TAG=$ReleaseTag }
    } finally {
      Pop-Location
    }
  }

  $Apk = Get-ChildItem -LiteralPath $Root -Recurse -File -Filter "*.apk" -ErrorAction SilentlyContinue |
    Where-Object {
      $_.FullName -match "\\(dist-app|build)\\|/dist-app/|/build/" -and
      $_.LastWriteTimeUtc -ge $BuildStartedAtUtc
    } |
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
  if ($FailOnMissingApk) {
    throw
  }
  exit 0
} finally {
  Pop-Location
}
