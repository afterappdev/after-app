import 'package:flutter/foundation.dart';

import '../../core/network/api_client.dart';

class PromoPreference {
  const PromoPreference({
    required this.enabled,
    required this.locationFresh,
  });

  final bool enabled;
  final bool locationFresh;

  static PromoPreference fromJson(Object? data) {
    final map = data is Map ? data : const {};
    return PromoPreference(
      enabled: map['enabled'] == true,
      locationFresh: map['locationFresh'] == true,
    );
  }
}

class PromoPushApi {
  PromoPushApi(this.client);

  final ApiClient client;

  Future<PromoPreference> getPreferences() async {
    final data = await client.get('/promo-notifications/preferences');
    return PromoPreference.fromJson(data);
  }

  Future<PromoPreference> setEnabled(bool enabled) async {
    final data = await client.put(
      '/promo-notifications/preferences',
      body: {'enabled': enabled},
    );
    return PromoPreference.fromJson(data);
  }

  Future<void> setLocation({
    bool clear = false,
    String? city,
    String? state,
  }) async {
    await client.put(
      '/promo-notifications/location',
      body: clear
          ? {'clear': true}
          : {
              'city': city,
              'state': state,
            },
    );
  }

  Future<void> registerToken(String token) async {
    await client.post('/promo-notifications/tokens', body: {
      'token': token,
      'platform': _promoPushPlatform,
    });
  }

  static String get _promoPushPlatform {
    if (kIsWeb) return 'web';
    switch (defaultTargetPlatform) {
      case TargetPlatform.iOS:
        return 'ios';
      case TargetPlatform.android:
        return 'android';
      default:
        return 'web';
    }
  }

  Future<void> unregisterToken(String token) async {
    await client.delete('/promo-notifications/tokens', body: {'token': token});
  }

  Future<Map<String, dynamic>?> getVenue(String venueId) async {
    try {
      final data = await client.get('/venues/$venueId');
      if (data is Map<String, dynamic>) return data;
      if (data is Map) return Map<String, dynamic>.from(data);
      return null;
    } on ApiException catch (error) {
      if (error.statusCode == 404 || error.statusCode == 403) return null;
      rethrow;
    }
  }
}
