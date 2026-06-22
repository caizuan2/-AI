import 'package:flutter/foundation.dart';

import '../../core/config/app_config.dart';

class TestUpdateManifest {
  const TestUpdateManifest({
    required this.appName,
    required this.channel,
    required this.platform,
    required this.version,
    required this.buildNumber,
    required this.buildTime,
    required this.apkUrl,
    required this.windowsReleaseUrl,
    required this.windowsDebugUrl,
    required this.releasePageUrl,
    required this.apkMirrors,
    required this.windowsReleaseMirrors,
    required this.manifestMirrors,
    required this.changelog,
    required this.forceUpdate,
    required this.minSupportedBuildNumber,
    this.sourceUrl = '',
    this.sourceBuildSummary = '',
  });

  final String appName;
  final String channel;
  final String platform;
  final String version;
  final int buildNumber;
  final String buildTime;
  final String apkUrl;
  final String windowsReleaseUrl;
  final String windowsDebugUrl;
  final String releasePageUrl;
  final List<String> apkMirrors;
  final List<String> windowsReleaseMirrors;
  final List<String> manifestMirrors;
  final List<String> changelog;
  final bool forceUpdate;
  final int minSupportedBuildNumber;
  final String sourceUrl;
  final String sourceBuildSummary;

  TestUpdateManifest withSourceBuildSummary(String summary) {
    return TestUpdateManifest(
      appName: appName,
      channel: channel,
      platform: platform,
      version: version,
      buildNumber: buildNumber,
      buildTime: buildTime,
      apkUrl: apkUrl,
      windowsReleaseUrl: windowsReleaseUrl,
      windowsDebugUrl: windowsDebugUrl,
      releasePageUrl: releasePageUrl,
      apkMirrors: apkMirrors,
      windowsReleaseMirrors: windowsReleaseMirrors,
      manifestMirrors: manifestMirrors,
      changelog: changelog,
      forceUpdate: forceUpdate,
      minSupportedBuildNumber: minSupportedBuildNumber,
      sourceUrl: sourceUrl,
      sourceBuildSummary: summary,
    );
  }

  String get currentPlatformDownloadUrl {
    if (kIsWeb) {
      return windowsReleaseUrl.isNotEmpty ? windowsReleaseUrl : apkUrl;
    }

    return switch (defaultTargetPlatform) {
      TargetPlatform.android => apkUrl,
      TargetPlatform.windows => windowsReleaseUrl,
      _ => apkUrl.isNotEmpty ? apkUrl : windowsReleaseUrl,
    };
  }

  factory TestUpdateManifest.fromJson(
    Map<String, dynamic> json, {
    String sourceUrl = '',
  }) {
    final rawPlatform = json['platform'];
    final version = _stringValue(json['version']);
    final buildNumber = _intValue(
      json['buildNumber'] ?? json['build_number'] ?? json['build'],
    );
    final channel = _stringValue(json['channel']);
    if (version.isEmpty) {
      throw const FormatException('version.json 缺少必填字段：version');
    }
    if (buildNumber <= 0) {
      throw const FormatException('version.json 缺少有效 buildNumber');
    }
    if (channel.isEmpty) {
      throw const FormatException('version.json 缺少必填字段：channel');
    }

    return TestUpdateManifest(
      appName: _stringValue(json['appName'], fallback: 'AI知识库助手'),
      channel: channel,
      platform: rawPlatform is List
          ? rawPlatform.map((item) => item.toString()).join(',')
          : _stringValue(rawPlatform, fallback: 'user'),
      version: version,
      buildNumber: buildNumber,
      buildTime: _stringValue(
        json['buildTime'] ?? json['build_time'],
        fallback: '未知时间',
      ),
      apkUrl: _stringValue(
        json['apkUrl'] ?? json['apk_url'],
        fallback: AppConfig.userTestApkUrl,
      ),
      windowsReleaseUrl: _stringValue(
        json['windowsReleaseUrl'] ?? json['windows_release_url'],
        fallback: AppConfig.userTestWindowsReleaseUrl,
      ),
      windowsDebugUrl: _stringValue(
        json['windowsDebugUrl'] ?? json['windows_debug_url'],
        fallback: AppConfig.userTestWindowsDebugUrl,
      ),
      releasePageUrl: _stringValue(
        json['releasePageUrl'] ?? json['release_page_url'],
        fallback: 'https://github.com/caizuan2/-AI/releases/tag/user-test',
      ),
      apkMirrors: _urlList(
        json['apkMirrors'] ?? json['apk_mirrors'],
        fallback: const [AppConfig.userTestApkUrl],
      ),
      windowsReleaseMirrors: _urlList(
        json['windowsReleaseMirrors'] ?? json['windows_release_mirrors'],
        fallback: const [AppConfig.userTestWindowsReleaseUrl],
      ),
      manifestMirrors: _urlList(
        json['manifestMirrors'] ?? json['manifest_mirrors'],
        fallback: AppConfig.userTestAndroidManifestUrls,
      ),
      changelog: _stringList(json['changelog'] ?? json['releaseNotes']),
      forceUpdate: _boolValue(json['forceUpdate'] ?? json['force_update']),
      minSupportedBuildNumber: _intValue(
        json['minSupportedBuildNumber'] ??
            json['min_supported_build_number'] ??
            json['minSupportedBuild'] ??
            json['minimum_build'],
      ),
      sourceUrl: sourceUrl,
    );
  }

  List<String> get apkDownloadCandidates =>
      _dedupeUrls([apkUrl, ...apkMirrors]);

  List<String> get windowsReleaseDownloadCandidates =>
      _dedupeUrls([windowsReleaseUrl, ...windowsReleaseMirrors]);

  static String _stringValue(Object? value, {String fallback = ''}) {
    if (value is String && value.trim().isNotEmpty) {
      return value.trim();
    }
    return fallback;
  }

  static int _intValue(Object? value, {int fallback = 0}) {
    if (value is int) {
      return value;
    }
    if (value is num) {
      return value.toInt();
    }
    if (value is String) {
      return int.tryParse(value) ?? fallback;
    }
    return fallback;
  }

  static bool _boolValue(Object? value, {bool fallback = false}) {
    if (value is bool) {
      return value;
    }
    if (value is String) {
      return value.toLowerCase() == 'true';
    }
    return fallback;
  }

  static List<String> _stringList(Object? value) {
    if (value is String) {
      final trimmed = value.trim();
      return trimmed.isEmpty ? const [] : [trimmed];
    }
    if (value is! Iterable) {
      return const [];
    }
    return value
        .map((item) => item.toString().trim())
        .where((item) => item.isNotEmpty)
        .toList(growable: false);
  }

  static List<String> _urlList(Object? value,
      {required List<String> fallback}) {
    final list = _stringList(value);
    return list.isEmpty ? fallback : _dedupeUrls(list);
  }

  static List<String> _dedupeUrls(Iterable<String> urls) {
    final normalized = <String>[];
    for (final url in urls) {
      final trimmed = url.trim();
      if (trimmed.isNotEmpty && !normalized.contains(trimmed)) {
        normalized.add(trimmed);
      }
    }
    return List.unmodifiable(normalized);
  }
}
