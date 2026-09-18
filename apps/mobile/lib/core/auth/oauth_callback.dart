String oauthBrowserRedirect({required bool isWeb, required Uri pageUri}) {
  if (!isWeb) return 'after://auth/callback';
  if (pageUri.scheme == 'http' || pageUri.scheme == 'https') {
    return '${pageUri.origin}/';
  }
  return 'https://app-after.com.br/';
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

String? appleExchangeCodeFromUri(Uri uri) {
  if (!_looksLikeAppleWebCallback(uri)) return null;
  return _oauthQueryValue(uri, 'code');
}

String? appleWebStatusFromUri(Uri uri) => _oauthQueryValue(uri, 'apple');

bool isAppleWebCallbackUri(Uri uri) => _looksLikeAppleWebCallback(uri);

bool _looksLikeAppleWebCallback(Uri uri) {
  final blob = '${uri.path}?${uri.query}#${uri.fragment}'.toLowerCase();
  return blob.contains('/auth/apple/callback');
}

String appleWebCallbackPath(String? name) {
  final raw = (name ?? '').trim();
  if (raw.isEmpty) return '';
  final uri = Uri.tryParse(raw.startsWith('/') ? 'https://after.local$raw' : raw);
  return uri?.path ?? raw.split('?').first;
}

String? appleExchangeCodeFromRouteName(String? name) {
  final raw = (name ?? '').trim();
  if (raw.isEmpty) return null;
  final uri = Uri.tryParse(raw.startsWith('/') ? 'https://after.local$raw' : raw);
  final code = uri?.queryParameters['code'];
  if (code != null && code.isNotEmpty) return code;
  return appleExchangeCodeFromUri(Uri.base);
}

String? appleWebStatusFromRouteName(String? name) {
  final raw = (name ?? '').trim();
  if (raw.isEmpty) return null;
  final uri = Uri.tryParse(raw.startsWith('/') ? 'https://after.local$raw' : raw);
  final status = uri?.queryParameters['apple'];
  if (status != null && status.isNotEmpty) return status;
  return appleWebStatusFromUri(Uri.base);
}

String loginPath(String? name) {
  final raw = (name ?? '').trim();
  if (raw.isEmpty) return '';
  final uri = Uri.tryParse(raw.startsWith('/') ? 'https://after.local$raw' : raw);
  return uri?.path ?? raw.split('?').first;
}

Uri appleWebStartUri({
  required String apiBase,
  required String redirect,
}) {
  return Uri.parse('$apiBase/auth/apple/start').replace(
    queryParameters: {'redirect': redirect},
  );
}

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
