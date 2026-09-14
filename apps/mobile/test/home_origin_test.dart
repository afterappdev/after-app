import 'dart:convert';

import 'package:after_app/core/location/geo_math.dart';
import 'package:after_app/core/location/geo_origin.dart';
import 'package:after_app/core/location/home_origin_policy.dart';
import 'package:after_app/core/location/origin_cache.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const campinas = GeoOrigin(lat: -23.5505, lng: -46.6333);

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('deslocamento < 300 m não pede reload do feed', () {
    const next = GeoOrigin(lat: -23.5487, lng: -46.6333);
    expect(originDisplacementKm(campinas, next), lessThan(0.3));
    expect(
      HomeOriginPolicy.shouldReloadFeed(previous: campinas, next: next),
      isFalse,
    );
  });

  test('deslocamento >= 300 m pede reload silencioso', () {
    const next = GeoOrigin(lat: -23.5469, lng: -46.6333);
    expect(originDisplacementKm(campinas, next), greaterThanOrEqualTo(0.3));
    expect(
      HomeOriginPolicy.shouldReloadFeed(previous: campinas, next: next),
      isTrue,
    );
  });

  test('sem origem anterior o GPS deve recarregar o feed', () {
    expect(
      HomeOriginPolicy.shouldReloadFeed(previous: null, next: campinas),
      isTrue,
    );
  });

  test('cache válido é lido como origem', () async {
    final now = DateTime.utc(2026, 9, 14, 14);
    await OriginCache().write(
      GeoOrigin(lat: campinas.lat, lng: campinas.lng, at: now),
      now: now,
    );
    final cached = await OriginCache().read(now: now);
    expect(cached, isNotNull);
    expect(cached!.lat, campinas.lat);
    expect(cached.lng, campinas.lng);
  });

  test('cache expirado é ignorado', () async {
    final writtenAt = DateTime.utc(2026, 9, 14, 13);
    await OriginCache().write(
      GeoOrigin(lat: campinas.lat, lng: campinas.lng, at: writtenAt),
      now: writtenAt,
    );
    final cached = await OriginCache().read(
      now: writtenAt.add(const Duration(minutes: 31)),
    );
    expect(cached, isNull);
  });

  test('cache com coordenadas inválidas é ignorado', () async {
    SharedPreferences.setMockInitialValues({
      OriginCache.storageKey: jsonEncode({
        'lat': 999,
        'lng': -46.63,
        'at': DateTime.utc(2026, 9, 14).millisecondsSinceEpoch,
      }),
    });
    expect(await OriginCache().read(), isNull);
  });
}
