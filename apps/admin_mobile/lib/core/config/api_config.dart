import 'package:flutter/foundation.dart';

/// Production API used only by a Web release build that omits `--dart-define`.
const productionApiBaseUrl = 'https://api.app-after.com.br';

/// Resolves the Admin API host.
///
/// An explicit [defined] value always wins. A Web release build with no define
/// uses [productionApiBaseUrl]. Android, iOS and debug Web keep the hosts the
/// mobile app already uses, so a release APK/IPA is unchanged.
String resolveAdminApiBaseUrl({
  required String defined,
  required bool isWeb,
  required bool releaseMode,
  required TargetPlatform platform,
}) {
  final explicit = defined.trim().replaceAll(RegExp(r'/$'), '');
  if (explicit.isNotEmpty) return explicit;
  if (isWeb && releaseMode) return productionApiBaseUrl;
  if (!isWeb && platform == TargetPlatform.android) {
    return 'http://10.0.2.2:3000';
  }
  if (isWeb) return 'http://127.0.0.1:3000';
  return 'http://localhost:3000';
}

/// Base URL for the NestJS API.
/// Override at build time: `--dart-define=API_BASE_URL=https://api.example.com`
class ApiConfig {
  static String get baseUrl => resolveAdminApiBaseUrl(
        defined: const String.fromEnvironment('API_BASE_URL'),
        isWeb: kIsWeb,
        releaseMode: kReleaseMode,
        platform: defaultTargetPlatform,
      );
}
