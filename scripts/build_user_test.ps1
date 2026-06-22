param(
  [string]$BaseUrl = "https://stately-sawine-1efd4d.netlify.app",
  [string]$ApiBaseUrl = "http://47.238.0.23",
  [string]$ReleaseAssetBaseUrl = "https://github.com/caizuan2/-AI/releases/download/user-test",
  [string]$GitHubOwnerRepo = "caizuan2/-AI",
  [string]$DefaultBranch = "",
  [string]$ManifestBranch = "user-test-manifest",
  [string]$RawManifestUrl = "",
  [string[]]$Changelog = @(
    "整合同账号文字消息同步",
    "整合同账号图片/文件/拍照同步",
    "使用阿里云 API http://47.238.0.23"
  ),
  [int]$WindowsBuildTimeoutSeconds = 900,
  [switch]$SkipWindowsRelease,
  [switch]$SkipGitHubUpload,
  [switch]$SkipManifestBranchUpdate,
  [switch]$LocalUserSelfTest
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$FlutterDir = Join-Path $Root "flutter_app"
$TestOutputDir = Join-Path $Root "public/downloads/test/user"
$ApkOutput = Join-Path $TestOutputDir "ai-knowledge-user-test.apk"
$WindowsDebugZip = Join-Path $TestOutputDir "ai-knowledge-user-windows-debug.zip"
$WindowsReleaseZip = Join-Path $TestOutputDir "ai-knowledge-user-windows-release.zip"
$VersionJsonPath = Join-Path $TestOutputDir "version.json"
$RawManifestDir = Join-Path $Root "public/manifests/user-test"
$RawManifestPath = Join-Path $RawManifestDir "version.json"
$BuildStartedAt = Get-Date

if ($LocalUserSelfTest) {
  $ErrorActionPreference = "Stop"

  $Root = Resolve-Path (Join-Path $PSScriptRoot "..")
  Set-Location $Root

  function Stop-LocalUserSelfTestProcesses {
    Get-Process dart, flutter, ai_knowledge_flutter_app, cl, msbuild -ErrorAction SilentlyContinue |
      Stop-Process -Force -ErrorAction SilentlyContinue
  }

  function Invoke-LocalUserCommand {
    param(
      [Parameter(Mandatory = $true)][string]$FilePath,
      [Parameter(Mandatory = $true)][string[]]$Arguments,
      [Parameter(Mandatory = $true)][string]$WorkingDirectory,
      [Parameter(Mandatory = $true)][int]$TimeoutSeconds,
      [switch]$StopBuildProcessesOnTimeout
    )

    $resolvedCommand = (Get-Command $FilePath -ErrorAction Stop).Source
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $resolvedCommand
    $startInfo.WorkingDirectory = $WorkingDirectory
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.Arguments = (($Arguments | ForEach-Object {
          if ($_ -match '[\s"&]') {
            '"' + ($_ -replace '\\', '\\' -replace '"', '\"') + '"'
          } else {
            $_
          }
        }) -join " ")

    Write-Host ""
    Write-Host "Running: $FilePath $($Arguments -join ' ')"
    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    $process.Start() | Out-Null
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()

    if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
      if ($StopBuildProcessesOnTimeout) {
        Stop-LocalUserSelfTestProcesses
      }
      if (-not $process.HasExited) {
        try {
          $process.Kill($true)
          $process.WaitForExit(10000) | Out-Null
        } catch {
          Write-Warning "Could not stop timed out process $($process.Id): $($_.Exception.Message)"
        }
      }
      $outText = $stdoutTask.GetAwaiter().GetResult()
      $errText = $stderrTask.GetAwaiter().GetResult()
      throw "Command timed out after $TimeoutSeconds seconds: $FilePath $($Arguments -join ' ')`n$outText`n$errText"
    }

    $outText = $stdoutTask.GetAwaiter().GetResult()
    $errText = $stderrTask.GetAwaiter().GetResult()
    if ($outText.Trim()) {
      Write-Host $outText
    }
    if ($errText.Trim()) {
      Write-Warning $errText
    }
    if ($process.ExitCode -ne 0) {
      throw "Command failed with exit code $($process.ExitCode): $FilePath $($Arguments -join ' ')`n$outText`n$errText"
    }
  }

  function Get-LocalCMakePath {
    $command = Get-Command cmake -ErrorAction SilentlyContinue
    if ($command) {
      return $command.Source
    }

    $candidates = @(
      "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe",
      "C:\Program Files\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe",
      "C:\Program Files\CMake\bin\cmake.exe"
    )
    foreach ($candidate in $candidates) {
      if (Test-Path -LiteralPath $candidate) {
        return $candidate
      }
    }
    throw "cmake.exe was not found for Windows build fallback."
  }

  function Invoke-LocalWindowsFallbackBuild {
    $buildDir = Join-Path $Root "flutter_app\build\windows\x64"
    if (-not (Test-Path -LiteralPath $buildDir)) {
      throw "Windows build directory not found for fallback: $buildDir"
    }

    $cmake = Get-LocalCMakePath
    Invoke-LocalUserCommand `
      -FilePath $cmake `
      -Arguments @(
        "--build",
        "build\windows\x64",
        "--config",
        "Release",
        "--target",
        "INSTALL",
        "--",
        "/p:TrackFileAccess=false",
        "/m"
      ) `
      -WorkingDirectory (Join-Path $Root "flutter_app") `
      -TimeoutSeconds $WindowsBuildTimeoutSeconds `
      -StopBuildProcessesOnTimeout
  }

  $branch = (git branch --show-current).Trim()
  if ($branch -ne "feature-user-client") {
    throw "当前分支不是 feature-user-client，禁止继续。当前分支：$branch"
  }

  Stop-LocalUserSelfTestProcesses

  if ([string]::IsNullOrWhiteSpace($env:PUB_HOSTED_URL)) {
    $env:PUB_HOSTED_URL = "https://pub.flutter-io.cn"
  }
  if ([string]::IsNullOrWhiteSpace($env:FLUTTER_STORAGE_BASE_URL)) {
    $env:FLUTTER_STORAGE_BASE_URL = "https://storage.flutter-io.cn"
  }

  Set-Location (Join-Path $Root "flutter_app")

  Invoke-LocalUserCommand `
    -FilePath "flutter" `
    -Arguments @("pub", "get") `
    -WorkingDirectory (Join-Path $Root "flutter_app") `
    -TimeoutSeconds 240 `
    -StopBuildProcessesOnTimeout

  try {
    Invoke-LocalUserCommand `
      -FilePath "flutter" `
      -Arguments @("analyze", "--no-pub") `
      -WorkingDirectory (Join-Path $Root "flutter_app") `
      -TimeoutSeconds 120 `
      -StopBuildProcessesOnTimeout
  } catch {
    Write-Warning "flutter analyze --no-pub failed or timed out. Retrying once. $($_.Exception.Message)"
    Stop-LocalUserSelfTestProcesses
    Invoke-LocalUserCommand `
      -FilePath "flutter" `
      -Arguments @("analyze", "--no-pub") `
      -WorkingDirectory (Join-Path $Root "flutter_app") `
      -TimeoutSeconds 120 `
      -StopBuildProcessesOnTimeout
  }

  Invoke-LocalUserCommand `
    -FilePath "flutter" `
    -Arguments @("test", "--no-pub") `
    -WorkingDirectory (Join-Path $Root "flutter_app") `
    -TimeoutSeconds 300 `
    -StopBuildProcessesOnTimeout

  Invoke-LocalUserCommand `
    -FilePath "flutter" `
    -Arguments @("build", "apk", "--release", "--no-pub") `
    -WorkingDirectory (Join-Path $Root "flutter_app") `
    -TimeoutSeconds 900 `
    -StopBuildProcessesOnTimeout

  try {
    Invoke-LocalUserCommand `
      -FilePath "flutter" `
      -Arguments @("build", "windows", "--release", "--no-pub") `
      -WorkingDirectory (Join-Path $Root "flutter_app") `
      -TimeoutSeconds $WindowsBuildTimeoutSeconds `
      -StopBuildProcessesOnTimeout
  } catch {
    Write-Warning "flutter build windows --release --no-pub failed or timed out. Trying MSBuild FileTracker fallback. $($_.Exception.Message)"
    Stop-LocalUserSelfTestProcesses
    Invoke-LocalWindowsFallbackBuild
  }

  $apk = Join-Path $Root "flutter_app\build\app\outputs\flutter-apk\app-release.apk"
  $exe = Join-Path $Root "flutter_app\build\windows\x64\runner\Release\ai_knowledge_flutter_app.exe"

  if (!(Test-Path $apk)) {
    throw "APK 未生成：$apk"
  }

  if (!(Test-Path $exe)) {
    throw "Windows EXE 未生成：$exe"
  }

  Write-Host "用户端本地自测通过"
  Write-Host "APK: $apk"
  Write-Host "EXE: $exe"

  Write-Host ""
  Write-Host "Starting Windows EXE for login-page smoke check..."
  $exeProcess = Start-Process -FilePath $exe -WorkingDirectory (Split-Path -Parent $exe) -PassThru
  Start-Sleep -Seconds 3
  $runningExe = Get-Process ai_knowledge_flutter_app -ErrorAction SilentlyContinue
  if (-not $runningExe) {
    throw "EXE 启动后未检测到进程：$exe"
  }
  Write-Host "EXE 启动成功，已打开到登录页。PID: $($exeProcess.Id)"
  Write-Host "Codex 无法安全自动输入账号密码，登录后菜单点击由 Flutter 自动化测试覆盖。"

  Set-Location $Root
  git status --short

  Write-Host ""
  Write-Host "不要提交 Flutter 自动生成文件："
  Write-Host "flutter_app/ios/Runner/GeneratedPluginRegistrant.h"
  Write-Host "flutter_app/ios/Runner/GeneratedPluginRegistrant.m"
  Write-Host "flutter_app/windows/flutter/generated_plugin_registrant.cc"
  Write-Host "flutter_app/windows/flutter/generated_plugin_registrant.h"
  Write-Host "flutter_app/windows/flutter/generated_plugins.cmake"
  return
}

function Get-FlutterVersion {
  $PubspecPath = Join-Path $FlutterDir "pubspec.yaml"
  $VersionLine = Get-Content -LiteralPath $PubspecPath |
    Where-Object { $_ -match "^version:\s*(\S+)" } |
    Select-Object -First 1

  if (-not $VersionLine -or $VersionLine -notmatch "^version:\s*(\S+)") {
    return "unknown"
  }

  return ($Matches[1] -split "\+")[0]
}

function Get-FlutterPubspecBuildNumber {
  $PubspecPath = Join-Path $FlutterDir "pubspec.yaml"
  $VersionLine = Get-Content -LiteralPath $PubspecPath |
    Where-Object { $_ -match "^version:\s*(\S+)" } |
    Select-Object -First 1

  if (-not $VersionLine -or $VersionLine -notmatch "^version:\s*[^+]+\+(\d+)") {
    return 0
  }

  return [int]$Matches[1]
}

function Get-SourceStamp {
  try {
    $commit = (git -C $Root rev-parse --short HEAD).Trim()
    $dirty = git -C $Root status --porcelain
    if (-not [string]::IsNullOrWhiteSpace($dirty)) {
      return "$commit-dirty-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
    }
    return $commit
  } catch {
    return "unknown-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
  }
}

function Get-ExistingTestBuildNumber {
  param([Parameter(Mandatory = $true)][string]$ManifestPath)

  if (-not (Test-Path -LiteralPath $ManifestPath)) {
    return 0
  }

  try {
    $manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
    if ($manifest.buildNumber) {
      return [int]$manifest.buildNumber
    }
    if ($manifest.build) {
      return [int]$manifest.build
    }
  } catch {
    Write-Warning "Could not read existing test buildNumber from $ManifestPath`: $($_.Exception.Message)"
  }

  return 0
}

function ConvertTo-ManifestObject {
  param([Parameter(Mandatory = $true)][object]$Content)

  if ($Content -is [byte[]]) {
    $Content = [System.Text.Encoding]::UTF8.GetString($Content)
  }

  return ($Content | ConvertFrom-Json)
}

function Get-GitHubDefaultBranch {
  if (-not [string]::IsNullOrWhiteSpace($DefaultBranch)) {
    return $DefaultBranch.Trim()
  }

  try {
    $repoInfo = gh repo view $GitHubOwnerRepo --json defaultBranchRef 2>$null | ConvertFrom-Json
    if ($repoInfo.defaultBranchRef.name) {
      return [string]$repoInfo.defaultBranchRef.name
    }
  } catch {
    Write-Warning "Could not read GitHub default branch: $($_.Exception.Message)"
  }

  try {
    $currentBranch = git branch --show-current
    if (-not [string]::IsNullOrWhiteSpace($currentBranch)) {
      return $currentBranch.Trim()
    }
  } catch {
    Write-Warning "Could not read current git branch: $($_.Exception.Message)"
  }

  return "main"
}

function Get-RemoteManifestBuildNumber {
  param([Parameter(Mandatory = $true)][string]$ManifestUrl)

  $separator = if ($ManifestUrl.Contains("?")) { "&" } else { "?" }
  $RequestUrl = "$ManifestUrl$($separator)t=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"

  try {
    Add-Type -AssemblyName System.Net.Http
    $handler = [System.Net.Http.HttpClientHandler]::new()
    $handler.AllowAutoRedirect = $true
    $client = [System.Net.Http.HttpClient]::new($handler)
    try {
      $client.Timeout = [TimeSpan]::FromSeconds(30)
      $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Get, $RequestUrl)
      $request.Headers.TryAddWithoutValidation("User-Agent", "ai-knowledge-user-test-builder") | Out-Null
      $request.Headers.TryAddWithoutValidation("Accept", "application/json, text/plain, */*") | Out-Null
      $response = $client.SendAsync($request).GetAwaiter().GetResult()
      if (-not $response.IsSuccessStatusCode) {
        throw "HTTP $([int]$response.StatusCode) $($response.ReasonPhrase)"
      }
      $content = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    } finally {
      $client.Dispose()
      $handler.Dispose()
    }
    $manifest = ConvertTo-ManifestObject -Content $content
    if ($manifest.buildNumber) {
      return [int]$manifest.buildNumber
    }
    if ($manifest.build) {
      return [int]$manifest.build
    }
  } catch {
    Write-Warning "Could not read remote test buildNumber from $ManifestUrl`: $($_.Exception.Message)"
  }

  return 0
}

