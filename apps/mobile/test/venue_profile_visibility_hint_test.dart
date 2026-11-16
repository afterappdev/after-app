import 'package:after_app/features/venue/venue_profile_visibility_hint.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('cadastro incompleto sem logo, capa e localização', () {
    expect(
      venueListingProfileIncomplete({}),
      isTrue,
    );
    expect(
      venueListingProfileMissingFields({}),
      containsAll(['Logo', 'Capa', 'Localização', 'Categoria', 'Descrição']),
    );
  });

  test('cadastro completo com os campos obrigatórios', () {
    final venue = {
      'logoUrl': 'https://cdn/logo.jpg',
      'coverUrl': 'https://cdn/cover.jpg',
      'lat': -20.81,
      'lng': -49.37,
      'category': '🍺 Bares e Pubs',
      'description': 'Bar no centro',
    };
    expect(venueListingProfileIncomplete(venue), isFalse);
  });
}