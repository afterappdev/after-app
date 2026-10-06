import 'package:flutter/foundation.dart';

/// Production API used when an iOS release build omits `--dart-define`.
const productionApiBaseUrl = 'https://api.app-after.com.br';

/// Resolves the API host.
///
/// An explicit [defined] value always wins. An iOS release build with no
/// define uses [productionApiBaseUrl], so it cannot fall back to localhost.
/// Debug iOS and other platforms keep the existing development hosts.
String resolveApiBaseUrl({
  required String defined,
  required bool isWeb,
  required bool releaseMode,
  required TargetPlatform platform,
}) {
  final explicit = defined.trim();
  if (explicit.isNotEmpty) return explicit;
  if (!isWeb && platform == TargetPlatform.iOS && releaseMode) {
    return productionApiBaseUrl;
  }
  if (!isWeb && platform == TargetPlatform.android) {
    return 'http://10.0.2.2:3000';
  }
  return 'http://127.0.0.1:3000';
}

/// Base URL for the NestJS API.
/// Override at build time: `--dart-define=API_BASE_URL=http://192.168.x.x:3000`
/// - Web / desktop / iOS simulator → 127.0.0.1 (Chrome often maps localhost to IPv6)
/// - Android emulator → host machine via 10.0.2.2
/// - Physical Android → pass API_BASE_URL (LAN IP of the PC)
/// - iOS release without a define → [productionApiBaseUrl]
class ApiConfig {
  static String get baseUrl => resolveApiBaseUrl(
        defined: const String.fromEnvironment('API_BASE_URL'),
        isWeb: kIsWeb,
        releaseMode: kReleaseMode,
        platform: defaultTargetPlatform,
      );

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
