import 'package:flutter/foundation.dart';

/// Base URL for the NestJS API.
/// Override at build time: `--dart-define=API_BASE_URL=https://api.app-after.com.br`
class ApiConfig {
  static String get baseUrl {
    const defined = String.fromEnvironment('API_BASE_URL');
    if (defined.isNotEmpty) return defined.replaceAll(RegExp(r'/$'), '');
    if (kIsWeb) return 'http://localhost:3000';
    if (defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:3000';
    }
    return 'http://localhost:3000';
  }
}
