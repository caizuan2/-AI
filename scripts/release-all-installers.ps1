param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern("^\d+\.\d+\.\d+$")]
  [string]$Version,

  [Parameter(Mandatory = $true)]
  [int]$Build,

  [switch]$ManifestOnly
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$ManifestPath = Join-Path $Root "public/releases/latest.json"
$Repo = "caizuan2/-AI"
$ReleaseTag = "v$Version"
$ReleaseDownloadBase = "https://github.com/$Repo/releases/latest/download"
$UserApkUrl = "$ReleaseDownloadBase/ai-knowledge-chat-latest.apk"
$AdminApkUrl = "$ReleaseDownloadBase/ai-knowledge-admin-latest.apk"
$UserExeUrl = "$ReleaseDownloadBase/ai-knowledge-chat-latest.exe"
$AdminExeUrl = "$ReleaseDownloadBase/ai-knowledge-admin-latest.exe"
$UserWebUrl = "https://stately-sawine-1efd4d.netlify.app/chat-ui"
$AdminWebUrl = "https://stately-sawine-1efd4d.netlify.app/login?app=admin&next=/ingest"
$UserDownloadPage = "https://stately-sawine-1efd4d.netlify.app/user-download.html"
$AdminDownloadPage = "https://stately-sawine-1efd4d.netlify.app/admin-download.html"
$DefaultMinimumBuild = 100
$UserAppId = "ai.chat.user"
$AdminAppId = "ai.chat.admin"
$UserAppName = "AI知识库助手"
$AdminAppName = "AI知识库管理后台"
$DistributionPlatforms = @("android", "windows", "ios", "macos", "web", "electron")
$UserChangelog = @(
  "Updated user app",
  "Improved chat experience",
  "Fixed attachment upload"
)
$AdminChangelog = @(
  "Updated admin app",
  "Improved packaging workflow",
  "Updated installer links"
)

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

  Assert-FileExists -Path $AssetPath -Message "Release asset file not found: $AssetPath"

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

function New-AppStoreVersion {
  param(
    [Parameter(Mandatory = $true)][string]$WebUrl,
    [Parameter(Mandatory = $true)][string]$ApkUrl,
    [Parameter(Mandatory = $true)][string]$ExeUrl,
    [Parameter(Mandatory = $true)][string]$DownloadPage,
    [Parameter(Mandatory = $true)][int]$MinimumBuild,
    [Parameter(Mandatory = $true)][bool]$ForceUpdate,
    [Parameter(Mandatory = $true)][string]$Channel,
    [Parameter(Mandatory = $true)][int]$Rollout,
    [Parameter(Mandatory = $true)][string[]]$Changelog
  )

  return [pscustomobject]([ordered]@{
    version = $Version
    build = $Build
    channel = $Channel
    rollout = $Rollout
    minimum_build = $MinimumBuild
    force_update = $ForceUpdate
    web_url = $WebUrl
    apk_url = $ApkUrl
    exe_url = $ExeUrl
    download_page = $DownloadPage
    changelog = $Changelog
    created_at = [DateTime]::UtcNow.ToString("o")
  })
}

function New-AppCatalog {
  param(
    [Parameter(Mandatory = $true)][string]$AppId,
    [Parameter(Mandatory = $true)][string]$AppName,
    [Parameter(Mandatory = $true)][object[]]$Versions
  )

  return [pscustomobject]([ordered]@{
    id = $AppId
    name = $AppName
    platforms = $DistributionPlatforms
    active_version = $Version
    versions = $Versions
  })
}

function Get-PreviousAppVersions {
  param(
    [Parameter(Mandatory = $true)][string]$AppKey
  )

  if (-not (Test-Path $ManifestPath)) {
    return @()
  }

  try {
    $existingManifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
    $existingApp = $existingManifest.apps.$AppKey

    if (-not $existingApp -or -not $existingApp.versions) {
      return @()
    }

    return @($existingApp.versions | Where-Object {
      $_.version -ne $Version -and $_.build -ne $Build
    })
  } catch {
    return @()
  }
}

