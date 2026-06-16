import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'package:ai_knowledge_flutter_app/core/config/app_config.dart';
import 'package:ai_knowledge_flutter_app/modules/update/update_dialog.dart';
import 'package:ai_knowledge_flutter_app/modules/update/test_update_manifest.dart';
import 'package:ai_knowledge_flutter_app/modules/update/test_update_service.dart';
import 'package:ai_knowledge_flutter_app/modules/update/update_manifest.dart';
import 'package:ai_knowledge_flutter_app/modules/update/update_service.dart';

void main() {
  test('uses fixed latest manifest URL', () {
    expect(
      AppConfig.latestManifestUrl,
      'https://stately-sawine-1efd4d.netlify.app/releases/latest.json',
    );
    expect(
      AppConfig.latestManifestUrls,
      [
        'https://stately-sawine-1efd4d.netlify.app/releases/latest.json',
        'https://github.com/caizuan2/-AI/releases/latest/download/latest.json',
        'https://raw.githubusercontent.com/caizuan2/-AI/main/public/releases/latest.json',
      ],
    );
  });

  test('uses raw GitHub manifest first for user-test updates', () {
    expect(
      AppConfig.userTestManifestUrl,
      'https://raw.githubusercontent.com/caizuan2/-AI/user-test-manifest/public/manifests/user-test/version.json',
    );
    expect(
      AppConfig.userTestManifestUrls,
      [
        'https://raw.githubusercontent.com/caizuan2/-AI/user-test-manifest/public/manifests/user-test/version.json',
        'https://github.com/caizuan2/-AI/releases/download/user-test/version.json',
      ],
    );
  });

  test('uses Android-specific fresh-first manifest URLs', () {
    expect(
      AppConfig.userTestAndroidManifestUrls,
      [
        'https://raw.githubusercontent.com/caizuan2/-AI/user-test-manifest/public/manifests/user-test/version.json',
        'https://api.github.com/repos/caizuan2/-AI/contents/public/manifests/user-test/version.json?ref=user-test-manifest',
        'https://github.com/caizuan2/-AI/releases/download/user-test/version.json',
        'https://cdn.jsdelivr.net/gh/caizuan2/-AI@user-test-manifest/public/manifests/user-test/version.json',
      ],
    );
  });

  test('detects update when remote build is greater than current build',
      () async {
    final service = UpdateService(
      latestManifestUrl: AppConfig.latestManifestUrl,
      client: _JsonClient({
        'version': '1.0.9',
        'build': AppConfig.currentBuild + 1,
        'forceUpdate': false,
        'minSupportedBuild': AppConfig.currentBuild,
        'downloads': {
          'android': 'https://example.com/app.apk',
          'windows': 'https://example.com/app.exe',
        },
      }),
    );
    addTearDown(service.dispose);

    final result = await service.checkForUpdate();

    expect(result.needsUpdate, isTrue);
    expect(result.forceUpdate, isFalse);
    expect(result.shouldPrompt, isTrue);
    expect(result.manifest.androidDownloadUrl, 'https://example.com/app.apk');
    expect(result.manifest.windowsDownloadUrl, 'https://example.com/app.exe');
  });

  test('forces update when forceUpdate is true or minSupportedBuild is higher',
      () async {
    final service = UpdateService(
      latestManifestUrl: AppConfig.latestManifestUrl,
      client: _JsonClient({
        'version': AppConfig.currentVersion,
        'build': AppConfig.currentBuild,
        'forceUpdate': true,
        'minSupportedBuild': AppConfig.currentBuild + 1,
        'downloads': {
          'android': 'https://example.com/app.apk',
          'windows': 'https://example.com/app.exe',
        },
      }),
    );
    addTearDown(service.dispose);

    final result = await service.checkForUpdate();

    expect(result.needsUpdate, isFalse);
    expect(result.forceUpdate, isTrue);
    expect(result.shouldPrompt, isTrue);
  });

  test('supports legacy snake_case latest.json fields', () async {
    final manifest = UpdateManifest.fromJson({
      'version': '1.0.9',
      'build': 109,
      'force_update': true,
      'minimum_build': 109,
      'changelog': ['兼容旧字段'],
      'apk_url': 'https://example.com/legacy.apk',
      'exe_url': 'https://example.com/legacy.exe',
    });

    expect(manifest.forceUpdate, isTrue);
    expect(manifest.minSupportedBuild, 109);
    expect(manifest.releaseNotes, ['兼容旧字段']);
    expect(manifest.androidDownloadUrl, 'https://example.com/legacy.apk');
    expect(manifest.windowsDownloadUrl, 'https://example.com/legacy.exe');
  });

  test('prefers camelCase downloads over legacy apk and exe URLs', () async {
    final manifest = UpdateManifest.fromJson({
      'version': '1.0.9',
      'build': 109,
      'forceUpdate': false,
      'minSupportedBuild': 108,
      'releaseNotes': ['兼容新字段'],
      'downloads': {
        'android': 'https://example.com/new.apk',
        'windows': 'https://example.com/new.exe',
      },
      'apk_url': 'https://example.com/legacy.apk',
      'exe_url': 'https://example.com/legacy.exe',
    });

    expect(manifest.forceUpdate, isFalse);
    expect(manifest.minSupportedBuild, 108);
    expect(manifest.releaseNotes, ['兼容新字段']);
    expect(manifest.androidDownloadUrl, 'https://example.com/new.apk');
    expect(manifest.windowsDownloadUrl, 'https://example.com/new.exe');
  });

  test('falls back to next latest.json endpoint with no-cache headers',
      () async {
    final client = _SequenceClient([
      _ClientReply.error(Exception('netlify unavailable')),
      _ClientReply.json({
        'version': '1.0.10',
        'build': AppConfig.currentBuild + 1,
        'forceUpdate': false,
        'minSupportedBuild': AppConfig.currentBuild,
        'downloads': {
          'android': 'https://example.com/app.apk',
          'windows': 'https://example.com/app.exe',
        },
      }),
    ]);
    final service = UpdateService(
      latestManifestUrl: AppConfig.latestManifestUrl,
      latestManifestUrls: const [
        'https://stately-sawine-1efd4d.netlify.app/releases/latest.json',
        'https://github.com/caizuan2/-AI/releases/latest/download/latest.json',
      ],
      client: client,
    );
    addTearDown(service.dispose);

    final result = await service.checkForUpdate();

    expect(result.needsUpdate, isTrue);
    expect(client.requests, hasLength(2));
    expect(
      client.requests.first.url.host,
      'stately-sawine-1efd4d.netlify.app',
    );
    expect(client.requests.first.url.queryParameters.containsKey('t'), isTrue);
    expect(client.requests.first.headers['Cache-Control'], 'no-cache');
    expect(client.requests.first.headers['Pragma'], 'no-cache');
    expect(client.requests.last.url.host, 'github.com');
  });

  test('throws friendly update exception when all endpoints fail', () async {
    final service = UpdateService(
      latestManifestUrl: AppConfig.latestManifestUrl,
      latestManifestUrls: const [
        'https://stately-sawine-1efd4d.netlify.app/releases/latest.json',
        'https://github.com/caizuan2/-AI/releases/latest/download/latest.json',
      ],
      client: _SequenceClient([
        _ClientReply.error(Exception('dns failed')),
        _ClientReply.status(500),
      ]),
    );
    addTearDown(service.dispose);

    expect(
      service.checkForUpdate(),
      throwsA(isA<UpdateFetchException>()),
    );
  });

  test('user-test update service is disabled outside user-test channel',
      () async {
    final service = TestUpdateService(
      channel: 'production',
      currentBuildNumber: 10,
      client: _JsonClient({
        'version': '1.0.10',
        'buildNumber': 11,
      }),
    );
    addTearDown(service.dispose);

    final result = await service.checkForUpdate();

    expect(result.enabled, isFalse);
    expect(result.shouldPrompt, isFalse);
    expect(result.manifest, isNull);
  });

  test(
      'user-test update service detects greater buildNumber with cache busting',
      () async {
    final client = _SequenceClient([
      _ClientReply.json({
        'appName': 'AI知识库助手',
        'channel': 'user-test',
        'platform': 'user',
        'version': '1.0.10',
        'buildNumber': 12,
        'buildTime': '2026-06-14T00:00:00Z',
        'apkUrl': 'https://example.com/test.apk',
        'windowsReleaseUrl': 'https://example.com/test-release.zip',
        'windowsDebugUrl': 'https://example.com/test-debug.zip',
        'changelog': ['测试更新'],
        'forceUpdate': false,
        'minSupportedBuildNumber': 12,
      }),
    ]);
    final service = TestUpdateService(
      manifestUrl:
          'https://github.com/example/repo/releases/download/user-test/version.json',
      channel: 'user-test',
      currentBuildNumber: 11,
      client: client,
    );
    addTearDown(service.dispose);

    final result = await service.checkForUpdate();

    expect(result.enabled, isTrue);
    expect(result.needsUpdate, isTrue);
    expect(result.forceUpdate, isTrue);
    expect(result.manifest?.buildNumber, 12);
    expect(result.manifest?.apkUrl, 'https://example.com/test.apk');
    expect(client.requests.single.url.queryParameters.containsKey('t'), isTrue);
    expect(
      client.requests.single.headers['User-Agent'],
      'ai-knowledge-user-test-updater',
    );
    expect(
      client.requests.single.headers['Accept'],
      'application/json, text/plain, application/vnd.github.raw, */*',
    );
    expect(result.manifest?.sourceUrl, contains('t='));
  });

  test('Android user-test update service tries GitHub Raw first', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    addTearDown(() => debugDefaultTargetPlatformOverride = null);

    final client = _SequenceClient([
      _ClientReply.json({
        'appName': 'AI知识库助手',
        'channel': 'user-test',
        'platform': 'user',
        'version': '1.0.10',
        'buildNumber': 116,
        'buildTime': '2026-06-15T00:00:00Z',
        'apkUrl': 'https://example.com/test.apk',
        'windowsReleaseUrl': 'https://example.com/test-release.zip',
        'windowsDebugUrl': 'https://example.com/test-debug.zip',
        'changelog': ['Android CDN 测试'],
        'forceUpdate': false,
      }),
    ]);
    final service = TestUpdateService(
      channel: 'user-test',
      currentBuildNumber: 115,
      client: client,
    );
    addTearDown(service.dispose);

    final result = await service.checkForUpdate();

    expect(result.needsUpdate, isTrue);
    expect(result.manifest?.buildNumber, 116);
    expect(client.requests, hasLength(4));
    expect(client.requests.first.url.host, 'raw.githubusercontent.com');
    expect(client.requests.first.url.queryParameters['raw'], '1');
    expect(client.requests.first.url.queryParameters.containsKey('t'), isTrue);
    expect(client.requests[1].url.host, 'api.github.com');
    expect(client.requests[2].url.host, 'github.com');
    expect(client.requests[3].url.host, 'cdn.jsdelivr.net');
  });

  test('Android chooses Raw 120 over stale jsDelivr 115', () async {
    final client = _SequenceClient([
      _ClientReply.json({
        'appName': 'AI知识库助手',
        'channel': 'user-test',
        'platform': 'user',
        'version': '1.0.10',
        'buildNumber': 120,
        'buildTime': '2026-06-15T00:01:00Z',
        'changelog': ['raw new'],
      }),
      _ClientReply.json({
        'appName': 'AI知识库助手',
        'channel': 'user-test',
        'platform': 'user',
        'version': '1.0.10',
        'buildNumber': 115,
        'buildTime': '2026-06-15T00:00:00Z',
        'changelog': ['cdn stale'],
      }),
    ]);
    final service = TestUpdateService(
      manifestUrls: const [
        'https://raw.githubusercontent.com/example/repo/branch/public/manifests/user-test/version.json',
        'https://cdn.jsdelivr.net/gh/example/repo@branch/public/manifests/user-test/version.json',
      ],
      channel: 'user-test',
      currentBuildNumber: 116,
      client: client,
    );
    addTearDown(service.dispose);

    final result = await service.checkForUpdate();

    expect(result.needsUpdate, isTrue);
    expect(result.manifest?.buildNumber, 120);
    expect(result.manifest?.sourceUrl, contains('raw.githubusercontent.com'));
    expect(result.manifest?.sourceBuildSummary, contains('GitHub Raw：120'));
    expect(result.manifest?.sourceBuildSummary,
        contains('jsDelivr CDN：115，缓存旧版本'));
    expect(client.requests, hasLength(2));
  });

  test('Android chooses Release asset 120 over stale jsDelivr 115', () async {
    final client = _SequenceClient([
      _ClientReply.json({
        'appName': 'AI知识库助手',
        'channel': 'user-test',
        'platform': 'user',
        'version': '1.0.10',
        'buildNumber': 120,
        'buildTime': '2026-06-15T00:01:00Z',
        'changelog': ['release new'],
      }),
      _ClientReply.json({
        'appName': 'AI知识库助手',
        'channel': 'user-test',
        'platform': 'user',
        'version': '1.0.10',
        'buildNumber': 115,
        'buildTime': '2026-06-15T00:00:00Z',
        'changelog': ['cdn stale'],
      }),
    ]);
    final service = TestUpdateService(
      manifestUrls: const [
        'https://github.com/example/repo/releases/download/user-test/version.json',
        'https://cdn.jsdelivr.net/gh/example/repo@branch/public/manifests/user-test/version.json',
      ],
      channel: 'user-test',
      currentBuildNumber: 116,
      client: client,
    );
    addTearDown(service.dispose);

    final result = await service.checkForUpdate();

    expect(result.needsUpdate, isTrue);
    expect(result.manifest?.buildNumber, 120);
    expect(result.manifest?.sourceUrl, contains('github.com'));
    expect(result.manifest?.sourceBuildSummary, contains('Release asset：120'));
    expect(result.manifest?.sourceBuildSummary,
        contains('jsDelivr CDN：115，缓存旧版本'));
    expect(client.requests, hasLength(2));
  });

  test('Android does not prompt when only jsDelivr 115 is below local 116',
      () async {
    final service = TestUpdateService(
      manifestUrls: const [
        'https://cdn.jsdelivr.net/gh/example/repo@branch/public/manifests/user-test/version.json',
      ],
      channel: 'user-test',
      currentBuildNumber: 116,
      client: _SequenceClient([
        _ClientReply.json({
          'appName': 'AI知识库助手',
          'channel': 'user-test',
          'platform': 'user',
          'version': '1.0.10',
          'buildNumber': 115,
          'buildTime': '2026-06-15T00:00:00Z',
        }),
      ]),
    );
    addTearDown(service.dispose);

    final result = await service.checkForUpdate();

    expect(result.needsUpdate, isFalse);
    expect(result.forceUpdate, isFalse);
    expect(result.shouldPrompt, isFalse);
    expect(result.manifest?.buildNumber, 115);
    expect(result.manifest?.sourceBuildSummary, contains('jsDelivr CDN：115'));
  });

  test('user-test force update when minSupportedBuildNumber is above local',
      () async {
    final service = TestUpdateService(
      manifestUrls: const [
        'https://github.com/example/repo/releases/download/user-test/version.json',
      ],
      channel: 'user-test',
      currentBuildNumber: 122,
      client: _SequenceClient([
        _ClientReply.json({
          'appName': 'AI知识库助手',
          'channel': 'user-test',
          'platform': 'user',
          'version': '1.0.10',
          'buildNumber': 122,
          'minSupportedBuildNumber': 123,
          'forceUpdate': false,
        }),
      ]),
    );
    addTearDown(service.dispose);

    final result = await service.checkForUpdate();

    expect(result.needsUpdate, isFalse);
    expect(result.forceUpdate, isTrue);
    expect(result.shouldPrompt, isTrue);
    expect(result.manifest?.minSupportedBuildNumber, 123);
  });

  test('user-test does not force update when remote equals local', () async {
    final service = TestUpdateService(
      manifestUrls: const [
        'https://github.com/example/repo/releases/download/user-test/version.json',
      ],
      channel: 'user-test',
      currentBuildNumber: 123,
      client: _SequenceClient([
        _ClientReply.json({
          'appName': 'AI知识库助手',
          'channel': 'user-test',
          'platform': 'user',
          'version': '1.0.10',
          'buildNumber': 123,
          'minSupportedBuildNumber': 123,
          'forceUpdate': true,
        }),
      ]),
    );
    addTearDown(service.dispose);

    final result = await service.checkForUpdate();

    expect(result.needsUpdate, isFalse);
    expect(result.forceUpdate, isFalse);
    expect(result.shouldPrompt, isFalse);
  });

  test('user-test does not roll back when remote is below local', () async {
    final service = TestUpdateService(
      manifestUrls: const [
        'https://github.com/example/repo/releases/download/user-test/version.json',
      ],
      channel: 'user-test',
      currentBuildNumber: 124,
      client: _SequenceClient([
        _ClientReply.json({
          'appName': 'AI知识库助手',
          'channel': 'user-test',
          'platform': 'user',
          'version': '1.0.10',
          'buildNumber': 123,
          'minSupportedBuildNumber': 123,
          'forceUpdate': true,
        }),
      ]),
    );
    addTearDown(service.dispose);

    final result = await service.checkForUpdate();

    expect(result.needsUpdate, isFalse);
    expect(result.forceUpdate, isFalse);
    expect(result.shouldPrompt, isFalse);
  });

  test('user-test manifest parses mirrors and release page', () {
    final manifest = TestUpdateManifest.fromJson({
      'version': '1.0.10',
      'buildNumber': 123,
      'channel': 'user-test',
      'releasePageUrl': 'https://example.com/release',
      'apkUrl': 'https://example.com/app.apk',
      'windowsReleaseUrl': 'https://example.com/windows.zip',
      'apkMirrors': [
        'https://example.com/app.apk',
        'https://mirror.example.com/app.apk',
      ],
      'windowsReleaseMirrors': ['https://mirror.example.com/windows.zip'],
      'manifestMirrors': ['https://example.com/version.json'],
      'minSupportedBuildNumber': 123,
      'forceUpdate': true,
    });

    expect(manifest.releasePageUrl, 'https://example.com/release');
    expect(manifest.apkDownloadCandidates, [
      'https://example.com/app.apk',
      'https://mirror.example.com/app.apk',
    ]);
    expect(manifest.windowsReleaseDownloadCandidates, [
      'https://example.com/windows.zip',
      'https://mirror.example.com/windows.zip',
    ]);
    expect(manifest.manifestMirrors, ['https://example.com/version.json']);
    expect(manifest.minSupportedBuildNumber, 123);
    expect(manifest.forceUpdate, isTrue);
  });

  test('user-test service reads all sources before choosing max build',
      () async {
    final client = _SequenceClient([
      _ClientReply.json({
        'appName': 'AI知识库助手',
        'channel': 'user-test',
        'version': '1.0.10',
        'buildNumber': 117,
      }),
      _ClientReply.json({
        'appName': 'AI知识库助手',
        'channel': 'user-test',
        'version': '1.0.10',
        'buildNumber': 120,
      }),
    ]);
    final service = TestUpdateService(
      manifestUrls: const [
        'https://raw.githubusercontent.com/example/repo/branch/public/manifests/user-test/version.json',
        'https://github.com/example/repo/releases/download/user-test/version.json',
      ],
      channel: 'user-test',
      currentBuildNumber: 116,
      client: client,
    );
    addTearDown(service.dispose);

    final result = await service.checkForUpdate();

    expect(result.needsUpdate, isTrue);
    expect(result.manifest?.buildNumber, 120);
    expect(result.manifest?.sourceUrl, contains('github.com'));
    expect(client.requests, hasLength(2));
  });

  test('Android falls back from raw HTML to GitHub API raw manifest', () async {
    final client = _SequenceClient([
      _ClientReply.status(503),
      _ClientReply.html(),
      _ClientReply.json({
        'appName': 'AI知识库助手',
        'channel': 'user-test',
        'platform': 'user',
        'version': '1.0.10',
        'buildNumber': 116,
        'buildTime': '2026-06-15T00:00:00Z',
        'apkUrl': 'https://example.com/test.apk',
        'windowsReleaseUrl': 'https://example.com/test-release.zip',
        'windowsDebugUrl': 'https://example.com/test-debug.zip',
        'changelog': ['GitHub API fallback'],
        'forceUpdate': false,
      }),
    ]);
    final service = TestUpdateService(
      manifestUrls: const [
        'https://cdn.jsdelivr.net/gh/example/repo@branch/public/manifests/user-test/version.json',
        'https://raw.githubusercontent.com/example/repo/branch/public/manifests/user-test/version.json',
        'https://api.github.com/repos/example/repo/contents/public/manifests/user-test/version.json?ref=branch',
      ],
      channel: 'user-test',
      currentBuildNumber: 115,
      client: client,
    );
    addTearDown(service.dispose);

    final result = await service.checkForUpdate();

    expect(result.needsUpdate, isTrue);
    expect(result.manifest?.buildNumber, 116);
    expect(client.requests, hasLength(3));
    expect(client.requests[2].url.host, 'api.github.com');
    expect(
      client.requests[2].headers['Accept'],
      'application/vnd.github.raw, application/json, text/plain, */*',
    );
  });

  test('Android ignores stale jsDelivr manifest when raw has newer build',
      () async {
    final client = _SequenceClient([
      _ClientReply.json({
        'appName': 'AI知识库助手',
        'channel': 'user-test',
        'platform': 'user',
        'version': '1.0.10',
        'buildNumber': 115,
        'buildTime': '2026-06-15T00:00:00Z',
        'apkUrl': 'https://example.com/test.apk',
        'windowsReleaseUrl': 'https://example.com/test-release.zip',
        'windowsDebugUrl': 'https://example.com/test-debug.zip',
        'changelog': ['stale CDN'],
        'forceUpdate': false,
      }),
      _ClientReply.json({
        'appName': 'AI知识库助手',
        'channel': 'user-test',
        'platform': 'user',
        'version': '1.0.10',
        'buildNumber': 116,
        'buildTime': '2026-06-15T00:01:00Z',
        'apkUrl': 'https://example.com/test.apk',
        'windowsReleaseUrl': 'https://example.com/test-release.zip',
        'windowsDebugUrl': 'https://example.com/test-debug.zip',
        'changelog': ['new raw'],
        'forceUpdate': false,
      }),
    ]);
    final service = TestUpdateService(
      manifestUrls: const [
        'https://cdn.jsdelivr.net/gh/example/repo@branch/public/manifests/user-test/version.json',
        'https://raw.githubusercontent.com/example/repo/branch/public/manifests/user-test/version.json',
      ],
      channel: 'user-test',
      currentBuildNumber: 115,
      client: client,
    );
    addTearDown(service.dispose);

    final result = await service.checkForUpdate();

    expect(result.needsUpdate, isTrue);
    expect(result.manifest?.buildNumber, 116);
    expect(client.requests, hasLength(2));
    expect(result.manifest?.sourceUrl, contains('raw.githubusercontent.com'));
  });

  test('user-test service returns highest available build when no update',
      () async {
    final client = _SequenceClient([
      _ClientReply.json({
        'appName': 'AI知识库助手',
        'channel': 'user-test',
        'platform': 'user',
        'version': '1.0.10',
        'buildNumber': 115,
      }),
      _ClientReply.json({
        'appName': 'AI知识库助手',
        'channel': 'user-test',
        'platform': 'user',
        'version': '1.0.10',
        'buildNumber': 116,
      }),
    ]);
    final service = TestUpdateService(
      manifestUrls: const [
        'https://cdn.jsdelivr.net/gh/example/repo@branch/public/manifests/user-test/version.json',
        'https://raw.githubusercontent.com/example/repo/branch/public/manifests/user-test/version.json',
      ],
      channel: 'user-test',
      currentBuildNumber: 116,
      client: client,
    );
    addTearDown(service.dispose);

    final result = await service.checkForUpdate();

    expect(result.needsUpdate, isFalse);
    expect(result.manifest?.buildNumber, 116);
    expect(client.requests, hasLength(2));
  });

  test('Android all manifest failures expose detail without fake build 110',
      () async {
    final service = TestUpdateService(
      manifestUrls: const [
        'https://cdn.jsdelivr.net/gh/example/repo@branch/public/manifests/user-test/version.json',
        'https://raw.githubusercontent.com/example/repo/branch/public/manifests/user-test/version.json',
      ],
      channel: 'user-test',
      currentVersion: '1.0.10',
      currentBuildNumber: 115,
      client: _SequenceClient([
        _ClientReply.status(503),
        _ClientReply.html(),
      ]),
    );
    addTearDown(service.dispose);

    try {
      await service.checkForUpdate();
      fail('Expected TestUpdateFetchException');
    } on TestUpdateFetchException catch (error) {
      final detail = error.toString();
      expect(error.attemptedCount, 2);
      expect(detail, contains('local buildNumber: 115'));
      expect(detail, contains('status=503'));
      expect(detail, contains('远程版本文件返回 HTML'));
      expect(detail, isNot(contains('远程测试版：1.0.10 (110)')));
    }
  });

  test('user-test update service falls back from raw manifest to release asset',
      () async {
    final client = _SequenceClient([
      _ClientReply.html(),
      _ClientReply.json({
        'appName': 'AI知识库助手',
        'channel': 'user-test',
        'platform': 'user',
        'version': '1.0.10',
        'buildNumber': 114,
        'buildTime': '2026-06-15T00:00:00Z',
        'apkUrl': 'https://example.com/test.apk',
        'windowsReleaseUrl': 'https://example.com/test-release.zip',
        'windowsDebugUrl': 'https://example.com/test-debug.zip',
        'changelog': ['测试更新'],
        'forceUpdate': false,
      }),
    ]);
    final service = TestUpdateService(
      manifestUrls: const [
        'https://raw.githubusercontent.com/example/repo/main/public/manifests/user-test/version.json',
        'https://github.com/example/repo/releases/download/user-test/version.json',
      ],
      channel: 'user-test',
      currentBuildNumber: 113,
      client: client,
    );
    addTearDown(service.dispose);

    final result = await service.checkForUpdate();

    expect(result.needsUpdate, isTrue);
    expect(result.manifest?.buildNumber, 114);
    expect(client.requests, hasLength(2));
    expect(client.requests.first.url.host, 'raw.githubusercontent.com');
    expect(client.requests.last.url.host, 'github.com');
  });

  test('user-test update service parses UTF-8 BOM release asset JSON',
      () async {
    final service = TestUpdateService(
      manifestUrl:
          'https://github.com/example/repo/releases/download/user-test/version.json',
      channel: 'user-test',
      currentBuildNumber: 111,
      client: _RawClient(
        utf8.encode(
          '\uFEFF{"version":"1.0.10","buildNumber":112,"channel":"user-test"}',
        ),
      ),
    );
    addTearDown(service.dispose);

    final result = await service.checkForUpdate();

    expect(result.needsUpdate, isTrue);
    expect(result.manifest?.apkUrl, AppConfig.userTestApkUrl);
    expect(
      result.manifest?.windowsReleaseUrl,
      AppConfig.userTestWindowsReleaseUrl,
    );
  });

  test('user-test update service rejects remote HTML as non JSON', () async {
    final service = TestUpdateService(
      manifestUrl:
          'https://github.com/example/repo/releases/download/user-test/version.json',
      channel: 'user-test',
      currentBuildNumber: 111,
      client: _RawClient(utf8.encode('<html>not found</html>')),
    );
    addTearDown(service.dispose);

    expect(
      service.checkForUpdate(),
      throwsA(isA<TestUpdateFetchException>()),
    );
  });

  test('user-test manifest tolerates string changelog and default links', () {
    final manifest = TestUpdateManifest.fromJson({
      'version': '1.0.10',
      'buildNumber': 112,
      'channel': 'user-test',
      'changelog': '单条更新内容',
    });

    expect(manifest.buildTime, '未知时间');
    expect(manifest.changelog, ['单条更新内容']);
    expect(manifest.apkUrl, AppConfig.userTestApkUrl);
    expect(manifest.windowsDebugUrl, AppConfig.userTestWindowsDebugUrl);
  });

  testWidgets('force update dialog cannot be dismissed with later button',
      (tester) async {
    final manifest = UpdateManifest.fromJson({
      'version': '1.0.9',
      'build': 109,
      'forceUpdate': true,
      'minSupportedBuild': 109,
      'releaseNotes': ['必须升级'],
      'downloads': {
        'android': 'https://example.com/app.apk',
        'windows': 'https://example.com/app.exe',
      },
    });

    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) {
            return FilledButton(
              onPressed: () => showUpdateDialog(
                context,
                manifest: manifest,
                force: true,
              ),
              child: const Text('show'),
            );
          },
        ),
      ),
    );

    await tester.tap(find.text('show'));
    await tester.pumpAndSettle();

    expect(find.text('发现新版本'), findsOneWidget);
    expect(find.text('稍后再说'), findsNothing);
    expect(find.text('立即更新'), findsOneWidget);

    await tester.tapAt(const Offset(4, 4));
    await tester.pumpAndSettle();
    expect(find.text('发现新版本'), findsOneWidget);

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('发现新版本'), findsOneWidget);
  });
}

