/// OAuth client IDs. Override at build time:
/// `--dart-define=GOOGLE_WEB_CLIENT_ID=....apps.googleusercontent.com`
class OauthConfig {
  static const googleWebClientId = String.fromEnvironment(
    'GOOGLE_WEB_CLIENT_ID',
  );
  static const googleIosClientId = String.fromEnvironment(
    'GOOGLE_IOS_CLIENT_ID',
  );
  static const googleServerClientId = String.fromEnvironment(
    'GOOGLE_SERVER_CLIENT_ID',
  );
  static const appleServiceId = String.fromEnvironment('APPLE_SERVICE_ID');

  static String get googleClientId {
    if (googleWebClientId.isNotEmpty) return googleWebClientId;
    if (googleIosClientId.isNotEmpty) return googleIosClientId;
    return googleServerClientId;
  }

  static String get googleNativeServerClientId {
    if (googleServerClientId.isNotEmpty) return googleServerClientId;
    return googleWebClientId;
  }
}
