import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';

import 'test_update_download_progress.dart';
import 'test_update_manifest.dart';
import 'test_update_service.dart';

const MethodChannel _androidUpdateChannel =
    MethodChannel('ai_knowledge_flutter_app/update');

Future<TestUpdateActionResult> startTestUpdate(
  TestUpdateManifest manifest, {
  void Function(double? progress)? onProgress,
  void Function(TestUpdateDownloadProgress progress)? onDownloadProgress,
}) async {
  if (Platform.isWindows) {
    return _downloadWindowsZip(
      manifest,
      onProgress: onProgress,
      onDownloadProgress: onDownloadProgress,
    );
  }

  if (Platform.isAndroid) {
    return _downloadAndroidApk(
      manifest,
      onProgress: onProgress,
      onDownloadProgress: onDownloadProgress,
    );
  }

  final url = manifest.currentPlatformDownloadUrl;
  if (url.isEmpty) {
    return const TestUpdateActionResult(
      title: '下载地址缺失',
      message: '当前测试版没有可用下载地址。',
    );
  }

  onProgress?.call(null);
  final opened = await launchUrl(
    Uri.parse(url),
    mode: LaunchMode.externalApplication,
  );
  return TestUpdateActionResult(
    title: opened ? '已打开下载链接' : '无法打开下载链接',
    message: opened ? '请下载并安装测试版。' : '请手动打开测试版下载地址：$url',
  );
}

Future<TestUpdateActionResult> _downloadAndroidApk(
  TestUpdateManifest manifest, {
  void Function(double? progress)? onProgress,
  void Function(TestUpdateDownloadProgress progress)? onDownloadProgress,
}) async {
  final urls = manifest.apkDownloadCandidates;
  if (urls.isEmpty) {
    return const TestUpdateActionResult(
      title: 'APK 地址缺失',
      message: '当前测试版没有 APK 下载地址。',
    );
  }

  late final _DownloadResult download;
  try {
    download = await _downloadToTempFile(
      urls,
      fileName: 'ai-knowledge-user-test.apk',
      onProgress: onProgress,
      onDownloadProgress: onDownloadProgress,
    );
  } catch (error) {
    final fallbackUrl = urls.first;
    final opened = await launchUrl(
      Uri.parse(fallbackUrl),
      mode: LaunchMode.externalApplication,
    );
    return TestUpdateActionResult(
      title: opened ? '已打开浏览器下载' : 'APK 下载失败',
      message: opened
          ? 'App 内下载超时或失败，已改用系统浏览器下载 APK。下载完成后请手动安装测试版。'
          : 'App 内下载失败，且无法打开浏览器。请稍后重试。\n$error',
    );
  }

  try {
    final installed = await _androidUpdateChannel.invokeMethod<bool>(
          'installApk',
          <String, Object?>{'path': download.file.path},
        ) ??
        false;
    if (installed) {
      return TestUpdateActionResult(
        title: 'APK 已下载',
        filePath: download.file.path,
        message: '已下载到临时目录，并打开系统安装界面。若系统提示未知来源，请到系统设置允许安装后继续。',
      );
    }
  } catch (error) {
    debugPrint('Android APK install intent failed: $error');
  }

  final opened = await launchUrl(
    Uri.parse(download.sourceUrl),
    mode: LaunchMode.externalApplication,
  );
  return TestUpdateActionResult(
    title: opened ? 'APK 已下载' : 'APK 已下载，请手动打开链接',
    filePath: download.file.path,
    message: opened
        ? '已保存到临时目录，并打开浏览器下载页。若无法安装，请允许未知来源应用安装。'
        : '已保存到临时目录：${download.file.path}\n如无法自动安装，请手动打开下载地址：${download.sourceUrl}',
  );
}

Future<TestUpdateActionResult> _downloadWindowsZip(
  TestUpdateManifest manifest, {
  void Function(double? progress)? onProgress,
  void Function(TestUpdateDownloadProgress progress)? onDownloadProgress,
}) async {
  final urls = manifest.windowsReleaseDownloadCandidates;
  if (urls.isEmpty) {
    return const TestUpdateActionResult(
      title: 'Windows ZIP 地址缺失',
      message: '当前测试版没有 Windows Release ZIP 下载地址。',
    );
  }

  final download = await _downloadToTempFile(
    urls,
    fileName: 'ai-knowledge-user-windows-release.zip',
    onProgress: onProgress,
    onDownloadProgress: onDownloadProgress,
  );

  final helper = await _createWindowsUpdaterScript();
  await Process.start(
    'powershell.exe',
    <String>[
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      helper.path,
      '-AppPid',
      pid.toString(),
      '-ZipPath',
      download.file.path,
      '-TargetDir',
      File(Platform.resolvedExecutable).parent.path,
      '-ExeName',
      File(Platform.resolvedExecutable).uri.pathSegments.last,
      '-ExpectedBuildNumber',
      manifest.buildNumber.toString(),
      '-ExpectedChannel',
      manifest.channel,
    ],
    mode: ProcessStartMode.detached,
  );

  unawaited(Future<void>.delayed(const Duration(milliseconds: 800), () {
    exit(0);
  }));

  return TestUpdateActionResult(
    title: 'Windows 更新器已启动',
    filePath: download.file.path,
    message: '已下载完整 Release ZIP，并启动安全更新脚本。程序将关闭，更新脚本会备份旧目录、解压新版本并尝试重新打开应用。',
  );
}

