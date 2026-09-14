import 'package:geolocator/geolocator.dart';

import 'geo_origin.dart';
import 'home_origin_policy.dart';

abstract class DeviceLocator {
  Future<bool> isServiceEnabled();

  Future<LocationPermission> checkPermission();

  Future<LocationPermission> requestPermission();

  Future<GeoOrigin?> lastKnown();

  Future<GeoOrigin?> currentPosition({
    Duration timeLimit = HomeOriginPolicy.gpsTimeout,
  });
}

class GeolocatorDeviceLocator implements DeviceLocator {
  const GeolocatorDeviceLocator();

  @override
  Future<bool> isServiceEnabled() {
    return Geolocator.isLocationServiceEnabled();
  }

  @override
  Future<LocationPermission> checkPermission() {
    return Geolocator.checkPermission();
  }

  @override
  Future<LocationPermission> requestPermission() {
    return Geolocator.requestPermission();
  }

  @override
  Future<GeoOrigin?> lastKnown() async {
    try {
      final last = await Geolocator.getLastKnownPosition();
      if (last == null) return null;
      return GeoOrigin.tryCreate(
        lat: last.latitude,
        lng: last.longitude,
        at: last.timestamp,
      );
    } catch (_) {
      return null;
    }
  }

  @override
  Future<GeoOrigin?> currentPosition({
    Duration timeLimit = HomeOriginPolicy.gpsTimeout,
  }) async {
    try {
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: LocationSettings(
          accuracy: LocationAccuracy.low,
          timeLimit: timeLimit,
        ),
      );
      return GeoOrigin.tryCreate(
        lat: pos.latitude,
        lng: pos.longitude,
        at: pos.timestamp,
      );
    } catch (_) {
      return null;
    }
  }
}
