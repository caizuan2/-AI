param(
  [string]$SdkPath = "",
  [switch]$NoPersist,
  [switch]$SkipCapacitorSync
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$AndroidDir = Join-Path $Root "android"
$LocalPropertiesPath = Join-Path $AndroidDir "local.properties"

function Write-Step {
  param([Parameter(Mandatory = $true)][string]$Message)
  Write-Host ""
  Write-Host "==> $Message"
}

function Get-LocalPropertiesSdkPath {
  if (-not (Test-Path $LocalPropertiesPath)) {
    return ""
  }

  $line = Get-Content -LiteralPath $LocalPropertiesPath -ErrorAction SilentlyContinue |
    Where-Object { $_ -match "^\s*sdk\.dir\s*=" } |
    Select-Object -First 1

  if (-not $line) {
    return ""
  }

  return (($line -replace "^\s*sdk\.dir\s*=", "").Trim() -replace "/", "\")
}

function Test-AndroidSdkPath {
  param([string]$Path)

  if (-not $Path -or -not (Test-Path $Path)) {
    return $false
  }

  $requiredChildren = @("platforms", "platform-tools")

  foreach ($child in $requiredChildren) {
    if (-not (Test-Path (Join-Path $Path $child))) {
      return $false
    }
  }

  return $true
}

function Resolve-AndroidSdkPath {
  $candidates = @()

  if ($SdkPath) {
    $candidates += $SdkPath
  }
  if ($env:ANDROID_HOME) {
    $candidates += $env:ANDROID_HOME
  }
  if ($env:ANDROID_SDK_ROOT) {
    $candidates += $env:ANDROID_SDK_ROOT
  }

  $localPropertiesSdkPath = Get-LocalPropertiesSdkPath
  if ($localPropertiesSdkPath) {
    $candidates += $localPropertiesSdkPath
  }

  if ($env:LOCALAPPDATA) {
    $candidates += (Join-Path $env:LOCALAPPDATA "Android\Sdk")
  }

  if ($env:USERPROFILE) {
    $candidates += (Join-Path $env:USERPROFILE "AppData\Local\Android\Sdk")
  }

  $candidates += "C:\Android\Sdk"
  $candidates += "C:\Program Files\Android\Sdk"

  foreach ($candidate in $candidates) {
    $resolved = $candidate.Trim()

    if (Test-AndroidSdkPath $resolved) {
      return (Resolve-Path $resolved).Path
    }
  }

  throw @"
Android SDK was not found.

Install Android Studio or Android command line tools, then run one of:
  npm run fix:all
  powershell -ExecutionPolicy Bypass -File scripts/fix-android-env.ps1 -SdkPath "C:\Users\<you>\AppData\Local\Android\Sdk"

Checked ANDROID_HOME, ANDROID_SDK_ROOT, android/local.properties, and common Windows SDK locations.
"@
}

function Add-ProcessPath {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path $Path)) {
    return
  }

  $pathParts = ($env:Path -split ";") | Where-Object { $_ }
  if ($pathParts -notcontains $Path) {
    $env:Path = "$Path;$env:Path"
  }
}

function Set-AndroidEnvironment {
  param([Parameter(Mandatory = $true)][string]$ResolvedSdkPath)

  $env:ANDROID_HOME = $ResolvedSdkPath
  $env:ANDROID_SDK_ROOT = $ResolvedSdkPath

  Add-ProcessPath (Join-Path $ResolvedSdkPath "platform-tools")
  Add-ProcessPath (Join-Path $ResolvedSdkPath "emulator")
  Add-ProcessPath (Join-Path $ResolvedSdkPath "cmdline-tools\latest\bin")
  Add-ProcessPath (Join-Path $ResolvedSdkPath "tools\bin")

  if (-not $NoPersist) {
    [Environment]::SetEnvironmentVariable("ANDROID_HOME", $ResolvedSdkPath, "User")
    [Environment]::SetEnvironmentVariable("ANDROID_SDK_ROOT", $ResolvedSdkPath, "User")
  }
}

function Write-LocalProperties {
  param([Parameter(Mandatory = $true)][string]$ResolvedSdkPath)

  if (-not (Test-Path $AndroidDir)) {
    New-Item -ItemType Directory -Force -Path $AndroidDir | Out-Null
  }

  $sdkDir = $ResolvedSdkPath.Replace("\", "/")
  $lines = @()

  if (Test-Path $LocalPropertiesPath) {
    $lines = Get-Content -LiteralPath $LocalPropertiesPath |
      Where-Object { $_ -notmatch "^\s*sdk\.dir\s*=" }
  }

  $lines = @("sdk.dir=$sdkDir") + $lines
  Set-Content -LiteralPath $LocalPropertiesPath -Value $lines -Encoding utf8
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

Write-Step "Detecting Android SDK"
$ResolvedSdkPath = Resolve-AndroidSdkPath
Write-Host "Android SDK: $ResolvedSdkPath"

Write-Step "Repairing Android environment variables"
Set-AndroidEnvironment -ResolvedSdkPath $ResolvedSdkPath
Write-Host "ANDROID_HOME=$env:ANDROID_HOME"
Write-Host "ANDROID_SDK_ROOT=$env:ANDROID_SDK_ROOT"

Write-Step "Writing android/local.properties"
Write-LocalProperties -ResolvedSdkPath $ResolvedSdkPath
Write-Host "Updated: $LocalPropertiesPath"

if (-not $SkipCapacitorSync) {
  Write-Step "Running Capacitor sync for Android"
  Invoke-ProjectCommand -FilePath "npx" -Arguments @("cap", "sync", "android")
}

Write-Host ""
Write-Host "Android environment is ready."
