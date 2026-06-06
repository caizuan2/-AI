$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$OutputDir = Join-Path $Root "dist-app/windows"
$OutputExe = Join-Path $OutputDir "AI知识库助手.exe"

function Invoke-ProjectCommand {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )

  Push-Location $Root
  try {
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed: $FilePath $($Arguments -join ' ')"
    }
  } finally {
    Pop-Location
  }
}

if (-not (Test-Path (Join-Path $Root "node_modules/electron"))) {
  throw "Electron dependencies are missing. Please run pnpm install before building Windows EXE."
}

if (-not (Test-Path (Join-Path $Root "node_modules/electron-builder"))) {
  throw "electron-builder dependency is missing. Please run pnpm install before building Windows EXE."
}

if (-not $env:USER_APP_URL) {
  $env:USER_APP_URL = "https://stately-sawine-1efd4d.netlify.app/chat-ui"
}

Invoke-ProjectCommand -FilePath "npx" -Arguments @("electron-builder", "--win")

$GeneratedExe = Get-ChildItem -LiteralPath $OutputDir -Recurse -Filter "*.exe" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $GeneratedExe) {
  throw "No Windows EXE was generated under $OutputDir."
}

if ($GeneratedExe.FullName -ne $OutputExe) {
  Copy-Item -LiteralPath $GeneratedExe.FullName -Destination $OutputExe -Force
}

Write-Host "Windows EXE generated: $OutputExe"
