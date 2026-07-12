import 'dart:io';

import 'package:flutter/foundation.dart';

class AppConfig {
  const AppConfig._({
    required this.baseUri,
    required this.insecureLocalDevelopment,
  });

  static const _configuredBaseUrl = String.fromEnvironment('TEAM_OS_BASE_URL');
  static const _allowInsecureLocal = bool.fromEnvironment(
    'TEAM_OS_ALLOW_INSECURE_LOCAL',
  );

  final Uri baseUri;
  final bool insecureLocalDevelopment;

  String get exactOriginPattern => '^${RegExp.escape(baseUri.origin)}\$';

  String get allowedMainFramePattern {
    final origin = RegExp.escape(baseUri.origin);
    return '^$origin(?:/team-os(?:/.*)?|/(?:login|register|unlock|no-access))'
        r'(?:\?[^#]*)?(?:#.*)?$';
  }

  static AppConfig fromEnvironment() {
    return parse(
      _configuredBaseUrl,
      allowInsecureLocal: _allowInsecureLocal,
      debugMode: kDebugMode,
    );
  }

  static AppConfig parse(
    String value, {
    bool allowInsecureLocal = false,
    bool debugMode = false,
  }) {
    final normalized = value.trim();
    if (normalized.isEmpty) {
      throw const AppConfigException(
        '未配置 TEAM_OS_BASE_URL。请通过 --dart-define 指定企业 HTTPS 地址。',
      );
    }

    final uri = Uri.tryParse(normalized);
    if (uri == null || !uri.hasAuthority || uri.host.isEmpty) {
      throw const AppConfigException('TEAM_OS_BASE_URL 不是有效的服务器地址。');
    }
    if (uri.userInfo.isNotEmpty ||
        uri.hasQuery ||
        uri.hasFragment ||
        (uri.path.isNotEmpty && uri.path != '/')) {
      throw const AppConfigException('TEAM_OS_BASE_URL 只能包含协议、主机和标准端口。');
    }

    final localHost = _isLocalHost(uri.host);
    final insecureLocal =
        uri.scheme == 'http' && localHost && allowInsecureLocal && debugMode;
    if (uri.scheme != 'https' && !insecureLocal) {
      throw const AppConfigException('生产 APP 只允许连接 HTTPS 企业地址。');
    }
    if (uri.scheme == 'https') {
      if (localHost || InternetAddress.tryParse(uri.host) != null) {
        throw const AppConfigException('生产企业地址必须使用正式 HTTPS 域名。');
      }
      if (uri.hasPort && uri.port != 443) {
        throw const AppConfigException('生产企业地址只允许标准 HTTPS 端口。');
      }
    }

    final canonical = Uri(
      scheme: uri.scheme,
      host: uri.host.toLowerCase(),
      port: uri.hasPort ? uri.port : null,
    );
    return AppConfig._(
      baseUri: canonical,
      insecureLocalDevelopment: insecureLocal,
    );
  }

  Uri resolve(String path, [Map<String, String>? query]) {
    final relative = Uri.parse(path);
    if (relative.hasScheme || relative.hasAuthority) {
      throw const AppConfigException('应用内部路径不能包含外部地址。');
    }
    if (query != null) {
      return baseUri.replace(path: relative.path, queryParameters: query);
    }
    return baseUri.replace(
      path: relative.path,
      query: relative.hasQuery ? relative.query : null,
    );
  }

  bool isSameOrigin(Uri uri) {
    return uri.scheme == baseUri.scheme &&
        uri.host.toLowerCase() == baseUri.host.toLowerCase() &&
        uri.port == baseUri.port;
  }

  static bool _isLocalHost(String host) {
    final normalized = host.toLowerCase();
    return normalized == 'localhost' ||
        normalized == '127.0.0.1' ||
        normalized == '::1' ||
        normalized == '10.0.2.2';
  }
}

class AppConfigException implements Exception {
  const AppConfigException(this.message);

  final String message;

  @override
  String toString() => message;
}
