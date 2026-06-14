import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../../core/config/app_config.dart';
import '../../core/utils/version_utils.dart';
import 'update_manifest.dart';

class UpdateCheckResult {
  const UpdateCheckResult({
    required this.manifest,
    required this.needsUpdate,
    required this.forceUpdate,
  });

  final UpdateManifest manifest;
  final bool needsUpdate;
  final bool forceUpdate;

  bool get shouldPrompt => needsUpdate || forceUpdate;
}

class UpdateService {
  UpdateService({
    required this.latestManifestUrl,
    List<String>? latestManifestUrls,
    this.mockMode = false,
    http.Client? client,
  })  : latestManifestUrls = latestManifestUrls ??
            <String>[
              latestManifestUrl,
            ],
        _client = client ?? http.Client();

  final String latestManifestUrl;
  final List<String> latestManifestUrls;
  final bool mockMode;
  final http.Client _client;

  static const Duration _requestTimeout = Duration(seconds: 7);
  static const Map<String, String> _noCacheHeaders = {
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
  };

  Future<UpdateManifest> fetchLatest() async {
    if (mockMode) {
      await Future<void>.delayed(const Duration(milliseconds: 300));
      return UpdateManifest.fromJson({
        'version': AppConfig.currentVersion,
        'build': AppConfig.currentBuild,
        'forceUpdate': false,
        'minSupportedBuild': AppConfig.currentBuild,
        'releaseNotes': ['当前已是最新版本。'],
        'downloads': {
          'android':
              'https://github.com/caizuan2/-AI/releases/download/1.0.8/ai-knowledge-chat-latest.apk',
          'windows':
              'https://github.com/caizuan2/-AI/releases/download/1.0.8/ai-knowledge-chat-latest.exe',
        },
      });
    }

    Object? lastError;
    for (final url in _effectiveManifestUrls()) {
      try {
        final response = await _client
            .get(_cacheBustingUri(url), headers: _noCacheHeaders)
            .timeout(_requestTimeout);
        if (response.statusCode < 200 || response.statusCode >= 300) {
          throw UpdateFetchException(
            'latest.json request failed with status ${response.statusCode}',
          );
        }

        final json = jsonDecode(response.body);
        if (json is! Map) {
          throw const UpdateFetchException(
            'latest.json must be a JSON object.',
          );
        }

        return UpdateManifest.fromJson(
          json.map((key, value) => MapEntry(key?.toString() ?? '', value)),
        );
      } catch (error) {
        lastError = error;
        debugPrint('Update manifest fetch failed for $url: $error');
      }
    }

    throw UpdateFetchException(
      'All latest.json endpoints failed.',
      cause: lastError,
    );
  }

  Future<UpdateCheckResult> checkForUpdate() async {
    final manifest = await fetchLatest();
    final needsUpdate = isRemoteNewer(
      localVersion: AppConfig.currentVersion,
      localBuild: AppConfig.currentBuild,
      remoteVersion: manifest.version,
      remoteBuild: manifest.build,
    );
    final forceUpdate = manifest.forceUpdate ||
        AppConfig.currentBuild < manifest.minSupportedBuild;

    return UpdateCheckResult(
      manifest: manifest,
      needsUpdate: needsUpdate,
      forceUpdate: forceUpdate,
    );
  }

  void dispose() {
    _client.close();
  }

  List<String> _effectiveManifestUrls() {
    return {
      ...latestManifestUrls,
      latestManifestUrl,
    }.where((url) => url.trim().isNotEmpty).toList(growable: false);
  }

  Uri _cacheBustingUri(String url) {
    final uri = Uri.parse(url);
    final query = Map<String, String>.from(uri.queryParameters);
    query['t'] = DateTime.now().millisecondsSinceEpoch.toString();
    return uri.replace(queryParameters: query);
  }
}

class UpdateFetchException implements Exception {
  const UpdateFetchException(this.message, {this.cause});

  final String message;
  final Object? cause;

  static const userTitle = '检查更新失败';
  static const userMessage = '当前网络无法连接更新服务器，请检查网络后重试。';
  static const userHint = '如果一直失败，请前往下载页手动下载最新版本。';

  @override
  String toString() {
    if (cause == null) {
      return message;
    }
    return '$message Cause: $cause';
  }
}
