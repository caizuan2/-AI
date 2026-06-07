param(
  [string]$ProjectRoot = "D:\XT"
)

$ErrorActionPreference = "Stop"

function StepTitle {
  param([Parameter(Mandatory = $true)][string]$Title)

  Write-Host ""
  Write-Host "===================================================="
  Write-Host $Title
  Write-Host "===================================================="
}

function AskYesNo {
  param([Parameter(Mandatory = $true)][string]$Question)

  $answer = Read-Host "$Question Type Y to continue, anything else to skip"
  return $answer -eq "Y" -or $answer -eq "y"
}

function RunCmd {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string[]]$Arguments = @(),
    [string]$WorkingDirectory = $ProjectRoot
  )

  Push-Location $WorkingDirectory
  try {
    Write-Host ""
    Write-Host "> $FilePath $($Arguments -join ' ')"
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed with exit code $LASTEXITCODE`: $FilePath $($Arguments -join ' ')"
    }
  } finally {
    Pop-Location
  }
}

function BuildSafeGitAddCommand {
  param([Parameter(Mandatory = $true)][string[]]$Files)

  $lines = @()
  for ($index = 0; $index -lt $Files.Count; $index += 1) {
    $suffix = if ($index -lt $Files.Count - 1) { " ``" } else { "" }
    if ($index -eq 0) {
      $lines += "git add `"$($Files[$index])`"$suffix"
    } else {
      $lines += "        `"$($Files[$index])`"$suffix"
    }
  }

  return $lines -join [Environment]::NewLine
}

$safeFiles = @(
  "prisma/schema.prisma",
  "prisma/migrations/20260607140000_add_quick_action_categories/migration.sql",
  "lib/quick-actions.ts",
  "app/api/admin/quick-actions/route.ts",
  "app/api/user/quick-actions/route.ts",
  "app/(workspace)/quick-actions/page.tsx",
  "components/app-shell.tsx",
  "app/(user)/chat-ui/api.ts",
  "app/(user)/chat-ui/types.ts",
  "app/(user)/chat-ui/components/ChatQuickActions.tsx",
  "app/(user)/chat-ui/components/ChatShell.tsx",
  "app/(user)/chat-ui/components/ChatInput.tsx",
  "tests/chat-ui.test.tsx",
  "app/download/page.tsx",
  "public/releases/latest.json",
  "scripts/deploy-web.ps1",
  "scripts/release-web-assets.ps1",
  "scripts/build-android-apk.ps1",
  "scripts/safe-full-release.ps1",
  "docs/ota-update-plan.md",
  "docs/release-and-update-guide.md"
)

$commitMessage = "feat: add quick action category management and release update"

StepTitle "Step 0: Enter project directory"
if (-not (Test-Path -LiteralPath $ProjectRoot)) {
  throw "Project directory does not exist: $ProjectRoot"
}
Set-Location $ProjectRoot
Get-Location

StepTitle "Step 1: Git status"
RunCmd -FilePath "git" -Arguments @("status")

StepTitle "Step 2: Blocked artifact check"
$blockedDirs = @("dist-app", ".next", "node_modules", "android/build", "ios/build")
foreach ($dir in $blockedDirs) {
  $exists = Test-Path -LiteralPath (Join-Path $ProjectRoot $dir)
  $trackedFiles = @(git ls-files -- $dir)
  Write-Host ("{0}: exists={1}, trackedFiles={2}" -f $dir, $exists, $trackedFiles.Count)
}
Write-Host "Never commit real .env secrets or generated build artifacts."

if (Test-Path -LiteralPath (Join-Path $ProjectRoot "dist-app")) {
  Write-Host "dist-app/ is a generated artifact and must not be committed."
  if (AskYesNo "Delete dist-app/ now?") {
    RunCmd -FilePath "git" -Arguments @("clean", "-fd", "--", "dist-app/")
    if (Test-Path -LiteralPath (Join-Path $ProjectRoot "dist-app")) {
      Write-Host "git clean did not remove dist-app/. Trying Remove-Item."
      try {
        Remove-Item -LiteralPath (Join-Path $ProjectRoot "dist-app") -Recurse -Force
      } catch {
        Write-Host "WARNING: Failed to remove dist-app/: $($_.Exception.Message)"
      }
    }

    if (Test-Path -LiteralPath (Join-Path $ProjectRoot "dist-app")) {
      Write-Host "WARNING: dist-app/ still exists. Do not commit it."
    } else {
      Write-Host "dist-app/ removed."
    }
  } else {
    Write-Host "Skipped deleting dist-app/. Do not commit it."
  }
}

StepTitle "Step 3: Prisma validate and generate"
RunCmd -FilePath "npx" -Arguments @("prisma", "validate")
try {
  RunCmd -FilePath "npm" -Arguments @("run", "prisma:generate")
} catch {
  Write-Host ""
  Write-Host "Prisma generate failed."
  Write-Host "If the error mentions a Windows locked Prisma DLL, close all npm run dev terminals and retry."
  Write-Host "Do not delete node_modules blindly. Do not reset Prisma. Do not reset or drop the database."
  throw
}

StepTitle "Step 4: Prisma migration status"
$migrateStatusOutput = & npx prisma migrate status 2>&1
$migrateExitCode = $LASTEXITCODE
$migrateText = $migrateStatusOutput -join [Environment]::NewLine
$migrateStatusOutput | ForEach-Object { Write-Host $_ }
if ($migrateExitCode -ne 0 -and $migrateText -notmatch "not yet been applied|Database schema is not up to date|Following migration") {
  throw "Prisma migrate status failed with exit code $migrateExitCode."
}

if ($migrateText -match "not yet been applied|Database schema is not up to date|Following migration") {
  Write-Host ""
  Write-Host "Pending migrations detected."
  Write-Host "Local development can run: npx prisma migrate dev"
  Write-Host "Production should run: npx prisma migrate deploy"
  Write-Host "Never run prisma migrate reset in this release script."
  if (AskYesNo "Run local npx prisma migrate dev now?") {
    RunCmd -FilePath "npx" -Arguments @("prisma", "migrate", "dev")
    RunCmd -FilePath "npx" -Arguments @("prisma", "migrate", "status")
  } else {
    Write-Host "Skipped local migration."
  }
} else {
  Write-Host "No pending Prisma migrations detected."
}

StepTitle "Step 5: Project verification"
RunCmd -FilePath "npm" -Arguments @("run", "lint")
RunCmd -FilePath "npm" -Arguments @("run", "typecheck")
RunCmd -FilePath "npm" -Arguments @("run", "build")
RunCmd -FilePath "npx" -Arguments @("tsx", "tests/chat-ui.test.tsx")
RunCmd -FilePath "npm" -Arguments @("run", "test:security")

StepTitle "Step 6: Optional Capacitor Android sync"
$hasCapacitorConfig =
  (Test-Path -LiteralPath (Join-Path $ProjectRoot "capacitor.config.ts")) -or
  (Test-Path -LiteralPath (Join-Path $ProjectRoot "capacitor.config.json"))
$hasAndroidProject = Test-Path -LiteralPath (Join-Path $ProjectRoot "android")
if ($hasCapacitorConfig -and $hasAndroidProject) {
  Write-Host "Capacitor Android project detected."
  Write-Host "npx cap sync android synchronizes Web resources and native config; it does not generate an APK."
  if (AskYesNo "Run npx cap sync android now?") {
    RunCmd -FilePath "npx" -Arguments @("cap", "sync", "android")
  } else {
    Write-Host "Skipped Capacitor sync."
  }
} else {
  Write-Host "Capacitor Android project not detected; skipped."
}

StepTitle "Step 7: Optional Debug APK build"
$gradleWrapper = Join-Path $ProjectRoot "android/gradlew.bat"
if (Test-Path -LiteralPath $gradleWrapper) {
  Write-Host "Debug APK build requires local Android SDK, JDK, and Gradle environment."
  if (AskYesNo "Run Debug APK build now?") {
    try {
      RunCmd -FilePath $gradleWrapper -Arguments @("assembleDebug") -WorkingDirectory (Join-Path $ProjectRoot "android")
      $debugApk = Join-Path $ProjectRoot "android/app/build/outputs/apk/debug/app-debug.apk"
      if (Test-Path -LiteralPath $debugApk) {
        Write-Host "Debug APK generated: $debugApk"
      } else {
        Write-Host "Debug build finished, but APK was not found at: $debugApk"
      }
    } catch {
      Write-Host "Debug APK build failed. Check Android SDK / JDK / Gradle environment."
      Write-Host $_.Exception.Message
    }
  } else {
    Write-Host "Skipped Debug APK build."
  }
} else {
  Write-Host "android/gradlew.bat not found; skipped Debug APK build."
}

StepTitle "Step 8: Manual page check reminder"
Write-Host "Open and verify these pages after npm run dev:"
Write-Host "- /chat-ui: Tailwind/CSS normal, quick actions normal, fallback normal."
Write-Host "- /quick-actions: admin quick action management normal. 403 is expected for non-admin accounts."
Write-Host "- /download: version information normal."
Write-Host "Confirm there is no raw HTML styling issue before release."

StepTitle "Step 9: Safe git commands"
$gitAddCommand = BuildSafeGitAddCommand -Files $safeFiles
Write-Host $gitAddCommand
Write-Host ""
Write-Host "git commit -m `"$commitMessage`""
Write-Host "git push"
Write-Host ""
Write-Host "Do not commit dist-app/, .next/, node_modules/, android/build/, ios/build/, or real .env secrets."

if (AskYesNo "All checks passed AND manual page check is OK. Run git add / commit / push now?") {
  foreach ($file in $safeFiles) {
    if (Test-Path -LiteralPath (Join-Path $ProjectRoot $file)) {
      RunCmd -FilePath "git" -Arguments @("add", $file)
    } else {
      Write-Host "Skipping missing file: $file"
    }
  }
  RunCmd -FilePath "git" -Arguments @("commit", "-m", $commitMessage)
  RunCmd -FilePath "git" -Arguments @("push")
} else {
  Write-Host "Skipped git add / commit / push."
}

StepTitle "Done"
