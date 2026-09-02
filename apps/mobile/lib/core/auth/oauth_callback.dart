String oauthBrowserRedirect({required bool isWeb, required Uri pageUri}) {
  return isWeb ? '${pageUri.origin}/' : 'after://auth/callback';
}

String? _oauthQueryValue(Uri uri, String key) {
  final fromQuery = uri.queryParameters[key];
  if (fromQuery != null && fromQuery.isNotEmpty) return fromQuery;

  final fragment = uri.fragment;
  if (fragment.isEmpty) return null;

  final query = fragment.contains('?')
      ? fragment.substring(fragment.indexOf('?') + 1)
      : fragment;
  final value = Uri.splitQueryString(query)[key];
  if (value != null && value.isNotEmpty) return value;
  return null;
}

String? oauthTokenFromUri(Uri uri) => _oauthQueryValue(uri, 'token');

String? oauthOnboardingFromUri(Uri uri) => _oauthQueryValue(uri, 'onboarding');

bool isOAuthCallbackUri(Uri uri) {
  if (uri.scheme == 'after' && (uri.host == 'auth' || uri.path.contains('callback'))) {
    return true;
  }
  if (uri.fragment.contains('/oauth') ||
      uri.path.contains('/oauth') ||
      uri.fragment.contains('/register') ||
      uri.path.contains('/register')) {
    return oauthTokenFromUri(uri) != null || oauthOnboardingFromUri(uri) != null;
  }
  return oauthTokenFromUri(uri) != null || oauthOnboardingFromUri(uri) != null;
}
