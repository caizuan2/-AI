param(
  [string]$Version = "",
  [int]$Build = 0,
  [ValidateSet("Debug", "Release")]
  [string]$AndroidConfiguration = "Debug",
  [string]$AndroidSdkPath = "",
  [switch]$NoPersistAndroidEnv,
  [switch]$SkipAndroid,
  [switch]$SkipWindows,
  [switch]$SkipCopyInstallers,
  [switch]$SkipManifest
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$AppVersionFile = Join-Path $Root "lib/app-version.ts"
$FixAndroidEnvScript = Join-Path $PSScriptRoot "fix-android-env.ps1"
$ReleaseScript = Join-Path $PSScriptRoot "release-all-installers.ps1"

function Write-Step {
  param([Parameter(Mandatory = $true)][string]$Message)
  Write-Host ""
  Write-Host "==> $Message"
}

function Invoke-ProjectCommand {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [string]$WorkingDirectory = $Root
  )

  Push-Location $WorkingDirectory
  try {
    Write-Host "> $FilePath $($Arguments -join ' ')"
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed: $FilePath $($Arguments -join ' ')"
    }
  } finally {
    Pop-Location
  }
}

function Invoke-NpmScript {
  param([Parameter(Mandatory = $true)][string]$ScriptName)
  Invoke-ProjectCommand -FilePath "npm" -Arguments @("run", $ScriptName)
}

function Get-AppVersionDefaults {
  if (-not (Test-Path $AppVersionFile)) {
    throw "App version file was not found: $AppVersionFile"
  }

  $source = Get-Content -LiteralPath $AppVersionFile -Raw
  $versionMatch = [regex]::Match($source, 'APP_VERSION\s*=\s*"([^"]+)"')
  $buildMatch = [regex]::Match($source, 'APP_BUILD\s*=\s*(\d+)')

  if (-not $versionMatch.Success -or -not $buildMatch.Success) {
    throw "Unable to read APP_VERSION or APP_BUILD from lib/app-version.ts"
  }

  return [pscustomobject]@{
    Version = $versionMatch.Groups[1].Value
    Build = [int]$buildMatch.Groups[1].Value
  }
}

function Assert-NodeDependencies {
  $requiredPaths = @(
    "node_modules/@capacitor/core",
    "node_modules/@capacitor/cli",
    "node_modules/electron",
    "node_modules/electron-builder"
  )

  foreach ($relativePath in $requiredPaths) {
    $absolutePath = Join-Path $Root $relativePath
    if (-not (Test-Path $absolutePath)) {
      throw "Missing dependency: $relativePath. Run pnpm install or npm install before packaging."
    }
  }
}

$defaults = Get-AppVersionDefaults
if (-not $Version) {
  $Version = $defaults.Version
}

if ($Build -le 0) {
  $Build = $defaults.Build
}

Write-Step "Preparing full app packaging"
Write-Host "Version: $Version"
Write-Host "Build: $Build"
Write-Host "Android configuration: $AndroidConfiguration"

Assert-NodeDependencies

if (-not $SkipAndroid) {
  Write-Step "Fixing Android SDK environment"
  $fixArguments = @()
  if ($AndroidSdkPath) {
    $fixArguments += "-SdkPath"
    $fixArguments += $AndroidSdkPath
  }
  if ($NoPersistAndroidEnv) {
    $fixArguments += "-NoPersist"
  }

  & $FixAndroidEnvScript @fixArguments
  if ($LASTEXITCODE -ne 0) {
    throw "Android environment repair failed."
  }

  Write-Step "Building user Android APK"
  Invoke-ProjectCommand -FilePath "powershell" -Arguments @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    "scripts/build-android-apk.ps1",
    "-Configuration",
    $AndroidConfiguration
  )

  Write-Step "Building admin Android APK"
  Invoke-NpmScript "admin:android"
}

if (-not $SkipWindows) {
  Write-Step "Building user Windows EXE"
  Invoke-NpmScript "app:windows"

  Write-Step "Building admin Windows EXE"
  Invoke-NpmScript "admin:windows"
}

if (-not $SkipCopyInstallers) {
  Write-Step "Copying generated installers to public downloads"
  Invoke-NpmScript "installers:copy"
}

if (-not $SkipManifest) {
  Write-Step "Generating latest.json"
  Invoke-ProjectCommand -FilePath "powershell" -Arguments @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    "scripts/release-all-installers.ps1",
    "-Version",
    $Version,
    "-Build",
    [string]$Build,
    "-ManifestOnly"
  )
}

Write-Host ""
Write-Host "Full packaging flow completed."
