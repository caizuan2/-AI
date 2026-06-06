$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$ReleaseTag = "v1.0.0-admin-windows"
$Repo = "caizuan2/-AI"
$AssetPath = Join-Path $Root "dist-app/admin-windows/ai-knowledge-admin-latest.exe"
$FallbackAssetPath = Join-Path $Root "dist-app/admin-windows/ai-knowledge-admin.exe"
$ReleaseUrl = "https://github.com/caizuan2/-AI/releases/download/v1.0.0-admin-windows/ai-knowledge-admin-latest.exe"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "GitHub CLI gh was not found. Install gh or upload the EXE manually: $ReleaseUrl"
}

if (-not (Test-Path $AssetPath)) {
  if (Test-Path $FallbackAssetPath) {
    $AssetPath = $FallbackAssetPath
  } else {
    throw "Admin Windows EXE not found under dist-app/admin-windows."
  }
}

$releaseExists = $false
try {
  gh release view $ReleaseTag --repo $Repo | Out-Null
  $releaseExists = $true
} catch {
  $releaseExists = $false
}

if ($releaseExists) {
  gh release upload $ReleaseTag "$AssetPath#ai-knowledge-admin-latest.exe" --repo $Repo --clobber
} else {
  gh release create $ReleaseTag "$AssetPath#ai-knowledge-admin-latest.exe" --repo $Repo --title "AI知识库管理后台 Windows" --notes "管理员端 Windows EXE 安装包，打开后进入管理员登录页面。"
}

Write-Host "Admin Windows EXE release URL: $ReleaseUrl"