class _JsonClient extends http.BaseClient {
  _JsonClient(this.body);

  final Map<String, Object?> body;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final bytes = utf8.encode(jsonEncode(body));
    return http.StreamedResponse(
      Stream<List<int>>.value(bytes),
      200,
      headers: {'content-type': 'application/json'},
    );
  }
}

class _RawClient extends http.BaseClient {
  _RawClient(this.bytes);

  final List<int> bytes;
  final List<http.BaseRequest> requests = [];

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    requests.add(request);
    return http.StreamedResponse(
      Stream<List<int>>.value(bytes),
      200,
      headers: {'content-type': 'application/octet-stream'},
    );
  }
}

class _ClientReply {
  const _ClientReply._({
    this.body,
    this.rawBody,
    this.error,
    this.statusCode = 200,
  });

  factory _ClientReply.json(Map<String, Object?> body) {
    return _ClientReply._(body: body);
  }

  factory _ClientReply.error(Object error) {
    return _ClientReply._(error: error);
  }

  factory _ClientReply.status(int statusCode) {
    return _ClientReply._(statusCode: statusCode);
  }

  factory _ClientReply.html() {
    return const _ClientReply._(rawBody: '<html>not json</html>');
  }

  final Map<String, Object?>? body;
  final String? rawBody;
  final Object? error;
  final int statusCode;
}

class _SequenceClient extends http.BaseClient {
  _SequenceClient(this.replies);

  final List<_ClientReply> replies;
  final List<http.BaseRequest> requests = [];
  int _index = 0;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    requests.add(request);
    final currentIndex = _index < replies.length ? _index : replies.length - 1;
    final reply = replies[currentIndex];
    _index += 1;

    if (reply.error != null) {
      throw reply.error!;
    }

    final body = reply.rawBody ?? jsonEncode(reply.body ?? <String, Object?>{});
    final bytes = utf8.encode(body);
    return http.StreamedResponse(
      Stream<List<int>>.value(bytes),
      reply.statusCode,
      headers: {
        'content-type':
            reply.rawBody == null ? 'application/json' : 'text/html',
      },
    );
  }
}
