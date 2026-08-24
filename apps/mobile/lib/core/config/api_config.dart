import 'package:flutter/foundation.dart';

/// Base URL for the NestJS API.
/// Override at build time: `--dart-define=API_BASE_URL=http://192.168.x.x:3000`
/// - Web / desktop / iOS simulator → localhost
/// - Android emulator → host machine via 10.0.2.2
/// - Physical Android → pass API_BASE_URL (LAN IP of the PC)
class ApiConfig {
  static String get baseUrl {
    const defined = String.fromEnvironment('API_BASE_URL');
    if (defined.isNotEmpty) return defined;
    if (kIsWeb) {
      return 'http://localhost:3000';
    }
    if (defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:3000';
    }
    return 'http://localhost:3000';
  }

  /// Rewrites localhost / emulator media URLs to the active API host.
  static String resolveMediaUrl(String? url) {
    if (url == null || url.isEmpty) return '';
    if (url.startsWith('/')) {
      return '$baseUrl$url';
    }
    final origin = Uri.tryParse(baseUrl);
    if (origin == null || origin.host.isEmpty) return url;
    return url
        .replaceFirst('http://localhost:3000', baseUrl)
        .replaceFirst('http://127.0.0.1:3000', baseUrl)
        .replaceFirst('http://10.0.2.2:3000', baseUrl);
  }
}
