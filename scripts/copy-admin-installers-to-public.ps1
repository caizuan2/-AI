$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$DownloadsDir = Join-Path $Root "public/downloads/admin"
$AndroidSource = Join-Path $Root "dist-app/admin-android/ai-knowledge-admin.apk"
$AndroidLatestSource = Join-Path $Root "dist-app/admin-android/ai-knowledge-admin-latest.apk"
$WindowsSource = Join-Path $Root "dist-app/admin-windows/ai-knowledge-admin.exe"
$WindowsLatestSource = Join-Path $Root "dist-app/admin-windows/ai-knowledge-admin-latest.exe"
$maxGitHubFileSize = 100MB

New-Item -ItemType Directory -Force -Path $DownloadsDir | Out-Null

if (-not (Test-Path $AndroidSource)) {
  throw "Admin Android APK not found: $AndroidSource"
}

Remove-Item -LiteralPath (Join-Path $DownloadsDir "ai-knowledge-admin.apk") -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $DownloadsDir "ai-knowledge-admin-latest.apk") -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $DownloadsDir "ai-knowledge-admin.exe") -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $DownloadsDir "ai-knowledge-admin-latest.exe") -Force -ErrorAction SilentlyContinue

Copy-Item -LiteralPath $AndroidSource -Destination (Join-Path $DownloadsDir "ai-knowledge-admin.apk") -Force
if (Test-Path $AndroidLatestSource) {
  Copy-Item -LiteralPath $AndroidLatestSource -Destination (Join-Path $DownloadsDir "ai-knowledge-admin-latest.apk") -Force
} else {
  Copy-Item -LiteralPath $AndroidSource -Destination (Join-Path $DownloadsDir "ai-knowledge-admin-latest.apk") -Force
}

if (Test-Path $WindowsLatestSource) {
  $windowsFile = Get-Item -LiteralPath $WindowsLatestSource
  if ($windowsFile.Length -lt $maxGitHubFileSize) {
    Copy-Item -LiteralPath $WindowsSource -Destination (Join-Path $DownloadsDir "ai-knowledge-admin.exe") -Force
    Copy-Item -LiteralPath $WindowsLatestSource -Destination (Join-Path $DownloadsDir "ai-knowledge-admin-latest.exe") -Force
  } else {
    Write-Host "Admin Windows EXE is larger than 100MB. Keep it out of public/downloads/admin and upload it to GitHub Release."
  }
} else {
  Write-Host "Admin Windows EXE not found. Skipping Windows public download copy."
}

Get-ChildItem -LiteralPath $DownloadsDir -File |
  Where-Object { $_.Name -like "ai-knowledge-admin*" } |
  Sort-Object Name |
  Select-Object Name, Length, LastWriteTime, FullName |
  Format-Table -AutoSize
