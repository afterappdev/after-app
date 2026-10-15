import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

/// Tokens visuais da Home. A composição segue o mockup aprovado sem alterar
/// o [AppTheme.brand] usado nas demais telas.
class HomeVisual {
  const HomeVisual._();

  static const orange = AppTheme.accentOrange;
  static const purple = AppTheme.accentPurple;
  static const ink = AppTheme.ink;
  static const titleInk = Color(0xFF20242D);
  static const muted = Color(0xFF8B8B96);
  static const canvas = Color(0xFFF7F7F8);
  static const orangeCard = Color(0xFFFFF7F2);
  static const orangeSoft = Color(0xFFFFE8D6);
  static const orangeWash = Color(0xFFFFE3D0);
  static const purpleCard = Color(0xFFFBF8FE);
  static const purpleSoft = Color(0xFFEDE4F8);
  static const purpleWash = Color(0xFFE9DDF8);
  static const chipBorder = Color(0xFFE4E4E8);
  static const openBg = Color(0xFF22A45A);
  static const openFg = Colors.white;
  static const closedBg = Color(0xFF9A9AA3);
  static const closedFg = Colors.white;
  static const accountCityCaption = 'Sua cidade';
  static const selectedCityCaption = 'Cidade selecionada';

  /// Medidas compactas da Home original. A barra lateral entra por cima
  /// dessas medidas; a imagem e o texto não crescem.
  static const cardRadius = 16.0;
  static const accentBarWidth = 4.0;
  static const imageWidth = 108.0;
  static const titleFontSize = 16.0;
  static const dayChipHeight = 36.0;

  static const cardShadow = <BoxShadow>[
    BoxShadow(color: Color(0x0F000000), blurRadius: 14, offset: Offset(0, 4)),
  ];

  /// Coluna central da Home. Em telas largas o feed não estica com a viewport.
  static double columnMaxWidth(double viewportWidth) {
    if (viewportWidth >= 1100) return 600;
    if (viewportWidth >= 800) return 540;
    return 480;
  }

  static Color cardBackground(HomeAccentTone tone) {
    return tone == HomeAccentTone.promotion ? orangeCard : purpleCard;
  }

  static Color accent(HomeAccentTone tone) {
    return tone == HomeAccentTone.promotion ? orange : purple;
  }

  static Color iconBackground(HomeAccentTone tone) {
    return tone == HomeAccentTone.promotion ? orangeSoft : purpleSoft;
  }

  static Color headerWash(HomeAccentTone tone) {
    return tone == HomeAccentTone.promotion ? orangeWash : purpleWash;
  }
}

enum HomeAccentTone { promotion, venue }

/// Legenda do seletor. O GPS atual só fornece coordenadas para a distância e
/// não determina a cidade, então a legenda não usa "Sua localização atual".
/// Cidade da conta: "Sua cidade". Qualquer outra cidade escolhida no seletor:
/// "Cidade selecionada".
String? homeLocationCaption({
  required String displayedCity,
  required String displayedUf,
  required String profileCity,
  required String profileUf,
}) {
  final city = displayedCity.trim();
  final uf = displayedUf.trim();
  if (city.isEmpty || city == 'Sua cidade') return null;
  final sameCity =
      city.toLowerCase() == profileCity.trim().toLowerCase() &&
      uf.toLowerCase() == profileUf.trim().toLowerCase() &&
      profileCity.trim().isNotEmpty;
  if (sameCity) return HomeVisual.accountCityCaption;
  return HomeVisual.selectedCityCaption;
}

/// Selo de oferta sobre a imagem. Só quando o texto já traz um sinal comercial
/// explícito. Eventos e títulos sem desconto ficam sem o selo, e nenhum
/// percentual ou preço é inventado.
bool homePromotionShowsOfferMark({
  required String title,
  required String detail,
}) {
  final text = '${title.trim()} ${detail.trim()}'.toLowerCase();
  if (text.trim().isEmpty) return false;
  return RegExp(
    r'(?:%|\bdesconto\b|\boff\b|\bdobro\b|\bgr[aá]tis\b|\br\$\s*\d|\bmetade\b|\b2\s*por\s*1\b)',
  ).hasMatch(text);
}
