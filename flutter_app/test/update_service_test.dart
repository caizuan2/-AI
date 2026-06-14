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
