/// After Web (React) publicado em `/app/` com HashRouter.
const String kWebSpaBasePath = '/app/';

String webSpaOAuthRedirect({Uri? pageUri}) {
  final uri = pageUri ?? Uri.base;
  if (uri.scheme == 'http' || uri.scheme == 'https') {
    return '${uri.origin}$kWebSpaBasePath';
  }
  return 'https://app-after.com.br$kWebSpaBasePath';
}

String webSpaHashRoute(String route) {
  var path = route.trim();
  if (!path.startsWith('/')) path = '/$path';
  return '$kWebSpaBasePath#$path';
}