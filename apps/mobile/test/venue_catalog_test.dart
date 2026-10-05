import 'package:after_app/core/constants/venue_amenities.dart';
import 'package:after_app/core/constants/venue_categories.dart';
import 'package:flutter_test/flutter_test.dart';

const expectedCategories = [
  '🍷 Adegas e Wine Bars',
  '💃 Baladas e Boates',
  '🍻 Bares e Botecos',
  '☕ Cafeterias e Padarias',
  '🎤 Casas de Show',
  '🍺 Cervejarias e Choperias',
  '🥩 Churrascarias e Steakhouses',
  '🍣 Culinária Asiática',
  '🎭 Entretenimento e Eventos',
  '🍢 Espetaria',
  '⚽ Esportes, Lazer e Jogos',
  '🍴 Food Park',
  '🍔 Hamburguerias e Lanchonetes',
  '🎤 Karaokê',
  '🍸 Lounges e Rooftops',
  '🥟 Pastelaria',
  '🍕 Pizzarias',
  '🎸 Pubs',
  '🍽️ Restaurantes',
  '🥟 Salgaderia',
  '🎉 Serv-Festas',
  '🍦 Sorveterias e Açaí',
];

void main() {
  test('catálogo tem exatamente as 22 categorias, em ordem alfabética pelo nome', () {
    expect(VenueCategories.all, expectedCategories);
    expect(VenueCategories.all, contains('🍢 Espetaria'));
    expect(VenueCategories.all, contains('🥟 Salgaderia'));
    expect(VenueCategories.all, contains('🎉 Serv-Festas'));
    expect(VenueCategories.all, contains('⚽ Esportes, Lazer e Jogos'));
    expect(VenueCategories.all, contains('🍔 Hamburguerias e Lanchonetes'));
    expect(VenueCategories.all, isNot(contains('🎯 Jogos, Lazer e Diversão')));
    expect(VenueCategories.all, isNot(contains('🍔 Hamburguerias')));
    expect(VenueCategories.all, isNot(contains('🎵 Música ao Vivo')));
    expect(VenueCategories.all, isNot(contains('🍣 Culinária Internacional')));
    expect(VenueCategories.all, isNot(contains('🎡 Food Park')));
    expect(VenueCategories.all, isNot(contains('🎶 Karaokê')));
    expect(VenueCategories.all, isNot(contains('🍨 Sorveterias e Açaí')));

    final names = VenueCategories.all.map(VenueCategories.labelName).toList();
    final sorted = [...names]..sort();
    expect(names, sorted);
    expect(
      names,
      [
        'Adegas e Wine Bars',
        'Baladas e Boates',
        'Bares e Botecos',
        'Cafeterias e Padarias',
        'Casas de Show',
        'Cervejarias e Choperias',
        'Churrascarias e Steakhouses',
        'Culinária Asiática',
        'Entretenimento e Eventos',
        'Espetaria',
        'Esportes, Lazer e Jogos',
        'Food Park',
        'Hamburguerias e Lanchonetes',
        'Karaokê',
        'Lounges e Rooftops',
        'Pastelaria',
        'Pizzarias',
        'Pubs',
        'Restaurantes',
        'Salgaderia',
        'Serv-Festas',
        'Sorveterias e Açaí',
      ],
    );
  });

  test('cadastro, edição e filtros usam o mesmo catálogo ordenado', () {
    expect(VenueCategories.optionsFor(null), expectedCategories);
    expect(VenueCategories.optionsFor('🍻 Bares e Botecos'), expectedCategories);
    expect(
      VenueCategories.optionsFor(VenueCategories.legacyLiveMusic),
      expectedCategories,
    );
    expect(
      VenueCategories.optionsFor(null),
      isNot(contains(VenueCategories.legacyLiveMusic)),
    );
  });

  test('renomeia labels na exibição e exige troca da categoria legada ao editar', () {
    expect(VenueCategories.present('🍣 Culinária Internacional'), '🍣 Culinária Asiática');
    expect(VenueCategories.present('☕ Cafeterias e Docerias'), '☕ Cafeterias e Padarias');
    expect(VenueCategories.present('🎯 Lazer e Diversão'), '⚽ Esportes, Lazer e Jogos');
    expect(
      VenueCategories.present('🎯 Jogos, Lazer e Diversão'),
      '⚽ Esportes, Lazer e Jogos',
    );
    expect(VenueCategories.present('Jogos, Lazer e Diversão'), '⚽ Esportes, Lazer e Jogos');
    expect(VenueCategories.present('🍔 Hamburguerias'), '🍔 Hamburguerias e Lanchonetes');
    expect(VenueCategories.present('Hamburguerias'), '🍔 Hamburguerias e Lanchonetes');
    expect(VenueCategories.present('🎡 Food Park'), '🍴 Food Park');
    expect(VenueCategories.present('🎶 Karaokê'), '🎤 Karaokê');
    expect(VenueCategories.present('🍨 Sorveterias e Açaí'), '🍦 Sorveterias e Açaí');
    expect(VenueCategories.present('🍢 Espetaria'), '🍢 Espetaria');
    expect(VenueCategories.resolve('🍣 Culinária Internacional'), '🍣 Culinária Asiática');
    expect(
      VenueCategories.selectionFor('🎯 Jogos, Lazer e Diversão'),
      '⚽ Esportes, Lazer e Jogos',
    );
    expect(
      VenueCategories.selectionFor('🎯 Lazer e Diversão'),
      '⚽ Esportes, Lazer e Jogos',
    );
    expect(
      VenueCategories.selectionFor('🍔 Hamburguerias'),
      '🍔 Hamburguerias e Lanchonetes',
    );
    expect(VenueCategories.selectionFor('🍢 Espetaria'), '🍢 Espetaria');
    expect(VenueCategories.selectionFor('🥟 Salgaderia'), '🥟 Salgaderia');
    expect(VenueCategories.selectionFor('🎉 Serv-Festas'), '🎉 Serv-Festas');
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
