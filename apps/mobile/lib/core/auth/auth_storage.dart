import 'package:shared_preferences/shared_preferences.dart';

class AuthStorage {
  static const tokenKey = 'access_token';
  static const userJsonKey = 'user_json';
  static const notificationsLastPushedKey = 'notifications_last_pushed_id';

  Future<void> saveSession({
    required String token,
    required String userJson,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(tokenKey, token);
    await prefs.setString(userJsonKey, userJson);
  }

  Future<String?> readToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(tokenKey);
  }

  Future<String?> readUserJson() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(userJsonKey);
  }

  Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(tokenKey);
    await prefs.remove(userJsonKey);
    await prefs.remove(notificationsLastPushedKey);
  }
}
