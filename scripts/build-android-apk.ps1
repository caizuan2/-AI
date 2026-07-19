param(
  [ValidateSet("Debug", "Release")]
  [string]$Configuration = "Debug",
  [switch]$SkipWebBuild
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$AndroidDir = Join-Path $Root "android"
$OutputDir = Join-Path $Root "dist-app/android"
$OutputApk = Join-Path $OutputDir "ai-knowledge-chat.apk"
$LegacyOutputApk = Join-Path $OutputDir "AI知识库助手.apk"

function Invoke-ProjectCommand {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [string]$WorkingDirectory = $Root
  )

  Push-Location $WorkingDirectory
  try {
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed: $FilePath (exit $LASTEXITCODE)"
    }
  } finally {
    Pop-Location
  }
}

if (-not (Test-Path (Join-Path $Root "node_modules/@capacitor/core"))) {
  throw "Capacitor dependencies are missing. Please run pnpm install before building Android APK."
}

if (-not $SkipWebBuild) {
  Invoke-ProjectCommand -FilePath "npm" -Arguments @("run", "build")
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

if (-not (Test-Path $AndroidDir)) {
  Invoke-ProjectCommand -FilePath "npx" -Arguments @("cap", "add", "android")
}

$GradleWrapper = Join-Path $AndroidDir "gradlew.bat"
if (-not (Test-Path $GradleWrapper)) {
  throw "Android Gradle wrapper was not found. Open the generated android project or run npx cap add android again."
}

$hasReleaseSigning =
  $env:ANDROID_KEYSTORE_PATH -and
  $env:ANDROID_KEYSTORE_PASSWORD -and
  $env:ANDROID_KEY_ALIAS -and
  $env:ANDROID_KEY_PASSWORD

if ($Configuration -eq "Release" -and -not $hasReleaseSigning) {
  throw "Release build requires ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, and ANDROID_KEY_PASSWORD."
}

$AndroidBuildArguments = @("scripts/build-user-android.mjs")
if ($Configuration -eq "Debug") {
  $AndroidBuildArguments += "--debug"
} else {
  $AndroidBuildArguments += @(
    "-Pandroid.injected.signing.store.file=$($env:ANDROID_KEYSTORE_PATH)",
    "-Pandroid.injected.signing.store.password=$($env:ANDROID_KEYSTORE_PASSWORD)",
    "-Pandroid.injected.signing.key.alias=$($env:ANDROID_KEY_ALIAS)",
    "-Pandroid.injected.signing.key.password=$($env:ANDROID_KEY_PASSWORD)"
  )
}
Invoke-ProjectCommand -FilePath "node" -Arguments $AndroidBuildArguments

$candidateApks = @()
if ($Configuration -eq "Release") {
  $candidateApks += Join-Path $AndroidDir "app/build/outputs/apk/release/app-release.apk"
  $candidateApks += Join-Path $AndroidDir "app/build/outputs/apk/release/app-release-unsigned.apk"
}
$candidateApks += Join-Path $AndroidDir "app/build/outputs/apk/debug/app-debug.apk"

$SourceApk = $candidateApks | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $SourceApk) {
  throw "No APK was generated under android/app/build/outputs/apk."
}

Copy-Item -LiteralPath $SourceApk -Destination $OutputApk -Force

Write-Host "Android APK generated: $OutputApk"