function ConvertTo-AsciiJson {
  param(
    [Parameter(Mandatory = $true)][string]$Json
  )

  $builder = New-Object System.Text.StringBuilder

  foreach ($character in $Json.ToCharArray()) {
    $code = [int][char]$character

    if ($code -gt 127) {
      [void]$builder.Append(("\u{0:x4}" -f $code))
    } else {
      [void]$builder.Append($character)
    }
  }

  return $builder.ToString()
}

function Update-LatestManifest {
  $userVersion = New-AppStoreVersion `
    -WebUrl $UserWebUrl `
    -ApkUrl $UserApkUrl `
    -ExeUrl $UserExeUrl `
    -DownloadPage $UserDownloadPage `
    -MinimumBuild $DefaultMinimumBuild `
    -ForceUpdate $false `
    -Channel "stable" `
    -Rollout 100 `
    -Changelog $UserChangelog

  $adminVersion = New-AppStoreVersion `
    -WebUrl $AdminWebUrl `
    -ApkUrl $AdminApkUrl `
    -ExeUrl $AdminExeUrl `
    -DownloadPage $AdminDownloadPage `
    -MinimumBuild $DefaultMinimumBuild `
    -ForceUpdate $false `
    -Channel "stable" `
      -Rollout 100 `
      -Changelog $AdminChangelog

  $userVersions = @($userVersion) + (Get-PreviousAppVersions -AppKey "user")
  $adminVersions = @($adminVersion) + (Get-PreviousAppVersions -AppKey "admin")

  $nextManifest = [pscustomobject]([ordered]@{
    updated_at = [DateTime]::UtcNow.ToString("o")
    apps = [ordered]@{
      user = New-AppCatalog `
        -AppId $UserAppId `
        -AppName $UserAppName `
        -Versions $userVersions
      admin = New-AppCatalog `
        -AppId $AdminAppId `
        -AppName $AdminAppName `
        -Versions $adminVersions
    }
  })

  $json = ConvertTo-AsciiJson (($nextManifest | ConvertTo-Json -Depth 10).Replace("\u0026", "&"))
  try {
    $null = $json | ConvertFrom-Json
  } catch {
    throw "Generated release manifest JSON is invalid: $($_.Exception.Message)"
  }

  Set-Content -LiteralPath $ManifestPath -Value $json -Encoding utf8

  try {
    $null = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
  } catch {
    throw "Saved release manifest JSON is invalid: $($_.Exception.Message)"
  }
}

if ($ManifestOnly) {
  Update-LatestManifest
  Write-Host "Release manifest updated and validated: public/releases/latest.json"
  return
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

Publish-GitHubAsset `
  -Tag $ReleaseTag `
  -AssetPath $UserApk `
  -AssetName "ai-knowledge-chat-latest.apk" `
  -Title "AI Knowledge $Version" `
  -Notes "Automated release assets for AI Knowledge $Version."

Publish-GitHubAsset `
  -Tag $ReleaseTag `
  -AssetPath $AdminApk `
  -AssetName "ai-knowledge-admin-latest.apk" `
  -Title "AI Knowledge $Version" `
  -Notes "Automated release assets for AI Knowledge $Version."

Publish-GitHubAsset `
  -Tag $ReleaseTag `
  -AssetPath $UserExe `
  -AssetName "ai-knowledge-chat-latest.exe" `
  -Title "AI Knowledge $Version" `
  -Notes "Automated release assets for AI Knowledge $Version."

Publish-GitHubAsset `
  -Tag $ReleaseTag `
  -AssetPath $AdminExe `
  -AssetName "ai-knowledge-admin-latest.exe" `
  -Title "AI Knowledge $Version" `
  -Notes "Automated release assets for AI Knowledge $Version."

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
Write-Host 'git add public/releases/latest.json scripts/release-all-installers.ps1'
Write-Host ""
Write-Host "Keep dist, dist-app, APK, EXE, ASAR files, node_modules, .next, .env, certificates, keys, and signing files out of the repository."
