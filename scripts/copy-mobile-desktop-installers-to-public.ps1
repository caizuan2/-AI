$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$MaxGitHubFileSize = 100MB

function Copy-InstallerIfExists {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$DestinationDirectory,
    [Parameter(Mandatory = $true)][string]$DestinationName
  )

  if (-not (Test-Path $Source)) {
    Write-Host "Installer not found, skipping: $Source"
    return
  }

  New-Item -ItemType Directory -Force -Path $DestinationDirectory | Out-Null
  $file = Get-Item -LiteralPath $Source
  $destination = Join-Path $DestinationDirectory $DestinationName

  Copy-Item -LiteralPath $file.FullName -Destination $destination -Force
  $sizeMb = [Math]::Round($file.Length / 1MB, 2)
  Write-Host "Copied $DestinationName ($sizeMb MB) -> $destination"

  if ($file.Length -gt $MaxGitHubFileSize) {
    Write-Warning "$DestinationName is larger than 100MB. Do not git add it; publish via GitHub Release or object storage."
  }
}

$DownloadsDir = Join-Path $Root "public/downloads"
$AdminDownloadsDir = Join-Path $Root "public/downloads/admin"
$IosDownloadsDir = Join-Path $Root "public/downloads/ios"
$AdminIosDownloadsDir = Join-Path $Root "public/downloads/admin/ios"
$MacDownloadsDir = Join-Path $Root "public/downloads/macos"
$AdminMacDownloadsDir = Join-Path $Root "public/downloads/admin/macos"

Copy-InstallerIfExists -Source (Join-Path $Root "dist-app/android/ai-knowledge-chat.apk") -DestinationDirectory $DownloadsDir -DestinationName "ai-knowledge-chat.apk"
Copy-InstallerIfExists -Source (Join-Path $Root "dist-app/android/ai-knowledge-chat-latest.apk") -DestinationDirectory $DownloadsDir -DestinationName "ai-knowledge-chat-latest.apk"
Copy-InstallerIfExists -Source (Join-Path $Root "dist-app/admin-android/ai-knowledge-admin.apk") -DestinationDirectory $AdminDownloadsDir -DestinationName "ai-knowledge-admin.apk"
Copy-InstallerIfExists -Source (Join-Path $Root "dist-app/admin-android/ai-knowledge-admin-latest.apk") -DestinationDirectory $AdminDownloadsDir -DestinationName "ai-knowledge-admin-latest.apk"

Copy-InstallerIfExists -Source (Join-Path $Root "dist-app/ios/ai-knowledge-chat.ipa") -DestinationDirectory $IosDownloadsDir -DestinationName "ai-knowledge-chat.ipa"
Copy-InstallerIfExists -Source (Join-Path $Root "dist-app/ios/ai-knowledge-chat-latest.ipa") -DestinationDirectory $IosDownloadsDir -DestinationName "ai-knowledge-chat-latest.ipa"
Copy-InstallerIfExists -Source (Join-Path $Root "dist-app/admin-ios/ai-knowledge-admin.ipa") -DestinationDirectory $AdminIosDownloadsDir -DestinationName "ai-knowledge-admin.ipa"
Copy-InstallerIfExists -Source (Join-Path $Root "dist-app/admin-ios/ai-knowledge-admin-latest.ipa") -DestinationDirectory $AdminIosDownloadsDir -DestinationName "ai-knowledge-admin-latest.ipa"

Copy-InstallerIfExists -Source (Join-Path $Root "dist-app/macos/ai-knowledge-chat.dmg") -DestinationDirectory $MacDownloadsDir -DestinationName "ai-knowledge-chat.dmg"
Copy-InstallerIfExists -Source (Join-Path $Root "dist-app/macos/ai-knowledge-chat-latest.dmg") -DestinationDirectory $MacDownloadsDir -DestinationName "ai-knowledge-chat-latest.dmg"
Copy-InstallerIfExists -Source (Join-Path $Root "dist-app/admin-macos/ai-knowledge-admin.dmg") -DestinationDirectory $AdminMacDownloadsDir -DestinationName "ai-knowledge-admin.dmg"
Copy-InstallerIfExists -Source (Join-Path $Root "dist-app/admin-macos/ai-knowledge-admin-latest.dmg") -DestinationDirectory $AdminMacDownloadsDir -DestinationName "ai-knowledge-admin-latest.dmg"

Write-Host "Installer copy pass complete. Keep dist-app, IPA, DMG, EXE, certificates, and signing files out of Git unless explicitly approved."
