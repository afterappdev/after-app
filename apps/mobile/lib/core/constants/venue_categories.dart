class VenueCategories {
  static const legacyLiveMusic = '🎵 Música ao Vivo';

  static const renames = <String, String>{
    '☕ Cafeterias e Docerias': '☕ Cafeterias e Padarias',
    'Cafeterias e Docerias': '☕ Cafeterias e Padarias',
    '🍣 Culinária Internacional': '🍣 Culinária Asiática',
    'Culinária Internacional': '🍣 Culinária Asiática',
    '🎯 Lazer e Diversão': '⚽ Esportes, Lazer e Jogos',
    'Lazer e Diversão': '⚽ Esportes, Lazer e Jogos',
    '🎯 Jogos, Lazer e Diversão': '⚽ Esportes, Lazer e Jogos',
    'Jogos, Lazer e Diversão': '⚽ Esportes, Lazer e Jogos',
    '🍔 Hamburguerias': '🍔 Hamburguerias e Lanchonetes',
    'Hamburguerias': '🍔 Hamburguerias e Lanchonetes',
    '🎡 Food Park': '🍴 Food Park',
    'Food Park': '🍴 Food Park',
    '🎶 Karaokê': '🎤 Karaokê',
    'Karaokê': '🎤 Karaokê',
    '🍨 Sorveterias e Açaí': '🍦 Sorveterias e Açaí',
    'Sorveterias e Açaí': '🍦 Sorveterias e Açaí',
  };

  static const _catalog = [
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

  /// Name used for ordering. The leading emoji is not part of the sort key.
  static String labelName(String value) {
    final trimmed = value.trim();
    final space = trimmed.indexOf(' ');
    if (space < 0) return trimmed;
    return trimmed.substring(space + 1);
  }

  /// Options offered for selection. Alphabetical by [labelName].
  static final List<String> all = List<String>.unmodifiable(() {
    final items = [..._catalog];
    items.sort((a, b) => labelName(a).compareTo(labelName(b)));
    return items;
  }());

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
