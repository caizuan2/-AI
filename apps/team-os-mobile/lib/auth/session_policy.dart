import '../core/app_config.dart';

class SessionPolicy {
  const SessionPolicy._();

  static const cookieName = 'ai_kb_session';

  static Uri initialUri(AppConfig config) => config.resolve('/team-os');

  static bool isLoginPath(String path) {
    return path == '/login' || path.startsWith('/login/');
  }

  static bool isTeamOsPath(String path) {
    return path == '/team-os' || path.startsWith('/team-os/');
  }

  static const logoutFunctionBody = '''
const abortController = new AbortController();
const timeoutId = setTimeout(() => abortController.abort(), 8000);
try {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {'X-AI-Team-OS-App': '1'},
    signal: abortController.signal
  });
  return response.ok;
} catch (_) {
  return false;
} finally {
  clearTimeout(timeoutId);
}
''';
}