Future<_DownloadResult> _downloadToTempFile(
  List<String> urls, {
  required String fileName,
  void Function(double? progress)? onProgress,
  void Function(TestUpdateDownloadProgress progress)? onDownloadProgress,
}) async {
  final sourceUrl = await _selectFastestUrl(urls);
  final uri = Uri.parse(sourceUrl);
  final client = http.Client();
  try {
    final request = http.Request('GET', uri)
      ..followRedirects = true
      ..headers.addAll(_downloadHeaders);
    final response = await client.send(request).timeout(
          const Duration(minutes: 5),
        );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw HttpException(
        'Download failed with status ${response.statusCode}',
        uri: uri,
      );
    }

    final dir = Directory(
      '${Directory.systemTemp.path}${Platform.pathSeparator}ai-knowledge-user-test-update',
    );
    if (!dir.existsSync()) {
      dir.createSync(recursive: true);
    }
    final file = File('${dir.path}${Platform.pathSeparator}$fileName');
    final sink = file.openWrite();
    final total = response.contentLength ?? -1;
    final stopwatch = Stopwatch()..start();
    var received = 0;

    await for (final chunk in response.stream.timeout(
      const Duration(minutes: 5),
    )) {
      received += chunk.length;
      sink.add(chunk);
      final seconds = stopwatch.elapsedMilliseconds / 1000;
      final speed = seconds <= 0 ? 0.0 : received / seconds;
      final progress = TestUpdateDownloadProgress(
        receivedBytes: received,
        totalBytes: total,
        bytesPerSecond: speed,
        sourceUrl: sourceUrl,
      );
      onProgress?.call(progress.fraction);
      onDownloadProgress?.call(progress);
    }

    await sink.close();
    stopwatch.stop();
    final finalProgress = TestUpdateDownloadProgress(
      receivedBytes: received,
      totalBytes: total > 0 ? total : received,
      bytesPerSecond: stopwatch.elapsedMilliseconds <= 0
          ? 0
          : received / (stopwatch.elapsedMilliseconds / 1000),
      sourceUrl: sourceUrl,
    );
    onProgress?.call(1);
    onDownloadProgress?.call(finalProgress);
    return _DownloadResult(file: file, sourceUrl: sourceUrl);
  } catch (error) {
    debugPrint('Test update download failed: $error');
    rethrow;
  } finally {
    client.close();
  }
}

Future<String> _selectFastestUrl(List<String> urls) async {
  final normalized = <String>[];
  for (final url in urls) {
    final trimmed = url.trim();
    if (trimmed.isNotEmpty && !normalized.contains(trimmed)) {
      normalized.add(trimmed);
    }
  }
  if (normalized.length <= 1) {
    return normalized.first;
  }

  final probes = await Future.wait(
    normalized.map(_probeUrl),
    eagerError: false,
  );
  final successful = probes.where((probe) => probe.ok).toList()
    ..sort((left, right) {
      final leftHasLength = left.contentLength > 0;
      final rightHasLength = right.contentLength > 0;
      if (leftHasLength != rightHasLength) {
        return leftHasLength ? -1 : 1;
      }
      return left.elapsed.compareTo(right.elapsed);
    });
  if (successful.isNotEmpty) {
    return successful.first.url;
  }
  return normalized.first;
}

Future<_UrlProbe> _probeUrl(String url) async {
  final client = http.Client();
  final stopwatch = Stopwatch()..start();
  try {
    final request = http.Request('HEAD', Uri.parse(url))
      ..followRedirects = true
      ..headers.addAll(_downloadHeaders);
    final response = await client.send(request).timeout(
          const Duration(seconds: 6),
        );
    stopwatch.stop();
    return _UrlProbe(
      url: url,
      ok: response.statusCode >= 200 && response.statusCode < 400,
      elapsed: stopwatch.elapsed,
      contentLength: response.contentLength ?? -1,
    );
  } catch (error) {
    stopwatch.stop();
    debugPrint('Test update mirror probe failed for $url: $error');
    return _UrlProbe(
      url: url,
      ok: false,
      elapsed: stopwatch.elapsed,
      contentLength: -1,
    );
  } finally {
    client.close();
  }
}

