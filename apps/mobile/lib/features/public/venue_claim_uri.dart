bool isVenueClaimUri(Uri uri) {
  final blob = '${uri.path}?${uri.query}#${uri.fragment}'.toLowerCase();
  return blob.contains('reivindicar');
}

String? venueIdFromClaimUri(Uri uri) {
  final fromQuery = uri.queryParameters['venueId'];
  if (fromQuery != null && fromQuery.isNotEmpty) return fromQuery;

  final fragment = uri.fragment;
  if (fragment.isEmpty) return null;
  final path = fragment.contains('?')
      ? fragment.substring(0, fragment.indexOf('?'))
      : fragment;
  if (!path.toLowerCase().contains('reivindicar')) return null;
  final query = fragment.contains('?')
      ? fragment.substring(fragment.indexOf('?') + 1)
      : '';
  final venueId = Uri.splitQueryString(query)['venueId'];
  if (venueId != null && venueId.isNotEmpty) return venueId;
  return null;
}

String claimProfilePath(String? name) {
  final raw = (name ?? '').trim();
  if (raw.isEmpty) return '';
  final uri = Uri.tryParse(raw.startsWith('/') ? 'https://after.local$raw' : raw);
  return uri?.path ?? raw.split('?').first;
}