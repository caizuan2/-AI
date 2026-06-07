param(
  [string]$Channel = $env:OTA_CHANNEL,
  [string]$AppId = $env:CAPGO_APP_ID,
  [switch]$SkipCapSync,
  [switch]$ExecuteUpload
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Token = $env:CAPGO_TOKEN

function Invoke-ProjectCommand {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [string]$DisplayCommand
  )

  Push-Location $Root
  try {
    if ($DisplayCommand) {
      Write-Host ""
      Write-Host "> $DisplayCommand"
    } else {
      Write-Host ""
      Write-Host "> $FilePath $($Arguments -join ' ')"
    }

    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed with exit code $LASTEXITCODE`: $FilePath"
    }
  } finally {
    Pop-Location
  }
}

if (-not $Channel) {
  $Channel = "production"
}

Write-Host "Capgo OTA release channel: $Channel"
Write-Host "Current Capacitor webDir is app-shell. This project also uses a hosted server.url."
Write-Host "Confirm the bundle path is correct for your Capgo release before executing upload."
Write-Host "Building Web assets before OTA upload."
Invoke-ProjectCommand -FilePath "pnpm" -Arguments @("run", "build")

if (-not $SkipCapSync) {
  Invoke-ProjectCommand -FilePath "npx" -Arguments @("cap", "sync", "android")
} else {
  Write-Host "Skipped Capacitor sync."
}

if (-not $Token -or -not $AppId) {
  Write-Host ""
  Write-Host "Capgo OTA upload skipped because CAPGO_TOKEN or CAPGO_APP_ID is missing."
  Write-Host "Set CAPGO_TOKEN and CAPGO_APP_ID in .env.local or CI Secrets."
  Write-Host "Optional: set OTA_CHANNEL, default is production."
  Write-Host "No token was printed and no upload was attempted."
  Write-Host "Do not commit .env, .next/, .next-build/, android/build/, dist-app/, or node_modules/."
  exit 0
}

$publishArgs = @(
  "@capgo/cli@latest",
  "bundle",
  "upload",
  $AppId,
  "--path",
  "app-shell",
  "--channel",
  $Channel,
  "--apikey",
  $Token
)

$maskedCommand = "npx @capgo/cli@latest bundle upload `"$AppId`" --path app-shell --channel `"$Channel`" --apikey <CAPGO_TOKEN>"
Write-Host ""
Write-Host "Ready to upload OTA bundle to Capgo."
Write-Host "> $maskedCommand"

if (-not $ExecuteUpload) {
  Write-Host "Upload was not executed. Re-run with -ExecuteUpload after confirming app-shell is the intended OTA bundle."
  exit 0
}

Invoke-ProjectCommand -FilePath "npx" -Arguments $publishArgs -DisplayCommand $maskedCommand

Write-Host ""
Write-Host "Capgo OTA upload command finished."
Write-Host "Do not commit .env, .next/, .next-build/, android/build/, dist-app/, or node_modules/."
