$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$AndroidDir = Join-Path $Root "android"
$AdminConfig = Join-Path $Root "capacitor.admin.config.ts"
$UserConfig = Join-Path $Root "capacitor.config.ts"
$BuildGradle = Join-Path $AndroidDir "app/build.gradle"
$OutputDir = Join-Path $Root "dist-app/admin-android"
$PublicAdminDir = Join-Path $Root "public/downloads/admin"
$OutputApk = Join-Path $OutputDir "ai-knowledge-admin.apk"
$LatestOutputApk = Join-Path $OutputDir "ai-knowledge-admin-latest.apk"
$AdminIconSourceDir = Join-Path $Root "assets/admin-ingest/android-icons"
$AndroidResDir = Join-Path $AndroidDir "app/src/main/res"

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
      throw "Command failed: $FilePath $($Arguments -join ' ')"
    }
  } finally {
    Pop-Location
  }
}

if (-not (Test-Path $AdminConfig)) {
  throw "Admin Capacitor config not found: $AdminConfig"
}

if (-not (Test-Path (Join-Path $Root "node_modules/@capacitor/core"))) {
  throw "Capacitor dependencies are missing. Please run pnpm install before building admin Android APK."
}

if (-not (Test-Path $AndroidDir)) {
  throw "Android project was not found. Run the user app Android setup first."
}

if (Test-Path $OutputDir) {
  Get-ChildItem -LiteralPath $OutputDir -Force -ErrorAction SilentlyContinue |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
} else {
  New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
}

New-Item -ItemType Directory -Force -Path $PublicAdminDir | Out-Null
Remove-Item -LiteralPath (Join-Path $PublicAdminDir "ai-knowledge-admin.apk") -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $PublicAdminDir "ai-knowledge-admin-latest.apk") -Force -ErrorAction SilentlyContinue

$OriginalBuildGradleBytes = if (Test-Path $BuildGradle) { [System.IO.File]::ReadAllBytes($BuildGradle) } else { $null }
$OriginalUserConfigBytes = [System.IO.File]::ReadAllBytes($UserConfig)
$OriginalLauncherIconBytes = @{}
$usedTemporaryConfig = $false
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)

function Backup-AndroidLauncherIcons {
  $OriginalLauncherIconBytes.Clear()

  if (-not (Test-Path $AndroidResDir)) {
    return
  }

  Get-ChildItem -LiteralPath $AndroidResDir -Recurse -File -Include "ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png" -ErrorAction SilentlyContinue |
    ForEach-Object {
      $OriginalLauncherIconBytes[$_.FullName] = [System.IO.File]::ReadAllBytes($_.FullName)
    }
}

function Restore-AndroidLauncherIcons {
  foreach ($Entry in $OriginalLauncherIconBytes.GetEnumerator()) {
    [System.IO.File]::WriteAllBytes([string]$Entry.Key, [byte[]]$Entry.Value)
  }
}

function Copy-AdminLauncherIcons {
  if (-not (Test-Path $AdminIconSourceDir)) {
    throw "Admin launcher icon source not found: $AdminIconSourceDir"
  }

  Get-ChildItem -LiteralPath $AdminIconSourceDir -Recurse -File -Include "ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png" |
    ForEach-Object {
      $RelativePath = $_.FullName.Substring($AdminIconSourceDir.Length).TrimStart("\", "/")
      $Destination = Join-Path $AndroidResDir $RelativePath
      $DestinationDir = Split-Path -Parent $Destination

      if (-not (Test-Path $DestinationDir)) {
        throw "Android launcher icon destination not found: $DestinationDir"
      }

      Copy-Item -LiteralPath $_.FullName -Destination $Destination -Force
    }
}

try {
  try {
    Invoke-ProjectCommand -FilePath "npx" -Arguments @("cap", "sync", "android", "--config", "capacitor.admin.config.ts")
  } catch {
    Write-Warning "Capacitor --config sync failed, using temporary capacitor.config.ts fallback."
    $usedTemporaryConfig = $true
    Copy-Item -LiteralPath $AdminConfig -Destination $UserConfig -Force
    Invoke-ProjectCommand -FilePath "npx" -Arguments @("cap", "sync", "android")
  }

  if (-not (Test-Path $BuildGradle)) {
    throw "Android build.gradle was not found: $BuildGradle"
  }

  $adminBuildGradle = Get-Content -LiteralPath $BuildGradle -Raw
  if ($adminBuildGradle -notmatch 'applicationId\s+"[^"]+"') {
    throw "Unable to find applicationId in $BuildGradle"
  }

  $adminBuildGradle = [regex]::Replace($adminBuildGradle, 'applicationId\s+"[^"]+"', 'applicationId "com.aiknowledge.admin"', 1)
  [System.IO.File]::WriteAllText($BuildGradle, $adminBuildGradle, $utf8NoBom)

  Backup-AndroidLauncherIcons
  Copy-AdminLauncherIcons

  $GradleWrapper = Join-Path $AndroidDir "gradlew.bat"
  if (-not (Test-Path $GradleWrapper)) {
    throw "Android Gradle wrapper was not found."
  }

  Invoke-ProjectCommand -FilePath $GradleWrapper -Arguments @("assembleDebug") -WorkingDirectory $AndroidDir

  $SourceApk = Join-Path $AndroidDir "app/build/outputs/apk/debug/app-debug.apk"
  if (-not (Test-Path $SourceApk)) {
    throw "No debug APK was generated: $SourceApk"
  }

  Copy-Item -LiteralPath $SourceApk -Destination $OutputApk -Force
  Copy-Item -LiteralPath $SourceApk -Destination $LatestOutputApk -Force

  Get-ChildItem -LiteralPath $OutputDir -File |
    Sort-Object Name |
    Select-Object Name, Length, LastWriteTime, FullName |
    Format-Table -AutoSize
} finally {
  if ($null -ne $OriginalBuildGradleBytes) {
    [System.IO.File]::WriteAllBytes($BuildGradle, $OriginalBuildGradleBytes)
  }

  if ($usedTemporaryConfig) {
    [System.IO.File]::WriteAllBytes($UserConfig, $OriginalUserConfigBytes)
  }

  try {
    Invoke-ProjectCommand -FilePath "npx" -Arguments @("cap", "sync", "android")
  } catch {
    Write-Warning "Failed to resync user Android config after admin build. Please run npx cap sync android manually."
  }

  Restore-AndroidLauncherIcons
}
