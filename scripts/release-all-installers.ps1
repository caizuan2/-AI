param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern("^\d+\.\d+\.\d+$")]
  [string]$Version,

  [Parameter(Mandatory = $true)]
  [int]$Build
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$ManifestPath = Join-Path $Root "public/releases/latest.json"
$Repo = "caizuan2/-AI"
$UserWindowsTag = "v1.0.1-user-windows"
$AdminWindowsTag = "v1.0.0-admin-windows"
$UserApkUrl = "https://stately-sawine-1efd4d.netlify.app/downloads/ai-knowledge-chat-latest.apk"
$AdminApkUrl = "https://stately-sawine-1efd4d.netlify.app/downloads/admin/ai-knowledge-admin-latest.apk"
$UserExeUrl = "https://github.com/$Repo/releases/download/$UserWindowsTag/ai-knowledge-chat-latest.exe"
$AdminExeUrl = "https://github.com/$Repo/releases/download/$AdminWindowsTag/ai-knowledge-admin-latest.exe"
$UserWebUrl = "https://stately-sawine-1efd4d.netlify.app/chat-ui"
$AdminWebUrl = "https://stately-sawine-1efd4d.netlify.app/login?app=admin&next=/ingest"
$UserDownloadPage = "https://stately-sawine-1efd4d.netlify.app/user-download.html"
$AdminDownloadPage = "https://stately-sawine-1efd4d.netlify.app/admin-download.html"

function New-TextFromCodePoints {
  param(
    [Parameter(Mandatory = $true)][int[]]$CodePoints
  )

  return -join ($CodePoints | ForEach-Object { [char]$_ })
}

$UserAppName = New-TextFromCodePoints @(0x41, 0x49, 0x77E5, 0x8BC6, 0x5E93, 0x52A9, 0x624B)
$AdminAppName = New-TextFromCodePoints @(0x41, 0x49, 0x77E5, 0x8BC6, 0x5E93, 0x7BA1, 0x7406, 0x540E, 0x53F0)

function Invoke-ProjectCommand {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )

  Push-Location $Root
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

function Assert-FileExists {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Message
  )

  if (-not (Test-Path $Path)) {
    throw $Message
  }
}

function Assert-GitHubCliReady {
  if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw "GitHub CLI gh was not found. Install gh and run gh auth login before publishing Windows EXE assets."
  }

  & gh auth status --hostname github.com | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "GitHub CLI is not logged in. Run gh auth login, then run this release script again."
  }
}

function Copy-ApkToPublic {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$DestinationDirectory,
    [Parameter(Mandatory = $true)][string]$BaseName
  )

  Assert-FileExists -Path $Source -Message "APK file not found: $Source"
  New-Item -ItemType Directory -Force -Path $DestinationDirectory | Out-Null
  Copy-Item -LiteralPath $Source -Destination (Join-Path $DestinationDirectory "$BaseName.apk") -Force
  Copy-Item -LiteralPath $Source -Destination (Join-Path $DestinationDirectory "$BaseName-latest.apk") -Force
}

function Publish-GitHubAsset {
  param(
    [Parameter(Mandatory = $true)][string]$Tag,
    [Parameter(Mandatory = $true)][string]$AssetPath,
    [Parameter(Mandatory = $true)][string]$AssetName,
    [Parameter(Mandatory = $true)][string]$Title,
    [Parameter(Mandatory = $true)][string]$Notes
  )

  Assert-FileExists -Path $AssetPath -Message "Windows EXE file not found: $AssetPath"

  $releaseExists = $false
  try {
    & gh release view $Tag --repo $Repo | Out-Null
    $releaseExists = $true
  } catch {
    $releaseExists = $false
  }

  $assetSpec = "$AssetPath#$AssetName"
  if ($releaseExists) {
    & gh release upload $Tag $assetSpec --repo $Repo --clobber
  } else {
    & gh release create $Tag $assetSpec --repo $Repo --title $Title --notes $Notes
  }

  if ($LASTEXITCODE -ne 0) {
    throw "Failed to publish $AssetName to GitHub Release $Tag."
  }
}

function New-ReleaseInfo {
  param(
    [Parameter(Mandatory = $true)][string]$AppName,
    [Parameter(Mandatory = $true)][string]$WebUrl,
    [Parameter(Mandatory = $true)][string]$ApkUrl,
    [Parameter(Mandatory = $true)][string]$ExeUrl,
    [Parameter(Mandatory = $true)][string]$DownloadPage,
    [Parameter(Mandatory = $true)][int]$MinimumBuild,
    [Parameter(Mandatory = $true)][bool]$ForceUpdate,
    [Parameter(Mandatory = $true)][object[]]$Changelog
  )

  return [pscustomobject]([ordered]@{
    app_name = $AppName
    version = $Version
    build = $Build
    minimum_build = $MinimumBuild
    force_update = $ForceUpdate
    web_url = $WebUrl
    apk_url = $ApkUrl
    exe_url = $ExeUrl
    download_page = $DownloadPage
    changelog = $Changelog
  })
}

