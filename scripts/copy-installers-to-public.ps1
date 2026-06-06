$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$DownloadsDir = Join-Path $Root "public/downloads"
$AndroidSource = Join-Path $Root "dist-app/android/ai-knowledge-chat.apk"
$WindowsSource = Join-Path $Root "dist-app/windows/ai-knowledge-chat.exe"

New-Item -ItemType Directory -Force -Path $DownloadsDir | Out-Null

if (-not (Test-Path $AndroidSource)) {
  throw "Android APK not found: $AndroidSource"
}

if (-not (Test-Path $WindowsSource)) {
  throw "Windows EXE not found: $WindowsSource"
}

$targetFiles = @(
  "ai-knowledge-chat.apk",
  "ai-knowledge-chat-latest.apk",
  "ai-knowledge-chat.exe",
  "ai-knowledge-chat-latest.exe"
)

foreach ($targetFile in $targetFiles) {
  Remove-Item -LiteralPath (Join-Path $DownloadsDir $targetFile) -Force -ErrorAction SilentlyContinue
}

Copy-Item -LiteralPath $AndroidSource -Destination (Join-Path $DownloadsDir "ai-knowledge-chat.apk") -Force
Copy-Item -LiteralPath $AndroidSource -Destination (Join-Path $DownloadsDir "ai-knowledge-chat-latest.apk") -Force
Copy-Item -LiteralPath $WindowsSource -Destination (Join-Path $DownloadsDir "ai-knowledge-chat.exe") -Force
Copy-Item -LiteralPath $WindowsSource -Destination (Join-Path $DownloadsDir "ai-knowledge-chat-latest.exe") -Force

Get-ChildItem -LiteralPath $DownloadsDir -File |
  Where-Object { $_.Name -in $targetFiles } |
  Sort-Object Name |
  Select-Object Name, Length, LastWriteTime, FullName |
  Format-Table -AutoSize