function Invoke-Gh {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)

  & gh @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "gh $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
}

function Get-GhJson {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)

  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = "SilentlyContinue"
  try {
    $output = & gh @Arguments 2>$null
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($output)) {
      return $null
    }
    return ($output | ConvertFrom-Json)
  } finally {
    $ErrorActionPreference = $previousPreference
  }
}

function Ensure-ManifestBranch {
  param([Parameter(Mandatory = $true)][string]$SourceBranch)

  $existing = Get-GhJson -Arguments @("api", "repos/$GitHubOwnerRepo/git/ref/heads/$ManifestBranch")
  if ($existing) {
    Write-Host "Manifest branch already exists: $ManifestBranch"
    return
  }

  $sourceRef = Get-GhJson -Arguments @("api", "repos/$GitHubOwnerRepo/git/ref/heads/$SourceBranch")
  if (-not $sourceRef -or -not $sourceRef.object.sha) {
    throw "Could not read source branch ref: $SourceBranch"
  }

  Invoke-Gh -Arguments @(
    "api",
    "-X", "POST",
    "repos/$GitHubOwnerRepo/git/refs",
    "-f", "ref=refs/heads/$ManifestBranch",
    "-f", "sha=$($sourceRef.object.sha)"
  )
  Write-Host "Created manifest branch: $ManifestBranch"
}