function Update-LatestManifest {
  $manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
  $userChangelog = @($manifest.user.changelog)
  $adminChangelog = @($manifest.admin.changelog)
  $userMinimumBuild = if ($manifest.user.minimum_build) { [int]$manifest.user.minimum_build } else { $Build }
  $adminMinimumBuild = if ($manifest.admin.minimum_build) { [int]$manifest.admin.minimum_build } else { $Build }

  $nextManifest = [pscustomobject]([ordered]@{
    updated_at = [DateTime]::UtcNow.ToString("o")
    user = New-ReleaseInfo `
      -AppName $UserAppName `
      -WebUrl $UserWebUrl `
      -ApkUrl $UserApkUrl `
      -ExeUrl $UserExeUrl `
      -DownloadPage $UserDownloadPage `
      -MinimumBuild $userMinimumBuild `
      -ForceUpdate ([bool]$manifest.user.force_update) `
      -Changelog $userChangelog
    admin = New-ReleaseInfo `
      -AppName $AdminAppName `
      -WebUrl $AdminWebUrl `
      -ApkUrl $AdminApkUrl `
      -ExeUrl $AdminExeUrl `
      -DownloadPage $AdminDownloadPage `
      -MinimumBuild $adminMinimumBuild `
      -ForceUpdate ([bool]$manifest.admin.force_update) `
      -Changelog $adminChangelog
  })

  $json = $nextManifest | ConvertTo-Json -Depth 8
  Set-Content -LiteralPath $ManifestPath -Value $json -Encoding utf8
}

Assert-GitHubCliReady

Invoke-ProjectCommand -FilePath "npm" -Arguments @("run", "lint")
Invoke-ProjectCommand -FilePath "npm" -Arguments @("run", "typecheck")
Invoke-ProjectCommand -FilePath "npm" -Arguments @("run", "build")
Invoke-ProjectCommand -FilePath "npm" -Arguments @("run", "app:android")
Invoke-ProjectCommand -FilePath "npm" -Arguments @("run", "admin:android")
Invoke-ProjectCommand -FilePath "npm" -Arguments @("run", "app:windows")
Invoke-ProjectCommand -FilePath "npm" -Arguments @("run", "admin:windows")

$UserApk = Join-Path $Root "dist-app/android/ai-knowledge-chat.apk"
$AdminApk = Join-Path $Root "dist-app/admin-android/ai-knowledge-admin.apk"
$UserExe = Join-Path $Root "dist-app/windows/ai-knowledge-chat.exe"
$AdminExe = Join-Path $Root "dist-app/admin-windows/ai-knowledge-admin-latest.exe"

Copy-ApkToPublic -Source $UserApk -DestinationDirectory (Join-Path $Root "public/downloads") -BaseName "ai-knowledge-chat"
Copy-ApkToPublic -Source $AdminApk -DestinationDirectory (Join-Path $Root "public/downloads/admin") -BaseName "ai-knowledge-admin"

Publish-GitHubAsset `
  -Tag $UserWindowsTag `
  -AssetPath $UserExe `
  -AssetName "ai-knowledge-chat-latest.exe" `
  -Title "AI Knowledge Assistant Windows" `
  -Notes "User Windows EXE installer. It opens the user chat page."

Publish-GitHubAsset `
  -Tag $AdminWindowsTag `
  -AssetPath $AdminExe `
  -AssetName "ai-knowledge-admin-latest.exe" `
  -Title "AI Knowledge Admin Windows" `
  -Notes "Admin Windows EXE installer. It opens the admin login page."

Update-LatestManifest

Write-Host ""
Write-Host "Release manifest updated: public/releases/latest.json"
Write-Host "User APK: $UserApkUrl"
Write-Host "User EXE: $UserExeUrl"
Write-Host "Admin APK: $AdminApkUrl"
Write-Host "Admin EXE: $AdminExeUrl"
Write-Host "User download page: $UserDownloadPage"
Write-Host "Admin download page: $AdminDownloadPage"
Write-Host ""
Write-Host "Next staging command:"
Write-Host 'git add public/releases/latest.json public/downloads/ai-knowledge-chat.apk public/downloads/ai-knowledge-chat-latest.apk public/downloads/admin/ai-knowledge-admin.apk public/downloads/admin/ai-knowledge-admin-latest.apk scripts/release-all-installers.ps1'
Write-Host ""
Write-Host "Keep dist-app, EXE files, node_modules, .next, .env, certificates, keys, and signing files out of the repository."
