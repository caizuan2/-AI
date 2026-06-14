import 'package:shared_preferences/shared_preferences.dart';

class SessionStore {
  static const _cookieKey = 'ai_knowledge_cookie';

  Future<String?> loadCookie() async {
    final preferences = await SharedPreferences.getInstance();
    return preferences.getString(_cookieKey);
  }

  Future<void> saveCookie(String cookie) async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(_cookieKey, cookie);
  }

  Future<void> clear() async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.remove(_cookieKey);
  }
}
