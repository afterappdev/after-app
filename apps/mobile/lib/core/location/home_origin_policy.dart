import 'geo_math.dart';
import 'geo_origin.dart';

class HomeOriginPolicy {
  static const reloadThresholdKm = 0.3;
  static const cacheTtl = Duration(minutes: 30);
  static const gpsTimeout = Duration(seconds: 8);

  static bool shouldReloadFeed({
    GeoOrigin? previous,
    required GeoOrigin next,
  }) {
    if (!next.isValid) return false;
    if (previous == null || !previous.isValid) return true;
    return originDisplacementKm(previous, next) >= reloadThresholdKm;
  }
}
