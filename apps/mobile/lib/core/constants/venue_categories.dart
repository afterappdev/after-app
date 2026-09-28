class VenueCategories {
  static const legacyLiveMusic = '🎵 Música ao Vivo';

  static const renames = <String, String>{
    '☕ Cafeterias e Docerias': '☕ Cafeterias e Padarias',
    'Cafeterias e Docerias': '☕ Cafeterias e Padarias',
    '🍣 Culinária Internacional': '🍣 Culinária Asiática',
    'Culinária Internacional': '🍣 Culinária Asiática',
    '🎯 Lazer e Diversão': '🎯 Jogos, Lazer e Diversão',
    'Lazer e Diversão': '🎯 Jogos, Lazer e Diversão',
  };

  /// Options offered for new registrations. The emoji prefix is part of the stored value.
  static const all = [
    '🍽️ Restaurantes',
    '🍕 Pizzarias',
    '🍔 Hamburguerias',
    '🍻 Bares e Botecos',
    '🍺 Cervejarias e Choperias',
    '🎤 Casas de Show',
    '💃 Baladas e Boates',
    '🎸 Pubs',
    '🍸 Lounges e Rooftops',
    '☕ Cafeterias e Padarias',
    '🥩 Churrascarias e Steakhouses',
    '🍣 Culinária Asiática',
    '🎭 Entretenimento e Eventos',
    '🎯 Jogos, Lazer e Diversão',
    '🍨 Sorveterias e Açaí',
    '🎡 Food Park',
    '🥟 Pastelaria',
    '🎶 Karaokê',
    '🍷 Adegas e Wine Bars',
  ];

  /// Label shown by this app. Legacy live music stays readable and is not renamed.
  static String present(String? value) {
    if (value == null) return '';
    final trimmed = value.trim();
    if (trimmed.isEmpty) return '';
    return renames[trimmed] ?? trimmed;
  }

  /// Read mapping. Legacy live music resolves to itself so existing rows stay visible.
  static String? resolve(String? value) {
    final shown = present(value);
    if (shown.isEmpty) return null;
    if (all.contains(shown) || shown == legacyLiveMusic) return shown;
    return null;
  }

  /// Edit dropdown value. Legacy live music is not a valid choice and must be replaced.
  static String? selectionFor(String? value) {
    final resolved = resolve(value);
    if (resolved == null || resolved == legacyLiveMusic) return null;
    return resolved;
  }

  /// Current catalog only. Legacy live music is never offered.
  static List<String> optionsFor(String? current) {
    if (current == legacyLiveMusic) return all;
    return all;
  }
}
