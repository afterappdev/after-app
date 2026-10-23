import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'token_store.dart';

export 'token_store.dart';

class SecureTokenStore implements TokenStore {
  SecureTokenStore({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  static const _tokenKey = 'after_admin.access_token';

  final FlutterSecureStorage _storage;

  @override
  Future<void> saveToken(String token) {
    return _storage.write(key: _tokenKey, value: token);
  }

  @override
  Future<String?> readToken() {
    return _storage.read(key: _tokenKey);
  }

  @override
  Future<void> clear() {
    return _storage.delete(key: _tokenKey);
  }
}
