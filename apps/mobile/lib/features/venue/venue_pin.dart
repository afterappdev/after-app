import 'package:after_app/core/location/geo_origin.dart';

enum VenuePinSource { none, saved, geocoded, manual }

class VenuePin {
  VenuePinSource source = VenuePinSource.none;
  double? lat;
  double? lng;

  bool get hasValid {
    if (lat == null || lng == null) return false;
    return GeoOrigin.tryCreate(lat: lat!, lng: lng!) != null;
  }

  void applySaved(double? latitude, double? longitude) {
    final origin = _origin(latitude, longitude);
    if (origin == null) {
      source = VenuePinSource.none;
      lat = null;
      lng = null;
      return;
    }
    source = VenuePinSource.saved;
    lat = origin.lat;
    lng = origin.lng;
  }

  bool applyGeocode(double? latitude, double? longitude) {
    final origin = _origin(latitude, longitude);
    if (origin == null) return false;
    source = VenuePinSource.geocoded;
    lat = origin.lat;
    lng = origin.lng;
    return true;
  }

  bool applyManual(double latitude, double longitude) {
    final origin = GeoOrigin.tryCreate(lat: latitude, lng: longitude);
    if (origin == null) return false;
    source = VenuePinSource.manual;
    lat = origin.lat;
    lng = origin.lng;
    return true;
  }

  Map<String, double>? payload() {
    if (!hasValid) return null;
    return {'lat': lat!, 'lng': lng!};
  }

  GeoOrigin? _origin(double? latitude, double? longitude) {
    if (latitude == null || longitude == null) return null;
    return GeoOrigin.tryCreate(lat: latitude, lng: longitude);
  }
}