function Publish-RawManifestToBranch {
  Ensure-ManifestBranch -SourceBranch $ResolvedDefaultBranch

  $manifestPath = "public/manifests/user-test/version.json"
  $existing = Get-GhJson -Arguments @(
    "api",
    "repos/$GitHubOwnerRepo/contents/$manifestPath`?ref=$ManifestBranch"
  )
  $payload = [ordered]@{
    message = "chore: update user-test manifest build $BuildNumber"
    branch = $ManifestBranch
    content = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($RawManifestPath))
  }
  if ($existing -and $existing.sha) {
    $payload.sha = $existing.sha
  }

  $payloadPath = Join-Path $env:TEMP "ai-user-test-manifest-$BuildNumber.json"
  $Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText(
    $payloadPath,
    ($payload | ConvertTo-Json -Depth 6),
    $Utf8NoBom
  )

  try {
    Invoke-Gh -Arguments @(
      "api",
      "-X", "PUT",
      "repos/$GitHubOwnerRepo/contents/$manifestPath",
      "--input", $payloadPath
    )
  } finally {
    Remove-Item -LiteralPath $payloadPath -Force -ErrorAction SilentlyContinue
  }
  Write-Host "Published raw manifest to branch: $ManifestBranch"
}

function Ensure-UserTestRelease {
  & gh release view user-test *> $null
  if ($LASTEXITCODE -eq 0) {
    return
  }

  Invoke-Gh -Arguments @(
    "release",
    "create",
    "user-test",
    "--prerelease",
    "--title",
    "AI知识库助手 用户端测试版",
    "--notes",
    "用户端测试版，仅用于内部测试，不是正式版。"
  )
}

