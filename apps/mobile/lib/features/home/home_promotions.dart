// Ordenação e elegibilidade do destaque VIP na Home.
//
// O destaque usa somente `featured` da publicação já filtrada pela data
// pedida. `tier == VIP` sem `featured` continua comum. Campos financeiros
// não entram nessa decisão.

DateTime? homePromotionCivilDate(dynamic raw) {
  final text = raw?.toString().trim() ?? '';
  final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(text);
  if (match == null) return null;
  return DateTime.utc(
    int.parse(match.group(1)!),
    int.parse(match.group(2)!),
    int.parse(match.group(3)!),
  );
}

bool homePromotionIsFeatured(
  Map<dynamic, dynamic> item, {
  DateTime? selectedDay,
}) {
  if (item['featured'] != true) return false;
  if (selectedDay == null) return true;
  final civil = homePromotionCivilDate(item['displayDate']);
  if (civil == null) return true;
  return civil.year == selectedDay.year &&
      civil.month == selectedDay.month &&
      civil.day == selectedDay.day;
}

bool homePromotionIsListed(Map<dynamic, dynamic> item) {
  if (_hiddenStatus(item['status']) || _hiddenStatus(item['bannerStatus'])) {
    return false;
  }
  final venue = item['venue'];
  if (venue is Map) {
    if (venue['blocked'] == true) return false;
    if (venue['moderationHiddenAt'] != null) return false;
    final venueStatus = venue['status']?.toString().toUpperCase() ?? '';
    if (venueStatus == 'BLOCKED' || venueStatus == 'HIDDEN') return false;
  }
  return true;
}

bool _hiddenStatus(dynamic raw) {
  switch (raw?.toString().toUpperCase()) {
    case 'CANCELLED':
    case 'CANCELED':
    case 'REJECTED':
    case 'HIDDEN':
    case 'BLOCKED':
      return true;
    default:
      return false;
  }
}

/// VIPs da data selecionada primeiro. A ordem relativa de cada grupo permanece.
List<dynamic> orderHomePromotions(
  List<dynamic> items, {
  DateTime? selectedDay,
}) {
  final featured = <dynamic>[];
  final common = <dynamic>[];
  for (final item in items) {
    if (item is! Map) continue;
    if (!homePromotionIsListed(item)) continue;
    if (homePromotionIsFeatured(item, selectedDay: selectedDay)) {
      featured.add(item);
    } else {
      common.add(item);
    }
  }
  return [...featured, ...common];
}
