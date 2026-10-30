import 'dart:io';

import 'package:after_app/features/public/store_listing_urls.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('URLs oficiais batem com /baixar/index.html', () {
    final page = File('web/baixar/index.html').readAsStringSync();
    expect(page, contains(kGooglePlayStoreUrl));
    expect(page, contains(kAppleAppStoreUrl));
    expect(
      page,
      contains('id="google-play" href="$kGooglePlayStoreUrl"'),
    );
    expect(page, contains('id="app-store" href="$kAppleAppStoreUrl"'));
  });
}
