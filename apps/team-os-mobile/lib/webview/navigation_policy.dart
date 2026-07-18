import '../core/app_config.dart';

class TeamOsNavigationPolicy {
  TeamOsNavigationPolicy(this.config);

  final AppConfig config;

  static const _allowedExactPaths = <String>{
    '/login',
    '/register',
    '/unlock',
    '/no-access',
  };

  bool allows(Uri? uri, {required bool isMainFrame}) {
    if (uri == null || !config.isSameOrigin(uri)) return false;
    if (!isMainFrame) return uri.scheme == config.baseUri.scheme;
    final path = uri.path.isEmpty ? '/' : uri.path;
    return path == '/team-os' ||
        path.startsWith('/team-os/') ||
        _allowedExactPaths.contains(path);
  }
}