function Upload-UserTestReleaseAssets {
  Ensure-UserTestRelease

  $assets = @($ApkOutput, $WindowsReleaseZip, $WindowsDebugZip, $VersionJsonPath)
  foreach ($asset in $assets) {
    if (-not (Test-Path -LiteralPath $asset)) {
      throw "Required test release asset is missing: $asset"
    }
  }

  Invoke-Gh -Arguments @(
    "release",
    "upload",
    "user-test",
    $ApkOutput,
    $WindowsReleaseZip,
    $WindowsDebugZip,
    $VersionJsonPath,
    "--clobber"
  )
  Write-Host "Uploaded user-test release assets."
}

function Invoke-ProjectCommand {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$WorkingDirectory
  )

  Push-Location $WorkingDirectory
  try {
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed: $FilePath $($Arguments -join ' ')"
    }
  } finally {
    Pop-Location
  }
}

function Stop-RecentBuildProcesses {
  param([Parameter(Mandatory = $true)][datetime]$StartedAfter)

  $names = @("flutter", "dart", "dartvm", "cmake", "MSBuild", "cl", "link", "ninja")
  Get-Process -ErrorAction SilentlyContinue |
    Where-Object { $names -contains $_.ProcessName -and $_.StartTime -ge $StartedAfter } |
    ForEach-Object {
      try {
        Stop-Process -Id $_.Id -Force -ErrorAction Stop
      } catch {
        Write-Warning "Could not stop build process $($_.ProcessName) $($_.Id): $($_.Exception.Message)"
      }
    }
}

