import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../../core/config/app_config.dart';
import 'test_update_manifest.dart';

class TestUpdateCheckResult {
  const TestUpdateCheckResult({
    required this.manifest,
    required this.needsUpdate,
    required this.forceUpdate,
    required this.enabled,
  });

  final TestUpdateManifest? manifest;
  final bool needsUpdate;
  final bool forceUpdate;
  final bool enabled;

  bool get shouldPrompt => enabled && (needsUpdate || forceUpdate);
}

class TestUpdateActionResult {
  const TestUpdateActionResult({
    required this.title,
    required this.message,
    this.filePath,
  });

  final String title;
  final String message;
  final String? filePath;
}

class TestUpdateService {
  TestUpdateService({
    String? manifestUrl,
    List<String>? manifestUrls,
    this.channel = AppConfig.appChannel,
    this.currentVersion = AppConfig.currentVersion,
    this.currentBuildNumber = AppConfig.currentTestBuildNumber,
    http.Client? client,
  })  : manifestUrls = _resolveManifestUrls(manifestUrl, manifestUrls),
        manifestUrl = _resolveManifestUrls(manifestUrl, manifestUrls).first,
        _client = client ?? http.Client();

  final String manifestUrl;
  final List<String> manifestUrls;
  final String channel;
  final String currentVersion;
  final int currentBuildNumber;
  final http.Client _client;

  static const supportedChannel = 'user-test';
  static const Duration _requestTimeout = Duration(seconds: 10);
  static const Map<String, String> _headers = {
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'User-Agent': 'ai-knowledge-user-test-updater',
    'Accept': 'application/json, text/plain, application/vnd.github.raw, */*',
  };

  bool get enabled => channel == supportedChannel;

  Future<TestUpdateManifest> fetchLatest() async {
    final errors = <String>[];
    final successfulManifests = <TestUpdateManifest>[];
    for (final url in manifestUrls) {
      try {
        final manifest = await _fetchManifest(url);
        successfulManifests.add(manifest);
      } catch (error, stackTrace) {
        final detail =
            '$url -> ${error.runtimeType}: $error\nstack=$stackTrace';
        errors.add(detail);
        debugPrint('User test manifest endpoint failed: $detail');
      }
    }

    if (successfulManifests.isNotEmpty) {
      final bestManifest = _selectBestManifest(successfulManifests);
      final summary = _sourceBuildSummary(
        successfulManifests,
        errors,
        selected: bestManifest,
      );
      if (bestManifest.buildNumber <= currentBuildNumber) {
        debugPrint(
          'User test manifest max build ${bestManifest.buildNumber} is not '
          'newer than local $currentBuildNumber. Source summary: $summary',
        );
      }
      return bestManifest.withSourceBuildSummary(summary);
    }

    throw TestUpdateFetchException(
      '所有测试版 version.json 地址均读取失败。',
      failures: errors,
      attemptedCount: manifestUrls.length,
      platform: _platformLabel,
      appVersion: currentVersion,
      buildNumber: currentBuildNumber,
      timestamp: DateTime.now().toIso8601String(),
    );
  }

  Future<TestUpdateManifest> _fetchManifest(String url) async {
    final requestUri = _cacheBustingUri(url);
    final response = await _client
        .get(requestUri, headers: _headersFor(url))
        .timeout(_requestTimeout);
    final body = _decodeBody(response.bodyBytes);
    final preview = _bodyPreview(body);
    final contentType = response.headers['content-type'] ?? 'unknown';

    debugPrint(
      'User test manifest response: url=$requestUri '
      'status=${response.statusCode} contentType=$contentType '
      'bodyPreview=$preview',
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw TestUpdateFetchException(
        'version.json 请求失败：status=${response.statusCode}, '
        'content-type=$contentType, url=$requestUri, body=$preview',
      );
    }

    final trimmed = body.trimLeft();
    if (trimmed.isEmpty) {
      throw const TestUpdateFetchException('远程版本文件为空。');
    }
    if (trimmed.startsWith('<')) {
      throw const TestUpdateFetchException(
        '远程版本文件返回 HTML，不是 JSON。',
      );
    }

    Object? json;
    try {
      json = jsonDecode(trimmed);
    } catch (error) {
      throw TestUpdateFetchException(
        'version.json JSON 解析失败。',
        cause: error,
      );
    }
    if (json is! Map) {
      throw const TestUpdateFetchException('version.json must be an object.');
    }

    try {
      return TestUpdateManifest.fromJson(
        json.map((key, value) => MapEntry(key?.toString() ?? '', value)),
        sourceUrl: requestUri.toString(),
      );
    } catch (error) {
      throw TestUpdateFetchException('version.json 字段解析失败。', cause: error);
    }
  }

  Future<TestUpdateCheckResult> checkForUpdate() async {
    if (!enabled) {
      return const TestUpdateCheckResult(
        manifest: null,
        needsUpdate: false,
        forceUpdate: false,
        enabled: false,
      );
    }

    try {
      final manifest = await fetchLatest();
      final needsUpdate = manifest.buildNumber > currentBuildNumber;
      final belowMinimum = manifest.minSupportedBuildNumber > 0 &&
          currentBuildNumber < manifest.minSupportedBuildNumber;
      final forceUpdate = belowMinimum || (needsUpdate && manifest.forceUpdate);
      return TestUpdateCheckResult(
        manifest: manifest,
        needsUpdate: needsUpdate,
        forceUpdate: forceUpdate,
        enabled: true,
      );
    } catch (error) {
      debugPrint('User test update check failed: $error');
      if (error is TestUpdateFetchException) {
        rethrow;
      }
      throw TestUpdateFetchException('Failed to fetch user-test version.json.',
          cause: error);
    }
  }

