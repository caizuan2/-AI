param(
  [switch]$InstallDependencies,
  [switch]$RunMigrations
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")

function Write-Step {
  param([Parameter(Mandatory = $true)][string]$Name)

  Write-Host ""
  Write-Host "===================================================="
  Write-Host $Name
  Write-Host "===================================================="
}

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

function Test-PackageScript {
  param([Parameter(Mandatory = $true)][string]$Name)

  $packageJson = Get-Content -LiteralPath (Join-Path $Root "package.json") -Raw | ConvertFrom-Json
  return [bool]($packageJson.scripts.PSObject.Properties.Name -contains $Name)
}

Write-Step "Web deploy preflight"
Push-Location $Root
try {
  git status

  foreach ($path in @("dist-app", ".next", "node_modules", "android/build")) {
    $tracked = @(git ls-files -- $path)
    $exists = Test-Path -LiteralPath (Join-Path $Root $path)
    Write-Host ("{0}: exists={1}, trackedFiles={2}" -f $path, $exists, $tracked.Count)
  }
} finally {
  Pop-Location
}

if ($InstallDependencies) {
  Write-Step "Install dependencies"

  if (Test-Path (Join-Path $Root "package-lock.json")) {
    Invoke-ProjectCommand -FilePath "npm" -Arguments @("ci")
  } elseif (Test-Path (Join-Path $Root "pnpm-lock.yaml")) {
    Invoke-ProjectCommand -FilePath "pnpm" -Arguments @("install", "--frozen-lockfile")
  } else {
    Invoke-ProjectCommand -FilePath "npm" -Arguments @("install")
  }
} else {
  Write-Host "Skipped dependency install. Pass -InstallDependencies to run npm ci / pnpm install / npm install."
}

Write-Step "Prisma"
Invoke-ProjectCommand -FilePath "npx" -Arguments @("prisma", "validate")
Invoke-ProjectCommand -FilePath "npm" -Arguments @("run", "prisma:generate")

if ($RunMigrations) {
  Write-Host "Running production-safe migration deploy. This does not reset or drop the database."
  Invoke-ProjectCommand -FilePath "npx" -Arguments @("prisma", "migrate", "deploy")
} else {
  Write-Host "Skipped production migration. Before production deploy, run: npx prisma migrate deploy"
}

Write-Step "Verify"
Invoke-ProjectCommand -FilePath "npm" -Arguments @("run", "lint")
Invoke-ProjectCommand -FilePath "npm" -Arguments @("run", "typecheck")
Invoke-ProjectCommand -FilePath "npm" -Arguments @("run", "build")
Invoke-ProjectCommand -FilePath "npx" -Arguments @("tsx", "tests/chat-ui.test.tsx")

if (Test-PackageScript -Name "test:security") {
  Invoke-ProjectCommand -FilePath "npm" -Arguments @("run", "test:security")
} else {
  Write-Host "test:security script does not exist; skipped."
}

Write-Step "Deployment reminder"
Write-Host "Deploy the built Next.js app through the configured platform or restart the Node service."
Write-Host "If using a server process, run the platform-specific restart, such as pm2 reload or systemd restart."
Write-Host "After deployment, check:"
Write-Host "- /chat-ui"
Write-Host "- /quick-actions"
Write-Host "- /download"
Write-Host "Do not commit dist-app/, .next/, node_modules/, android/build/, or real .env secrets."