function Invoke-ProjectCommandWithTimeout {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$WorkingDirectory,
    [Parameter(Mandatory = $true)][int]$TimeoutSeconds
  )

  $startedAt = Get-Date
  $resolvedCommand = (Get-Command $FilePath -ErrorAction Stop).Source
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $resolvedCommand
  $startInfo.WorkingDirectory = $WorkingDirectory
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.Arguments = (($Arguments | ForEach-Object {
        if ($_ -match '[\s"&]') {
          '"' + ($_ -replace '\\', '\\' -replace '"', '\"') + '"'
        } else {
          $_
        }
      }) -join " ")

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  $process.Start() | Out-Null
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()

  if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
    Stop-RecentBuildProcesses -StartedAfter $startedAt
    if (-not $process.HasExited) {
      try {
        $process.Kill($true)
        $process.WaitForExit(10000) | Out-Null
      } catch {
        Write-Warning "Could not kill timed out process $($process.Id): $($_.Exception.Message)"
      }
    }
    $outText = $stdoutTask.GetAwaiter().GetResult()
    $errText = $stderrTask.GetAwaiter().GetResult()
    throw "Command timed out after $TimeoutSeconds seconds: $FilePath $($Arguments -join ' ')`n$outText`n$errText"
  }

  $outText = $stdoutTask.GetAwaiter().GetResult()
  $errText = $stderrTask.GetAwaiter().GetResult()

  if ($process.ExitCode -ne 0) {
    throw "Command failed with exit code $($process.ExitCode): $FilePath $($Arguments -join ' ')`n$outText`n$errText"
  }

  if ($outText.Trim()) {
    Write-Host $outText
  }
  if ($errText.Trim()) {
    Write-Warning $errText
  }
}

function Find-FirstExistingFile {
  param([string[]]$Candidates)

  foreach ($candidate in $Candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  return $null
}

function Get-FlutterRoot {
  $FlutterCommand = (Get-Command flutter -ErrorAction Stop).Source
  $FlutterBin = Split-Path -Parent $FlutterCommand
  return Split-Path -Parent $FlutterBin
}

function Import-FlutterGeneratedEnvironment {
  $GeneratedConfig = Join-Path $FlutterDir "windows/flutter/ephemeral/generated_config.cmake"
  if (-not (Test-Path -LiteralPath $GeneratedConfig)) {
    throw "Flutter Windows generated config not found: $GeneratedConfig"
  }

  foreach ($line in Get-Content -LiteralPath $GeneratedConfig) {
    if ($line -match '"([^"=]+)=([^"]*)"') {
      [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], "Process")
    }
  }

  $FlutterRoot = Get-FlutterRoot
  [Environment]::SetEnvironmentVariable("FLUTTER_ROOT", $FlutterRoot, "Process")
  [Environment]::SetEnvironmentVariable("PROJECT_DIR", $FlutterDir, "Process")
  [Environment]::SetEnvironmentVariable("FLUTTER_EPHEMERAL_DIR", (Join-Path $FlutterDir "windows/flutter/ephemeral"), "Process")
  [Environment]::SetEnvironmentVariable("FLUTTER_TARGET", "lib/main.dart", "Process")
  [Environment]::SetEnvironmentVariable("PACKAGE_CONFIG", (Join-Path $FlutterDir ".dart_tool/package_config.json"), "Process")
}

function Quote-CmdPath {
  param([Parameter(Mandatory = $true)][string]$Value)
  return '"' + $Value + '"'
}

function Invoke-FlutterWindowsFallbackBuild {
  param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration
  )

  Import-FlutterGeneratedEnvironment

  $FlutterRoot = Get-FlutterRoot
  $ToolBackend = Join-Path $FlutterRoot "packages/flutter_tools/bin/tool_backend.bat"
  if (-not (Test-Path -LiteralPath $ToolBackend)) {
    throw "Flutter tool_backend.bat not found: $ToolBackend"
  }

  Invoke-ProjectCommand -FilePath $ToolBackend -Arguments @("windows-x64", $Configuration) -WorkingDirectory $FlutterDir

  $VsDevCmd = Find-FirstExistingFile @(
    "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat",
    "C:\Program Files\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat",
    "C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat"
  )
  if (-not $VsDevCmd) {
    throw "Visual Studio VsDevCmd.bat was not found."
  }

  $CMake = Find-FirstExistingFile @(
    "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe",
    "C:\Program Files\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe",
    "C:\Program Files\CMake\bin\cmake.exe"
  )
  if (-not $CMake) {
    throw "cmake.exe was not found."
  }

  $Ninja = Find-FirstExistingFile @(
    "C:\Users\$env:USERNAME\AppData\Local\Microsoft\WinGet\Packages\Ninja-build.Ninja_Microsoft.Winget.Source_8wekyb3d8bbwe\ninja.exe"
  )
  if (-not $Ninja) {
    $Ninja = Get-ChildItem -Path "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter ninja.exe -ErrorAction SilentlyContinue |
      Select-Object -First 1 -ExpandProperty FullName
  }
  if (-not $Ninja) {
    throw "ninja.exe was not found."
  }

  $BuildDir = Join-Path $FlutterDir "build/windows/x64_ninja_test_$($Configuration.ToLowerInvariant())"
  $InstallPrefix = Join-Path $BuildDir "runner"
  $Command = "$(Quote-CmdPath $VsDevCmd) -arch=x64 && " +
    "$(Quote-CmdPath $CMake) -S windows -B $(Quote-CmdPath $BuildDir) -G Ninja -DCMAKE_MAKE_PROGRAM=$(Quote-CmdPath $Ninja) -DCMAKE_BUILD_TYPE=$Configuration -DFLUTTER_TARGET_PLATFORM=windows-x64 -DCMAKE_INSTALL_PREFIX=$(Quote-CmdPath $InstallPrefix) && " +
    "$(Quote-CmdPath $CMake) --build $(Quote-CmdPath $BuildDir) --target install -- -j 2"

  Push-Location $FlutterDir
  try {
    & $env:COMSPEC /d /s /c $Command
    if ($LASTEXITCODE -ne 0) {
      throw "Fallback Windows $Configuration build failed."
    }
  } finally {
    Pop-Location
  }

  return $InstallPrefix
}

