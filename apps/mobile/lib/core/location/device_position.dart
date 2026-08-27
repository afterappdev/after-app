import 'package:geolocator/geolocator.dart';

Future<({double lat, double lng})?> getDevicePosition() async {
  try {
    final enabled = await Geolocator.isLocationServiceEnabled();
    if (!enabled) return null;

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.unableToDetermine) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      return null;
    }

    try {
      final last = await Geolocator.getLastKnownPosition();
      if (last != null) {
        final age = DateTime.now().difference(last.timestamp);
        if (!age.isNegative && age <= const Duration(minutes: 5)) {
          return (lat: last.latitude, lng: last.longitude);
        }
      }
    } catch (_) {
      // Web and some desktops do not support last-known position.
    }

    final pos = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.low,
        timeLimit: Duration(seconds: 8),
      ),
    );
    return (lat: pos.latitude, lng: pos.longitude);
  } catch (_) {
    return null;
  }
}
