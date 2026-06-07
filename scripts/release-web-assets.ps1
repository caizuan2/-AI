param(
  [string]$Channel = $env:OTA_CHANNEL,
  [switch]$SkipCapSync
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")

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

if (-not $Channel) {
  $Channel = "production"
}

Write-Host "Building web assets for channel: $Channel"
Invoke-ProjectCommand -FilePath "npm" -Arguments @("run", "build")

if (-not $SkipCapSync) {
  Invoke-ProjectCommand -FilePath "npx" -Arguments @("cap", "sync", "android")
} else {
  Write-Host "Skipped Capacitor sync."
}

$packageJson = Get-Content -LiteralPath (Join-Path $Root "package.json") -Raw | ConvertFrom-Json
$hasCapgo = [bool](
  $packageJson.dependencies.PSObject.Properties.Name -contains "@capgo/capacitor-updater" -or
  $packageJson.devDependencies.PSObject.Properties.Name -contains "@capgo/capacitor-updater"
)

if ($hasCapgo) {
  Write-Host "Capgo updater package detected."
  Write-Host "Configure CAPGO_TOKEN and CAPGO_APP_ID in CI Secrets, then publish with your Capgo CLI command."
  Write-Host "Example placeholder: npx @capgo/cli bundle upload --channel $Channel"
} else {
  Write-Host "No OTA updater plugin detected. This script prepared web assets only."
  Write-Host "See docs/ota-update-plan.md before enabling Capgo, Ionic Appflow, or a self-hosted OTA service."
}

Write-Host "Do not commit .next/, .next-build/, android/build/, or dist-app/."
