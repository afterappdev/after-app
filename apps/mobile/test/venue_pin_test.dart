import 'package:after_app/features/venue/venue_pin.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('coordenadas salvas válidas viram pin', () {
    final pin = VenuePin();
    pin.applySaved(-23.5614, -46.6559);
    expect(pin.hasValid, isTrue);
    expect(pin.source, VenuePinSource.saved);
    expect(pin.payload(), {'lat': -23.5614, 'lng': -46.6559});
  });

  test('lat/lng inválidos são rejeitados', () {
    final pin = VenuePin();
    pin.applySaved(-23.56, -46.65);
    expect(pin.applyManual(99, 0), isFalse);
    expect(pin.applyGeocode(999, -46.65), isFalse);
    expect(pin.lat, -23.56);
    expect(pin.lng, -46.65);
    expect(pin.applyManual(-91, -46), isFalse);
    expect(pin.applyManual(-23, 181), isFalse);
  });

  test('geocode atualiza o pin sem apagar em falha', () {
    final pin = VenuePin();
    pin.applySaved(-23.56, -46.65);
    expect(pin.applyGeocode(null, null), isFalse);
    expect(pin.lat, -23.56);
    expect(pin.applyGeocode(-20.811, -49.375), isTrue);
    expect(pin.source, VenuePinSource.geocoded);
    expect(pin.lat, -20.811);
  });

  test('toque manual marca a coordenada escolhida', () {
    final pin = VenuePin();
    pin.applyGeocode(-23.56, -46.65);
    expect(pin.applyManual(-23.5489, -46.6388), isTrue);
    expect(pin.source, VenuePinSource.manual);
    expect(pin.payload()?['lat'], -23.5489);
  });

  test('sem coordenada o payload fica vazio', () {
    final pin = VenuePin();
    pin.applySaved(null, null);
    expect(pin.hasValid, isFalse);
    expect(pin.payload(), isNull);
  });
}