function Get-WindowsBuildOutput {
  param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration
  )

  $Official = Join-Path $FlutterDir "build/windows/x64/runner/$Configuration"
  if (Test-Path -LiteralPath (Join-Path $Official "ai_knowledge_flutter_app.exe")) {
    return $Official
  }

  $Fallback = Join-Path $FlutterDir "build/windows/x64_ninja_test_$($Configuration.ToLowerInvariant())/runner"
  if (Test-Path -LiteralPath (Join-Path $Fallback "ai_knowledge_flutter_app.exe")) {
    return $Fallback
  }

  return $null
}

function Compress-WindowsFolder {
  param(
    [Parameter(Mandatory = $true)][string]$SourceDir,
    [Parameter(Mandatory = $true)][string]$DestinationZip
  )

  if (-not (Test-Path -LiteralPath (Join-Path $SourceDir "ai_knowledge_flutter_app.exe"))) {
    throw "Windows build output is incomplete: $SourceDir"
  }
  if (-not (Test-Path -LiteralPath (Join-Path $SourceDir "data"))) {
    throw "Windows build output is missing data directory: $SourceDir"
  }
  if (-not (Test-Path -LiteralPath (Join-Path $SourceDir "flutter_windows.dll"))) {
    throw "Windows build output is missing flutter_windows.dll: $SourceDir"
  }

  if (Test-Path -LiteralPath $DestinationZip) {
    Remove-Item -LiteralPath $DestinationZip -Force
  }
  Compress-Archive -Path (Join-Path $SourceDir "*") -DestinationPath $DestinationZip -Force
}

function Clear-WindowsBuildArtifacts {
  $paths = @(
    (Join-Path $FlutterDir "build/windows"),
    (Join-Path $FlutterDir "windows/flutter/ephemeral"),
    (Join-Path $Root "releases/user-test/windows"),
    (Join-Path $TestOutputDir "windows-runtime")
  )

  foreach ($path in $paths) {
    if (Test-Path -LiteralPath $path) {
      Write-Host "Removing stale Windows test build output: $path"
      Remove-Item -LiteralPath $path -Recurse -Force
    }
  }
}

function Write-WindowsUpdateInfo {
  param(
    [Parameter(Mandatory = $true)][string]$SourceDir,
    [Parameter(Mandatory = $true)][string]$Configuration
  )

  $info = [ordered]@{
    appName = "AI Knowledge Assistant"
    appChannel = "user-test"
    version = $Version
    buildNumber = $BuildNumber
    buildTime = $BuildTime
    gitCommit = $SourceStamp
    sourceStamp = $SourceStamp
    configuration = $Configuration
    containsFeatureMarkers = @(
      "force_update_gate",
      "test_update_download_progress",
      "history_drawer",
      "upload_waiting_area",
      "compact_image_message"
    )
  }

  $Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText(
    (Join-Path $SourceDir "update_info.json"),
    ($info | ConvertTo-Json -Depth 8),
    $Utf8NoBom
  )
}

