import 'dart:convert';

class SocialOnboarding {
  SocialOnboarding({
    required this.onboardingToken,
    required this.provider,
    required this.email,
    required this.name,
    this.avatarUrl,
  });

  final String onboardingToken;
  final String provider;
  final String email;
  final String name;
  final String? avatarUrl;

  factory SocialOnboarding.fromResponse(Map<String, dynamic> data) {
    final profile = data['profile'];
    final map = profile is Map<String, dynamic> ? profile : const <String, dynamic>{};
    return SocialOnboarding(
      onboardingToken: data['onboardingToken'] as String,
      provider: map['provider'] as String? ?? '',
      email: map['email'] as String? ?? '',
      name: map['name'] as String? ?? '',
      avatarUrl: map['avatarUrl'] as String?,
    );
  }

  factory SocialOnboarding.fromJwt(String token) {
    final payload = decodeUnverifiedJwtPayload(token);
    return SocialOnboarding(
      onboardingToken: token,
      provider: payload?['provider'] as String? ?? '',
      email: payload?['email'] as String? ?? '',
      name: payload?['name'] as String? ?? '',
      avatarUrl: payload?['avatarUrl'] as String?,
    );
  }
}

Map<String, dynamic>? decodeUnverifiedJwtPayload(String token) {
  final parts = token.split('.');
  if (parts.length != 3) return null;
  try {
    final normalized = base64Url.normalize(parts[1]);
    final decoded = utf8.decode(base64Url.decode(normalized));
    final json = jsonDecode(decoded);
    return json is Map<String, dynamic> ? json : null;
  } catch (_) {
    return null;
  }
}
