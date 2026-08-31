bool isPasswordResetUri(Uri uri) {
  final blob = '${uri.path}?${uri.query}#${uri.fragment}'.toLowerCase();
  return blob.contains('redefinir-senha') || blob.contains('esqueci-minha-senha');
}

String? passwordResetTokenFromUri(Uri uri) {
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

String? passwordResetTokenFromRouteName(String? name) {
  final raw = (name ?? '').trim();
  if (raw.isEmpty) return null;
  final uri = Uri.tryParse(raw.startsWith('/') ? 'https://after.local$raw' : raw);
  final token = uri?.queryParameters['token'];
  if (token != null && token.isNotEmpty) return token;
  return passwordResetTokenFromUri(Uri.base);
}

String passwordResetPath(String? name) {
  final raw = (name ?? '').trim();
  if (raw.isEmpty) return '';
  final uri = Uri.tryParse(raw.startsWith('/') ? 'https://after.local$raw' : raw);
  return uri?.path ?? raw.split('?').first;
}
