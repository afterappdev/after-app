import 'dart:math' as math;

import 'geo_origin.dart';

double haversineKm(
  double lat1,
  double lng1,
  double lat2,
  double lng2,
) {
  const earthKm = 6371.0;
  final dLat = _toRad(lat2 - lat1);
  final dLng = _toRad(lng2 - lng1);
  final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
      math.cos(_toRad(lat1)) *
          math.cos(_toRad(lat2)) *
          math.sin(dLng / 2) *
          math.sin(dLng / 2);
  return earthKm * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
}

double originDisplacementKm(GeoOrigin from, GeoOrigin to) {
  return haversineKm(from.lat, from.lng, to.lat, to.lng);
}

double _toRad(double deg) => deg * math.pi / 180;
