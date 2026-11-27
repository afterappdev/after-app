import 'venue_categories.dart';

class VenueMusicStyles {
  static const _catalog = [
    'Axé',
    'Eclético',
    'Eletrônica',
    'Flashback',
    'Forró',
    'Funk',
    'Hip Hop',
    'Latino',
    'MPB',
    'Pagode',
    'Pop',
    'Reggae',
    'Rock',
    'Samba',
    'Sertanejo',
    'Trap',
  ];

  static final List<String> all = List<String>.unmodifiable(_catalog);

  static String present(String? value) {
    final trimmed = value?.trim() ?? '';
    if (all.contains(trimmed)) return trimmed;
    return '';
  }

  static String? selectionFor(String? value) {
    final shown = present(value);
    return shown.isEmpty ? null : shown;
  }
}

String venueCategoryWithStyle(String? category, String? musicStyle) {
  return [
    VenueCategories.present(category),
    VenueMusicStyles.present(musicStyle),
  ].where((part) => part.isNotEmpty).join(' · ');
}
