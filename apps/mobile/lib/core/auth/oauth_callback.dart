String? oauthTokenFromUri(Uri uri) {
  final fromQuery = uri.queryParameters['token'];
  if (fromQuery != null && fromQuery.isNotEmpty) return fromQuery;

  final fragment = uri.fragment;
  if (fragment.isEmpty) return null;

  final query = fragment.contains('?')
      ? fragment.substring(fragment.indexOf('?') + 1)
      : fragment;
  final token = Uri.splitQueryString(query)['token'];
  if (token != null && token.isNotEmpty) return token;
  return null;
}

bool isOAuthCallbackUri(Uri uri) {
  if (uri.scheme == 'after' && (uri.host == 'auth' || uri.path.contains('callback'))) {
    return true;
  }
  if (uri.fragment.contains('/oauth') || uri.path.contains('/oauth')) {
    return true;
  }
  return oauthTokenFromUri(uri) != null;
}