Future<File> _createWindowsUpdaterScript() async {
  final dir = Directory(
    '${Directory.systemTemp.path}${Platform.pathSeparator}ai-knowledge-user-test-update',
  );
  if (!dir.existsSync()) {
    dir.createSync(recursive: true);
  }
  final script =
      File('${dir.path}${Platform.pathSeparator}update_user_test.ps1');
  await script.writeAsString(r'''
param(
  [Parameter(Mandatory = $true)][int]$AppPid,
  [Parameter(Mandatory = $true)][string]$ZipPath,
  [Parameter(Mandatory = $true)][string]$TargetDir,
  [Parameter(Mandatory = $true)][string]$ExeName,
  [Parameter(Mandatory = $true)][int]$ExpectedBuildNumber,
  [Parameter(Mandatory = $true)][string]$ExpectedChannel
)

$ErrorActionPreference = "Stop"
$log = Join-Path ([System.IO.Path]::GetTempPath()) "ai-knowledge-user-test-update.log"
function Write-UpdateLog([string]$Message) {
  Add-Content -LiteralPath $log -Value "[$(Get-Date -Format o)] $Message"
}

try {
  $verifyDir = Join-Path ([System.IO.Path]::GetTempPath()) "ai-knowledge-user-test-verify-$ExpectedBuildNumber"
  if (Test-Path -LiteralPath $verifyDir) {
    Remove-Item -LiteralPath $verifyDir -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $verifyDir | Out-Null
  Write-UpdateLog "Verifying update package $ZipPath"
  Expand-Archive -LiteralPath $ZipPath -DestinationPath $verifyDir -Force
  $infoPath = Join-Path $verifyDir "update_info.json"
  if (-not (Test-Path -LiteralPath $infoPath)) {
    throw "update_info.json missing from update package"
  }
  $info = [System.IO.File]::ReadAllText($infoPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
  if ([int]$info.buildNumber -ne $ExpectedBuildNumber) {
    throw "update package buildNumber mismatch. expected=$ExpectedBuildNumber actual=$($info.buildNumber)"
  }
  if ([string]$info.appChannel -ne $ExpectedChannel) {
    throw "update package channel mismatch. expected=$ExpectedChannel actual=$($info.appChannel)"
  }
  Remove-Item -LiteralPath $verifyDir -Recurse -Force

  Write-UpdateLog "Waiting for app process $AppPid"
  Wait-Process -Id $AppPid -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 700

  $parent = Split-Path -Parent $TargetDir
  $leaf = Split-Path -Leaf $TargetDir
  $backup = Join-Path $parent "$leaf.backup_$(Get-Date -Format yyyyMMddHHmmss)"
  $renamed = $false
  if (Test-Path -LiteralPath $TargetDir) {
    Write-UpdateLog "Backing up $TargetDir to $backup"
    Rename-Item -LiteralPath $TargetDir -NewName (Split-Path -Leaf $backup)
    $renamed = $true
  }

  New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
  Write-UpdateLog "Extracting $ZipPath to $TargetDir"
  Expand-Archive -LiteralPath $ZipPath -DestinationPath $TargetDir -Force

  $newExe = Join-Path $TargetDir $ExeName
  if (Test-Path -LiteralPath $newExe) {
    Write-UpdateLog "Starting $newExe"
    Start-Process -FilePath $newExe
  } else {
    Write-UpdateLog "New exe not found, opening target folder"
    Start-Process explorer.exe $TargetDir
  }
} catch {
  Write-UpdateLog "Update failed: $($_.Exception.Message)"
  try {
    if (Test-Path -LiteralPath $verifyDir) {
      Remove-Item -LiteralPath $verifyDir -Recurse -Force
    }
    if ($renamed -and (Test-Path -LiteralPath $backup)) {
      if (Test-Path -LiteralPath $TargetDir) {
        Remove-Item -LiteralPath $TargetDir -Recurse -Force
      }
      Rename-Item -LiteralPath $backup -NewName (Split-Path -Leaf $TargetDir)
      Write-UpdateLog "Restored backup $backup"
    }
  } catch {
    Write-UpdateLog "Restore failed: $($_.Exception.Message)"
  }
  Start-Process explorer.exe (Split-Path -Parent $ZipPath)
}
''');
  return script;
}

const Map<String, String> _downloadHeaders = {
  'User-Agent': 'ai-knowledge-user-test-updater',
  'Accept': 'application/octet-stream, application/json, */*',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
};

class _DownloadResult {
  const _DownloadResult({
    required this.file,
    required this.sourceUrl,
  });

  final File file;
  final String sourceUrl;
}

class _UrlProbe {
  const _UrlProbe({
    required this.url,
    required this.ok,
    required this.elapsed,
    required this.contentLength,
  });

  final String url;
  final bool ok;
  final Duration elapsed;
  final int contentLength;
}