function Test-WindowsZipPackage {
  param(
    [Parameter(Mandatory = $true)][string]$ZipPath,
    [Parameter(Mandatory = $true)][string]$Configuration
  )

  if (-not (Test-Path -LiteralPath $ZipPath)) {
    throw "Windows $Configuration ZIP was not generated: $ZipPath"
  }

  $zipItem = Get-Item -LiteralPath $ZipPath
  if ($zipItem.Length -lt 5MB) {
    throw "Windows $Configuration ZIP is unexpectedly small: $($zipItem.Length) bytes"
  }
  if ($zipItem.LastWriteTime -lt $BuildStartedAt) {
    throw "Windows $Configuration ZIP appears stale: $($zipItem.LastWriteTime)"
  }

  $verifyDir = Join-Path $env:TEMP "ai-user-test-verify-$Configuration-$BuildNumber-$([guid]::NewGuid())"
  New-Item -ItemType Directory -Force -Path $verifyDir | Out-Null
  try {
    Expand-Archive -LiteralPath $ZipPath -DestinationPath $verifyDir -Force
    $infoPath = Join-Path $verifyDir "update_info.json"
    if (-not (Test-Path -LiteralPath $infoPath)) {
      throw "Windows $Configuration ZIP missing update_info.json"
    }
    $info = [System.IO.File]::ReadAllText($infoPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    if ([int]$info.buildNumber -ne $BuildNumber) {
      throw "Windows $Configuration ZIP buildNumber mismatch. expected=$BuildNumber actual=$($info.buildNumber)"
    }
    if ([string]$info.appChannel -ne "user-test") {
      throw "Windows $Configuration ZIP appChannel mismatch: $($info.appChannel)"
    }
    if (-not (Test-Path -LiteralPath (Join-Path $verifyDir "ai_knowledge_flutter_app.exe"))) {
      throw "Windows $Configuration ZIP missing runner exe"
    }
    if (-not (Test-Path -LiteralPath (Join-Path $verifyDir "data"))) {
      throw "Windows $Configuration ZIP missing data directory"
    }
    if (-not (Test-Path -LiteralPath (Join-Path $verifyDir "flutter_windows.dll"))) {
      throw "Windows $Configuration ZIP missing flutter_windows.dll"
    }
  } finally {
    Remove-Item -LiteralPath $verifyDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Build-WindowsPackage {
  param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration,
    [string]$DestinationZip,
    [switch]$AllowFailure
  )

  $result = [ordered]@{
    configuration = $Configuration
    success = $false
    zip = $DestinationZip
    source = ""
    error = ""
  }

  try {
    Clear-WindowsBuildArtifacts
    try {
      Invoke-ProjectCommandWithTimeout -FilePath "flutter" -Arguments (@("build", "windows", "--$($Configuration.ToLowerInvariant())") + $script:FlutterDartDefines) -WorkingDirectory $FlutterDir -TimeoutSeconds $WindowsBuildTimeoutSeconds
    } catch {
      Write-Warning "flutter build windows --$($Configuration.ToLowerInvariant()) failed or timed out. Trying fallback build. $($_.Exception.Message)"
      Invoke-FlutterWindowsFallbackBuild -Configuration $Configuration | Out-Null
    }

    $source = Get-WindowsBuildOutput -Configuration $Configuration
    if (-not $source) {
      throw "Windows $Configuration output folder was not found."
    }

    Write-WindowsUpdateInfo -SourceDir $source -Configuration $Configuration
    Compress-WindowsFolder -SourceDir $source -DestinationZip $DestinationZip
    Test-WindowsZipPackage -ZipPath $DestinationZip -Configuration $Configuration
    $result.success = $true
    $result.source = $source
  } catch {
    $result.error = $_.Exception.Message
    if (-not $AllowFailure) {
      throw
    }
    Write-Warning "Windows $Configuration build failed: $($result.error)"
  }

  return $result
}

if (-not (Test-Path -LiteralPath $FlutterDir)) {
  throw "flutter_app directory not found: $FlutterDir"
}

New-Item -ItemType Directory -Force -Path $TestOutputDir | Out-Null
New-Item -ItemType Directory -Force -Path $RawManifestDir | Out-Null
foreach ($artifactPath in @($ApkOutput, $WindowsDebugZip, $WindowsReleaseZip, $VersionJsonPath, $RawManifestPath)) {
  if (Test-Path -LiteralPath $artifactPath) {
    Remove-Item -LiteralPath $artifactPath -Force
  }
}

$Version = Get-FlutterVersion
$PubspecBuildNumber = Get-FlutterPubspecBuildNumber
$ResolvedDefaultBranch = Get-GitHubDefaultBranch
$NormalizedReleaseAssetBaseUrl = $ReleaseAssetBaseUrl.TrimEnd("/")
if ([string]::IsNullOrWhiteSpace($RawManifestUrl)) {
  $RawManifestUrl = "https://raw.githubusercontent.com/$GitHubOwnerRepo/$ManifestBranch/public/manifests/user-test/version.json"
}
$RawRemoteBuildNumber = Get-RemoteManifestBuildNumber -ManifestUrl $RawManifestUrl
$ReleaseRemoteBuildNumber = Get-RemoteManifestBuildNumber -ManifestUrl "$NormalizedReleaseAssetBaseUrl/version.json"
$ExistingRawBuildNumber = Get-ExistingTestBuildNumber -ManifestPath $RawManifestPath
$ExistingReleaseBuildNumber = Get-ExistingTestBuildNumber -ManifestPath $VersionJsonPath
$MaxKnownBuildNumber = ($RawRemoteBuildNumber, $ReleaseRemoteBuildNumber, $ExistingRawBuildNumber, $ExistingReleaseBuildNumber, $PubspecBuildNumber | Measure-Object -Maximum).Maximum
if ($MaxKnownBuildNumber -gt 0) {
  $BuildNumber = [int]$MaxKnownBuildNumber + 1
} else {
  $BuildNumber = [int](Get-Date -Format "yyMMddHH")
}
$BuildTime = (Get-Date).ToUniversalTime().ToString("o")
$SourceStamp = Get-SourceStamp
$script:FlutterDartDefines = @(
  "--dart-define=APP_CHANNEL=user-test",
  "--dart-define=APP_VERSION=$Version",
  "--dart-define=APP_BUILD=$BuildNumber",
  "--dart-define=TEST_BUILD_NUMBER=$BuildNumber",
  "--dart-define=API_BASE_URL=$ApiBaseUrl",
  "--dart-define=USE_MOCK_API=false"
)

Write-Host "Building user test channel into: $TestOutputDir"
Write-Host "User test version: $Version ($BuildNumber)"
Write-Host "User test API base URL: $ApiBaseUrl"
Write-Host "Raw manifest URL: $RawManifestUrl"
Write-Host "Build number sources: rawRemote=$RawRemoteBuildNumber releaseRemote=$ReleaseRemoteBuildNumber localRaw=$ExistingRawBuildNumber localRelease=$ExistingReleaseBuildNumber pubspec=$PubspecBuildNumber"
try {
  Invoke-ProjectCommand -FilePath "flutter" -Arguments @("pub", "get") -WorkingDirectory $FlutterDir
} catch {
  Write-Warning "flutter pub get failed. Trying local package cache with --offline. $($_.Exception.Message)"
  try {
    Invoke-ProjectCommand -FilePath "flutter" -Arguments @("pub", "get", "--offline") -WorkingDirectory $FlutterDir
  } catch {
    $PackageConfig = Join-Path $FlutterDir ".dart_tool/package_config.json"
    if (-not (Test-Path -LiteralPath $PackageConfig)) {
      throw
    }
    Write-Warning "flutter pub get --offline also failed, but existing package_config.json is present. Continuing with existing resolved dependencies."
  }
}
Invoke-ProjectCommand -FilePath "flutter" -Arguments @("analyze") -WorkingDirectory $FlutterDir

Invoke-ProjectCommand -FilePath "flutter" -Arguments (@("build", "apk", "--release", "--no-shrink") + $script:FlutterDartDefines) -WorkingDirectory $FlutterDir
$SourceApk = Join-Path $FlutterDir "build/app/outputs/flutter-apk/app-release.apk"
if (-not (Test-Path -LiteralPath $SourceApk)) {
  throw "APK was not generated: $SourceApk"
}
Copy-Item -LiteralPath $SourceApk -Destination $ApkOutput -Force

$WindowsDebug = Build-WindowsPackage -Configuration "Debug" -DestinationZip $WindowsDebugZip
$WindowsRelease = $null
if (-not $SkipWindowsRelease) {
  $WindowsRelease = Build-WindowsPackage -Configuration "Release" -DestinationZip $WindowsReleaseZip -AllowFailure
  if (-not $WindowsRelease.success) {
    throw "Windows Release test ZIP was not generated. Refusing to upload stale release asset."
  }
}

$NormalizedBaseUrl = $BaseUrl.TrimEnd("/")
$NormalizedReleaseAssetBaseUrl = $ReleaseAssetBaseUrl.TrimEnd("/")
$VersionInfo = [ordered]@{
  appName = "AI知识库助手"
  channel = "user-test"
  platform = "user"
  version = $Version
  buildNumber = $BuildNumber
  minSupportedBuildNumber = $BuildNumber
  forceUpdate = $true
  buildTime = $BuildTime
  releasePageUrl = "https://github.com/caizuan2/-AI/releases/tag/user-test"
  apkUrl = "$NormalizedReleaseAssetBaseUrl/ai-knowledge-user-test.apk"
  windowsReleaseUrl = "$NormalizedReleaseAssetBaseUrl/ai-knowledge-user-windows-release.zip"
  windowsDebugUrl = "$NormalizedReleaseAssetBaseUrl/ai-knowledge-user-windows-debug.zip"
  apkMirrors = @(
    "$NormalizedReleaseAssetBaseUrl/ai-knowledge-user-test.apk"
  )
  windowsReleaseMirrors = @(
    "$NormalizedReleaseAssetBaseUrl/ai-knowledge-user-windows-release.zip"
  )
  manifestMirrors = @(
    $RawManifestUrl
    "https://api.github.com/repos/$GitHubOwnerRepo/contents/public/manifests/user-test/version.json?ref=$ManifestBranch"
    "$NormalizedReleaseAssetBaseUrl/version.json"
    "https://cdn.jsdelivr.net/gh/$GitHubOwnerRepo@$ManifestBranch/public/manifests/user-test/version.json"
  )
  changelog = $Changelog
}

$VersionJson = $VersionInfo | ConvertTo-Json -Depth 8
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($VersionJsonPath, $VersionJson, $Utf8NoBom)
[System.IO.File]::WriteAllText($RawManifestPath, $VersionJson, $Utf8NoBom)

if (-not $SkipGitHubUpload) {
  Upload-UserTestReleaseAssets
}

if (-not $SkipManifestBranchUpdate) {
  Publish-RawManifestToBranch
}

Write-Host ""
Write-Host "User test build completed."
Write-Host "Test download page: $NormalizedBaseUrl/test/user"
Write-Host "Test APK: $($VersionInfo.apkUrl)"
Write-Host "Windows Debug ZIP: $($VersionInfo.windowsDebugUrl)"
Write-Host "Windows Release ZIP: $($VersionInfo.windowsReleaseUrl)"
Write-Host "Raw version manifest: $RawManifestUrl"
Write-Host "Version manifest: $NormalizedReleaseAssetBaseUrl/version.json"
Write-Host ""
Write-Host "Formal release is intentionally not touched."



