/// Calendar-day validity for promotion schedules.
///
/// Banner dates are stored as UTC midnight `YYYY-MM-DD` (`@db.Date`).
/// Comparing them with `DateTime.toLocal()` shifts the calendar day in
/// America/Sao_Paulo (UTC−3, no daylight saving). Expiry uses the date
/// prefix and the São Paulo civil day, so the validity day itself stays valid.
const saoPauloOffset = Duration(hours: -3);

DateTime? calendarDateOnly(dynamic value) {
  final raw = value?.toString() ?? '';
  final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(raw);
  if (match == null) return null;
  final year = int.parse(match.group(1)!);
  final month = int.parse(match.group(2)!);
  final day = int.parse(match.group(3)!);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return DateTime.utc(year, month, day);
}

/// Civil date in America/Sao_Paulo for [instant].
DateTime saoPauloCalendarDay(DateTime instant) {
  final shifted = instant.toUtc().add(saoPauloOffset);
  return DateTime.utc(shifted.year, shifted.month, shifted.day);
}

/// True when every schedule date is strictly before today in São Paulo.
/// Today is still valid. An empty schedule is not treated as expired.
bool isPromotionExpired(
  Iterable<dynamic> displayDates, {
  DateTime? utcNow,
}) {
  final today = saoPauloCalendarDay(utcNow ?? DateTime.now());
  DateTime? latest;
  for (final date in _scheduleDays(displayDates)) {
    if (latest == null || date.isAfter(latest)) latest = date;
  }
  if (latest == null) return false;
  return latest.isBefore(today);
}

Iterable<DateTime> _scheduleDays(Iterable<dynamic> displayDates) sync* {
  for (final raw in displayDates) {
    final date = calendarDateOnly(raw);
    if (date != null) yield date;
  }
}

/// Date printed on a still-valid card.
/// Today wins over any future day. Otherwise the next future day.
/// Past days are never chosen. Returns null when nothing remains.
DateTime? nextRelevantPromotionDate(
  Iterable<dynamic> displayDates, {
  DateTime? utcNow,
}) {
  final today = saoPauloCalendarDay(utcNow ?? DateTime.now());
  DateTime? nextFuture;
  for (final date in _scheduleDays(displayDates)) {
    if (date == today) return today;
    if (date.isAfter(today) && (nextFuture == null || date.isBefore(nextFuture))) {
      nextFuture = date;
    }
  }
  return nextFuture;
}

/// `DD/MM/YYYY` from the stored calendar day. Does not use the device timezone.
String formatCalendarDay(DateTime date) {
  final day = date.day.toString().padLeft(2, '0');
  final month = date.month.toString().padLeft(2, '0');
  return '$day/$month/${date.year}';
}

/// Formats a `@db.Date` value from its `YYYY-MM-DD` prefix.
String formatStoredCalendarDate(dynamic value) {
  final date = calendarDateOnly(value);
  if (date == null) return '';
  return formatCalendarDay(date);
}

class PromotionCardDate {
  const PromotionCardDate({required this.expired, this.dayLabel = ''});

  final bool expired;
  final String dayLabel;
}

/// Label for the public promotion card.
/// CANCELLED is never presented as expired.
PromotionCardDate promotionCardDate({
  required String? status,
  required Iterable<dynamic> displayDates,
  DateTime? utcNow,
}) {
  if (status == 'CANCELLED') {
    return const PromotionCardDate(expired: false);
  }
  final shown = nextRelevantPromotionDate(displayDates, utcNow: utcNow);
  if (shown != null) {
    return PromotionCardDate(expired: false, dayLabel: formatCalendarDay(shown));
  }
  if (isPromotionExpired(displayDates, utcNow: utcNow)) {
    return const PromotionCardDate(expired: true);
  }
  return const PromotionCardDate(expired: false);
}

/// CANCELLED is a status, not an expiry label.
bool showPromotionExpired({
  required String? status,
  required Iterable<dynamic> displayDates,
  DateTime? utcNow,
}) {
  if (status == 'CANCELLED') return false;
  return isPromotionExpired(displayDates, utcNow: utcNow);
}
