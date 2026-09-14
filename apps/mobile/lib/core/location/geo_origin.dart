class GeoOrigin {
  const GeoOrigin({
    required this.lat,
    required this.lng,
    this.at,
  });

  final double lat;
  final double lng;
  final DateTime? at;

  bool get isValid =>
      lat.isFinite &&
      lng.isFinite &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180;

  GeoOrigin copyWith({double? lat, double? lng, DateTime? at}) {
    return GeoOrigin(
      lat: lat ?? this.lat,
      lng: lng ?? this.lng,
      at: at ?? this.at,
    );
  }

  static GeoOrigin? tryCreate({
    required double lat,
    required double lng,
    DateTime? at,
  }) {
    final origin = GeoOrigin(lat: lat, lng: lng, at: at);
    return origin.isValid ? origin : null;
  }
}