  void dispose() {
    _client.close();
  }

  Uri _cacheBustingUri(String url) {
    final uri = Uri.parse(url);
    final query = Map<String, String>.from(uri.queryParameters);
    if (uri.host == 'raw.githubusercontent.com') {
      query['raw'] = '1';
    }
    query['t'] = DateTime.now().millisecondsSinceEpoch.toString();
    return uri.replace(queryParameters: query);
  }

  Map<String, String> _headersFor(String url) {
    final headers = Map<String, String>.from(_headers);
    final uri = Uri.tryParse(url);
    if (uri?.host == 'api.github.com') {
      headers['Accept'] =
          'application/vnd.github.raw, application/json, text/plain, */*';
    }
    return headers;
  }

  String _decodeBody(List<int> bytes) {
    var body = utf8.decode(bytes, allowMalformed: true);
    if (body.startsWith('\uFEFF')) {
      body = body.substring(1);
    }
    return body;
  }

  String _bodyPreview(String body) {
    final compact = body.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (compact.length <= 200) {
      return compact;
    }
    return '${compact.substring(0, 200)}...';
  }

  TestUpdateManifest _selectBestManifest(List<TestUpdateManifest> manifests) {
    var best = manifests.first;
    for (final manifest in manifests.skip(1)) {
      if (manifest.buildNumber > best.buildNumber) {
        best = manifest;
      }
    }
    return best;
  }

  String _sourceBuildSummary(
    List<TestUpdateManifest> manifests,
    List<String> failures, {
    required TestUpdateManifest selected,
  }) {
    final bestBuild = selected.buildNumber;
    final lines = <String>[];
    for (final manifest in manifests) {
      final label = _sourceLabel(manifest.sourceUrl);
      final staleHint = manifest.buildNumber < bestBuild ? '，缓存旧版本' : '';
      final selectedHint =
          manifest.sourceUrl == selected.sourceUrl ? '，已选择' : '';
      lines.add('$label：${manifest.buildNumber}$staleHint$selectedHint');
    }
    for (final failure in failures) {
      final url = failure.split(' -> ').first;
      lines.add('${_sourceLabel(url)}：读取失败');
    }
    return lines.join('\n');
  }

  String _sourceLabel(String url) {
    final uri = Uri.tryParse(url);
    final host = uri?.host ?? '';
    if (host == 'raw.githubusercontent.com') {
      return 'GitHub Raw';
    }
    if (host == 'api.github.com') {
      return 'GitHub API';
    }
    if (host == 'github.com') {
      return 'Release asset';
    }
    if (host == 'cdn.jsdelivr.net') {
      return 'jsDelivr CDN';
    }
    return url;
  }

  static List<String> _resolveManifestUrls(
    String? manifestUrl,
    List<String>? manifestUrls,
  ) {
    final urls = manifestUrls ??
        (manifestUrl == null
            ? _defaultManifestUrlsForPlatform()
            : [manifestUrl]);
    final normalized = <String>[];
    for (final url in urls) {
      final trimmed = url.trim();
      if (trimmed.isNotEmpty && !normalized.contains(trimmed)) {
        normalized.add(trimmed);
      }
    }
    if (normalized.isEmpty) {
      return [AppConfig.userTestManifestUrl];
    }
    return List.unmodifiable(normalized);
  }

  static List<String> _defaultManifestUrlsForPlatform() {
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      return AppConfig.userTestAndroidManifestUrls;
    }
    return AppConfig.userTestManifestUrls;
  }

  String get _platformLabel {
    if (kIsWeb) {
      return 'web';
    }
    return defaultTargetPlatform.name;
  }
}

class TestUpdateFetchException implements Exception {
  const TestUpdateFetchException(
    this.message, {
    this.cause,
    this.failures = const [],
    this.attemptedCount,
    this.platform,
    this.appVersion,
    this.buildNumber,
    this.timestamp,
  });

  final String message;
  final Object? cause;
  final List<String> failures;
  final int? attemptedCount;
  final String? platform;
  final String? appVersion;
  final int? buildNumber;
  final String? timestamp;

  static const userMessage = '检查测试版更新失败，请检查网络后重试。';

  @override
  String toString() {
    final buffer = StringBuffer(message);
    if (appVersion != null || buildNumber != null) {
      buffer.write('\napp version: ${appVersion ?? 'unknown'}');
      buffer.write('\nlocal buildNumber: ${buildNumber ?? 'unknown'}');
    }
    if (platform != null) {
      buffer.write('\nplatform: $platform');
    }
    if (attemptedCount != null) {
      buffer.write('\nattempted urls: $attemptedCount');
    }
    if (timestamp != null) {
      buffer.write('\ntimestamp: $timestamp');
    }
    if (cause != null) {
      buffer.write('\ncause: ${cause.runtimeType}: $cause');
    }
    if (failures.isNotEmpty) {
      buffer.write('\nfailures:\n${failures.join('\n---\n')}');
    }
    return buffer.toString();
  }
}
