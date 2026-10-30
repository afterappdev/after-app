import 'package:after_app/features/auth/models/user_session.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('UserSession parseia venueId legado, activeVenueId e venues', () {
    final session = UserSession.fromJson({
      'id': 'u1',
      'name': 'Owner',
      'email': 'o@after.local',
      'role': 'VENUE',
      'state': 'SP',
      'city': 'São Paulo',
      'venueId': 'v-old',
      'activeVenueId': 'v-active',
      'venues': [
        {
          'id': 'v-old',
          'name': 'Bar A',
          'city': 'São Paulo',
          'state': 'SP',
          'logoUrl': null,
        },
        {
          'id': 'v-active',
          'name': 'Bar B',
          'city': 'Campinas',
          'state': 'SP',
        },
      ],
    });

    expect(session.venueId, 'v-old');
    expect(session.activeVenueId, 'v-active');
    expect(session.venues, hasLength(2));
    expect(session.implicitVenueHeaderId, 'v-active');
  });

  test('implicitVenueHeaderId cai no venueId legado sem activeVenueId', () {
    final session = UserSession.fromJson({
      'id': 'u1',
      'name': 'Owner',
      'email': 'o@after.local',
      'role': 'VENUE',
      'state': 'SP',
      'city': 'São Paulo',
      'venueId': 'v-only',
      'venues': [
        {
          'id': 'v-only',
          'name': 'Bar',
          'city': 'São Paulo',
          'state': 'SP',
        },
      ],
    });

    expect(session.implicitVenueHeaderId, 'v-only');
  });
}
