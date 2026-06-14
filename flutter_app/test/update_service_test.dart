import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'package:ai_knowledge_flutter_app/core/config/app_config.dart';
import 'package:ai_knowledge_flutter_app/modules/update/update_dialog.dart';
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

class _ClientReply {
  const _ClientReply._({
    this.body,
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

  final Map<String, Object?>? body;
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

    final body = reply.body ?? <String, Object?>{};
    final bytes = utf8.encode(jsonEncode(body));
    return http.StreamedResponse(
      Stream<List<int>>.value(bytes),
      reply.statusCode,
      headers: {'content-type': 'application/json'},
    );
  }
}
