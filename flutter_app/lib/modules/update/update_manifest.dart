import 'package:flutter/foundation.dart';

class UpdateManifest {
  const UpdateManifest({
    required this.version,
    required this.build,
    required this.minSupportedBuild,
    required this.forceUpdate,
    required this.downloads,
    required this.releaseNotes,
    required this.apk,
    required this.exe,
    required this.apkUrl,
    required this.exeUrl,
  });

  final String version;
  final int build;
  final int minSupportedBuild;
  final bool forceUpdate;
  final Map<String, String> downloads;
  final List<String> releaseNotes;
  final String apk;
  final String exe;
  final String apkUrl;
  final String exeUrl;

  String get androidDownloadUrl {
    return downloads['android'] ?? apkUrl;
  }

  String get windowsDownloadUrl {
    return downloads['windows'] ?? exeUrl;
  }

  String get currentPlatformDownloadUrl {
    if (kIsWeb) {
      return downloads['web'] ?? '';
    }

    return switch (defaultTargetPlatform) {
      TargetPlatform.android => androidDownloadUrl,
      TargetPlatform.windows => windowsDownloadUrl,
      TargetPlatform.iOS => downloads['ios'] ?? '',
      TargetPlatform.macOS => downloads['macos'] ?? '',
      _ => downloads['web'] ?? androidDownloadUrl,
    };
  }

  factory UpdateManifest.fromJson(Map<String, dynamic> json) {
    final user = _extractUserManifest(json);
    final rootDownloads = _stringMap(json['downloads']);
    final legacyRootDownload = _stringMap(json['download']);
    final userDownloads = _stringMap(user['downloads']);
    final legacyUserDownload = _stringMap(user['download']);

    final apkUrl = _stringValue(
      user['apk_url'] ?? user['apkUrl'],
      fallback: _stringValue(json['apk_url'] ?? json['apkUrl']),
    );
    final exeUrl = _stringValue(
      user['exe_url'] ?? user['exeUrl'],
      fallback: _stringValue(json['exe_url'] ?? json['exeUrl']),
    );
    final downloads = <String, String>{
      ...legacyRootDownload,
      ...rootDownloads,
      ...legacyUserDownload,
      ...userDownloads,
    };
    if (apkUrl.isNotEmpty) {
      downloads.putIfAbsent('android', () => apkUrl);
    }
    if (exeUrl.isNotEmpty) {
      downloads.putIfAbsent('windows', () => exeUrl);
    }

    return UpdateManifest(
      version: _stringValue(user['version'],
          fallback: _stringValue(json['version'])),
      build: _intValue(user['build'], fallback: _intValue(json['build'])),
      minSupportedBuild: _intValue(
        user['minSupportedBuild'] ??
            user['minimum_build'] ??
            user['minimumBuild'],
        fallback: _intValue(json['minSupportedBuild'] ??
            json['minimum_build'] ??
            json['minimumBuild']),
      ),
      forceUpdate: _boolValue(
        user['forceUpdate'] ?? user['force_update'],
        fallback: _boolValue(json['forceUpdate'] ?? json['force_update']),
      ),
      downloads: downloads,
      releaseNotes: _stringList(
        user['releaseNotes'] ??
            user['changelog'] ??
            json['releaseNotes'] ??
            json['changelog'],
      ),
      apk: _stringValue(user['apk'], fallback: _stringValue(json['apk'])),
      exe: _stringValue(user['exe'], fallback: _stringValue(json['exe'])),
      apkUrl: apkUrl,
      exeUrl: exeUrl,
    );
  }

  static Map<String, dynamic> _extractUserManifest(Map<String, dynamic> json) {
    final user = json['user'];
    if (user is Map) {
      return user.map((key, value) => MapEntry(key?.toString() ?? '', value));
    }

    final apps = json['apps'];
    if (apps is Map && apps['user'] is Map) {
      final app = (apps['user'] as Map)
          .map((key, value) => MapEntry(key?.toString() ?? '', value));
      final versions = app['versions'];
      if (versions is List && versions.isNotEmpty) {
        final active = app['active_version'];
        final versionItems = versions.whereType<Map>().toList(growable: false);
        if (versionItems.isEmpty) {
          return app;
        }
        final selected = versionItems.firstWhere(
          (item) => item['version'] == active,
          orElse: () => versionItems.first,
        );
        return selected
            .map((key, value) => MapEntry(key?.toString() ?? '', value));
      }
    }

    return json;
  }

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
    if (value is! List) {
      return const [];
    }

    return value
        .map((item) => item.toString())
        .where((item) => item.trim().isNotEmpty)
        .toList(growable: false);
  }

  static Map<String, String> _stringMap(Object? value) {
    if (value is! Map) {
      return const {};
    }

    return value.map(
        (key, item) => MapEntry(key?.toString() ?? '', item?.toString() ?? ''))
      ..removeWhere((key, item) => key.trim().isEmpty || item.trim().isEmpty);
  }
}
