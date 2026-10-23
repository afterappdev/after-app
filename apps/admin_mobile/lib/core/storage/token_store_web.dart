import 'package:web/web.dart';

import 'token_store.dart';

/// Tab session only. Survives refresh in the same tab and is discarded when
/// the tab closes. It does not read the public app token (`access_token`).
class SessionTokenStore implements TokenStore {
  static const _tokenKey = 'after_admin.access_token';

  @override
  Future<void> saveToken(String token) async {
    window.sessionStorage.setItem(_tokenKey, token);
  }

  @override
  Future<String?> readToken() async {
    final value = window.sessionStorage.getItem(_tokenKey);
    if (value == null || value.isEmpty) return null;
    return value;
  }

  @override
  Future<void> clear() async {
    window.sessionStorage.removeItem(_tokenKey);
  }
}

TokenStore createPlatformTokenStore() => SessionTokenStore();
