$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$DownloadsDir = Join-Path $Root "public/downloads"
$AndroidSource = Join-Path $Root "dist-app/android/AI知识库助手.apk"
$WindowsSource = Join-Path $Root "dist-app/windows/AI知识库助手.exe"

New-Item -ItemType Directory -Force -Path $DownloadsDir | Out-Null

if (Test-Path $AndroidSource) {
  Copy-Item -LiteralPath $AndroidSource -Destination (Join-Path $DownloadsDir "AI知识库助手.apk") -Force
  Copy-Item -LiteralPath $AndroidSource -Destination (Join-Path $DownloadsDir "ai-knowledge-chat.apk") -Force
  Write-Host "Copied Android APK to public/downloads."
} else {
  Write-Host "Android APK not found, skipped."
}

if (Test-Path $WindowsSource) {
  Copy-Item -LiteralPath $WindowsSource -Destination (Join-Path $DownloadsDir "AI知识库助手.exe") -Force
  Copy-Item -LiteralPath $WindowsSource -Destination (Join-Path $DownloadsDir "ai-knowledge-chat.exe") -Force
  Write-Host "Copied Windows EXE to public/downloads."
} else {
  Write-Host "Windows EXE not found, skipped."
}
