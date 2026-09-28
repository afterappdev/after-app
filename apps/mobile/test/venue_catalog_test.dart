import 'package:after_app/core/constants/venue_amenities.dart';
import 'package:after_app/core/constants/venue_categories.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('categorias novas entram e Música ao Vivo sai do cadastro', () {
    expect(VenueCategories.all, contains('🍨 Sorveterias e Açaí'));
    expect(VenueCategories.all, contains('🎡 Food Park'));
    expect(VenueCategories.all, contains('🥟 Pastelaria'));
    expect(VenueCategories.all, contains('🎶 Karaokê'));
    expect(VenueCategories.all, contains('🍷 Adegas e Wine Bars'));
    expect(VenueCategories.all, contains('🍣 Culinária Asiática'));
    expect(VenueCategories.all, contains('☕ Cafeterias e Padarias'));
    expect(VenueCategories.all, contains('🎯 Jogos, Lazer e Diversão'));
    expect(VenueCategories.all, isNot(contains('🎵 Música ao Vivo')));
    expect(VenueCategories.all, isNot(contains('🍣 Culinária Internacional')));
    expect(VenueCategories.optionsFor(null), isNot(contains(VenueCategories.legacyLiveMusic)));
  });

  test('renomeia labels na exibição e exige troca da categoria legada ao editar', () {
    expect(VenueCategories.present('🍣 Culinária Internacional'), '🍣 Culinária Asiática');
    expect(VenueCategories.present('☕ Cafeterias e Docerias'), '☕ Cafeterias e Padarias');
    expect(VenueCategories.present('🎯 Lazer e Diversão'), '🎯 Jogos, Lazer e Diversão');
    expect(VenueCategories.resolve('🍣 Culinária Internacional'), '🍣 Culinária Asiática');
    expect(
      VenueCategories.present(VenueCategories.legacyLiveMusic),
      VenueCategories.legacyLiveMusic,
    );
    expect(
      VenueCategories.resolve(VenueCategories.legacyLiveMusic),
      VenueCategories.legacyLiveMusic,
    );
    expect(VenueCategories.selectionFor(VenueCategories.legacyLiveMusic), isNull);
    expect(
      VenueCategories.optionsFor(VenueCategories.legacyLiveMusic),
      isNot(contains(VenueCategories.legacyLiveMusic)),
    );
    expect(
      VenueCategories.selectionFor('🍣 Culinária Internacional'),
      '🍣 Culinária Asiática',
    );
  });

  test('comodidades novas e labels renomeados preservam as keys antigas', () {
    final keys = VenueAmenities.all.map((item) => item.key).toList();
    expect(keys, contains('hasLiveMusic'));
    expect(keys, contains('hasOwnParking'));
    expect(keys, contains('hasWifi'));
    expect(keys, contains('acceptsReservations'));
    expect(keys, contains('hasOutdoorArea'));
    expect(keys, contains('showsSportsBroadcasts'));
    expect(keys, contains('hasVegetarianOptions'));
    expect(keys, contains('hasVeganOptions'));
    expect(VenueAmenities.all.map((item) => item.label), contains('Acessibilidade'));
    expect(VenueAmenities.all.map((item) => item.label), contains('Benefício para aniversariantes'));
    expect(VenueAmenities.all.map((item) => item.label), contains('Opções sem glúten'));
    expect(VenueAmenities.all.map((item) => item.label), contains('Opções sem lactose'));
    expect(VenueAmenities.all.map((item) => item.label), isNot(contains('Acessível')));
    expect(keys, isNot(contains('hasCoverCharge')));
  });

  test('entrada gratuita e entrada paga formatam o valor existente', () {
    expect(
      formatVenueEntry(hasCoverCharge: false, coverCharge: '30,00'),
      'Entrada gratuita',
    );
    expect(
      formatVenueEntry(hasCoverCharge: true, coverCharge: '30,00'),
      'Entrada: R\$ 30,00',
    );
    expect(
      formatVenueEntry(hasCoverCharge: true, coverCharge: 'R\$ 15'),
      'Entrada: R\$ 15',
    );
  });
}
