import 'dart:convert';

import 'package:http/http.dart' as http;

class Municipality {
  const Municipality({required this.city, required this.state});

  final String city;
  final String state;
}

/// Reverse geocode used only to name a municipality. Coordinates never go to
/// the promotional notification endpoint.
abstract class MunicipalityGeocoder {
  Future<Municipality?> reverse(double lat, double lng);
}

Municipality? municipalityFromNominatim(Object? body) {
  final map = body is Map ? body : null;
  final address = map?['address'];
  if (address is! Map) return null;
  final city = _firstText(address, const [
    'city',
    'town',
    'municipality',
    'village',
  ]);
  final state = _uf(address);
  if (city == null || state == null) return null;
  return Municipality(city: city, state: state);
}

String? _firstText(Map address, List<String> keys) {
  for (final key in keys) {
    final value = address[key]?.toString().trim() ?? '';
    if (value.isNotEmpty) return value;
  }
  return null;
}

String? _uf(Map address) {
  final iso = address['ISO3166-2-lvl4']?.toString().trim().toUpperCase() ?? '';
  final fromIso = RegExp(r'^BR-([A-Z]{2})$').firstMatch(iso);
  if (fromIso != null) return fromIso.group(1);
  final code = address['state_code']?.toString().trim().toUpperCase() ?? '';
  if (RegExp(r'^[A-Z]{2}$').hasMatch(code)) return code;
  return null;
}

class NominatimMunicipalityGeocoder implements MunicipalityGeocoder {
  NominatimMunicipalityGeocoder({http.Client? client, this.minGap = const Duration(seconds: 2)})
      : _client = client ?? http.Client();

  final http.Client _client;
  final Duration minGap;
  DateTime? _lastRequest;

  @override
  Future<Municipality?> reverse(double lat, double lng) async {
    final last = _lastRequest;
    if (last != null && DateTime.now().difference(last) < minGap) return null;
    _lastRequest = DateTime.now();
    try {
      final uri = Uri.https('nominatim.openstreetmap.org', '/reverse', {
        'lat': lat.toString(),
        'lon': lng.toString(),
        'format': 'json',
        'addressdetails': '1',
        'zoom': '10',
      });
      final response = await _client.get(uri, headers: const {
        'User-Agent': 'After/1.0 (com.r2p.after.after_app)',
        'Accept': 'application/json',
      });
      if (response.statusCode != 200) return null;
      return municipalityFromNominatim(jsonDecode(response.body));
    } catch (_) {
      return null;
    }
  }
}
