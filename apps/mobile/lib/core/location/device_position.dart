import 'package:geolocator/geolocator.dart';

import 'device_locator.dart';
import 'geo_origin.dart';

Future<({double lat, double lng})?> getDevicePosition({
  DeviceLocator? locator,
}) async {
  final device = locator ?? const GeolocatorDeviceLocator();
  try {
    final enabled = await device.isServiceEnabled();
    if (!enabled) return null;

    var permission = await device.checkPermission();
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.unableToDetermine) {
      permission = await device.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      return null;
    }

    final last = await device.lastKnown();
    if (last != null && _isFreshLastKnown(last)) {
      return (lat: last.lat, lng: last.lng);
    }

    final pos = await device.currentPosition();
    if (pos == null) return null;
    return (lat: pos.lat, lng: pos.lng);
  } catch (_) {
    return null;
  }
}

bool _isFreshLastKnown(GeoOrigin last) {
  final at = last.at;
  if (at == null) return false;
  final age = DateTime.now().difference(at);
  return !age.isNegative && age <= const Duration(minutes: 5);
}
