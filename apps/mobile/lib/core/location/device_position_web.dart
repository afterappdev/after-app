import 'dart:async';
// ignore: avoid_web_libraries_in_flutter
import 'dart:html' as html;

Future<({double lat, double lng})?> getDevicePosition() async {
  final geolocation = html.window.navigator.geolocation;
  try {
    final pos = await geolocation.getCurrentPosition(
      enableHighAccuracy: false,
      timeout: const Duration(seconds: 8),
      maximumAge: const Duration(minutes: 5),
    );
    final lat = pos.coords?.latitude;
    final lng = pos.coords?.longitude;
    if (lat == null || lng == null) return null;
    return (lat: lat.toDouble(), lng: lng.toDouble());
  } catch (_) {
    return null;
  }
}
