import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'geo_origin.dart';
import 'home_origin_policy.dart';

class OriginCache {
  OriginCache();

  static const storageKey = 'home_origin_cache';

  Future<GeoOrigin?> read({DateTime? now}) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(storageKey);
      if (raw == null || raw.isEmpty) return null;
      final map = jsonDecode(raw) as Map<String, dynamic>;
      final lat = (map['lat'] as num?)?.toDouble();
      final lng = (map['lng'] as num?)?.toDouble();
      final millis = (map['at'] as num?)?.toInt();
      if (lat == null || lng == null || millis == null) return null;
      final at = DateTime.fromMillisecondsSinceEpoch(millis);
      final origin = GeoOrigin.tryCreate(lat: lat, lng: lng, at: at);
      if (origin == null) return null;
      final clock = now ?? DateTime.now();
      final age = clock.difference(at);
      if (age.isNegative || age > HomeOriginPolicy.cacheTtl) return null;
      return origin;
    } catch (_) {
      return null;
    }
  }

  Future<void> write(GeoOrigin origin, {DateTime? now}) async {
    if (!origin.isValid) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      final at = origin.at ?? now ?? DateTime.now();
      await prefs.setString(
        storageKey,
        jsonEncode({
          'lat': origin.lat,
          'lng': origin.lng,
          'at': at.millisecondsSinceEpoch,
        }),
      );
    } catch (_) {
      // Best-effort cache; Home still works without it.
    }
  }
}
