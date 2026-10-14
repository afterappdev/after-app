import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract class TokenStore {
  Future<void> saveToken(String token);
  Future<String?> readToken();
  Future<void> clear();
}

/// Android reports this when a stored value cannot be decrypted, which
/// happens after reinstall or when the signing key changed.
///
/// `AndroidOptions(resetOnError: true)` in flutter_secure_storage 9.2.4
/// deletes every secure entry and returns the string "Data has been reset"
/// instead of null. Only the unreadable token key is removed.
bool isRecoverableSecureReadFailure(Object error) {
  if (error is! PlatformException) return false;
  if (error.code != 'Exception encountered' || error.message != 'read') {
    return false;
  }
  final details = '${error.details}';
  return details.contains('BadPaddingException') ||
      details.contains('BAD_DECRYPT');
}

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
  Future<String?> readToken() async {
    try {
      final token = await _storage.read(key: _tokenKey);
      if (token == null || token.isEmpty) return null;
      return token;
    } on PlatformException catch (error) {
      if (!isRecoverableSecureReadFailure(error)) rethrow;
      try {
        await _storage.delete(key: _tokenKey);
      } on PlatformException {
        // The value is already unreadable. Keep going so login can open.
      }
      return null;
    }
  }

  @override
  Future<void> clear() {
    return _storage.delete(key: _tokenKey);
  }
}
