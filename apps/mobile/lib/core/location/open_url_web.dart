// ignore: avoid_web_libraries_in_flutter
import 'dart:html' as html;

Future<void> openExternalUrl(String url) async {
  if (url.startsWith('tel:')) {
    html.window.location.assign(url);
    return;
  }
  html.window.open(url, '_blank');
}
