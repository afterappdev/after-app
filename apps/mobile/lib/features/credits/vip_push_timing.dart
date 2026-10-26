import '../venue/promo_validity.dart';

/// Official VIP push slots in America/Sao_Paulo (mirrors API `vip-push-timing.ts`).
enum VipPushTiming { immediate, slot11, slot17 }

const _slot11Minutes = 11 * 60;
const _slot17Minutes = 17 * 60;

String spCivilDateLabel(DateTime instant) {
  final day = saoPauloCalendarDay(instant);
  final y = day.year.toString().padLeft(4, '0');
  final m = day.month.toString().padLeft(2, '0');
  final d = day.day.toString().padLeft(2, '0');
  return '$y-$m-$d';
}

int minutesSinceMidnightSp(DateTime instant) {
  final shifted = instant.toUtc().add(saoPauloOffset);
  return shifted.hour * 60 + shifted.minute;
}

List<VipPushTiming> allowedVipPushTimingsForDateLabel(
  String displayDate,
  DateTime now,
) {
  final match = RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(displayDate);
  if (!match) return [];
  final today = spCivilDateLabel(now);
  final cmp = displayDate.compareTo(today);
  if (cmp < 0) return [];
  if (cmp > 0) return [VipPushTiming.slot11, VipPushTiming.slot17];
  final minutes = minutesSinceMidnightSp(now);
  if (minutes < _slot11Minutes) {
    return [VipPushTiming.slot11, VipPushTiming.slot17];
  }
  if (minutes < _slot17Minutes) {
    return [VipPushTiming.slot17, VipPushTiming.immediate];
  }
  return [VipPushTiming.immediate];
}

List<VipPushTiming> allowedVipPushTimingsForAllDateLabels(
  Iterable<String> displayDates,
  DateTime now,
) {
  final list = displayDates.toList();
  if (list.isEmpty) return [];
  var options = allowedVipPushTimingsForDateLabel(list.first, now);
  for (var i = 1; i < list.length; i++) {
    final next = allowedVipPushTimingsForDateLabel(list[i], now);
    options = options.where(next.contains).toList();
  }
  return options;
}

String vipPushTimingApiValue(VipPushTiming timing) {
  switch (timing) {
    case VipPushTiming.immediate:
      return 'IMMEDIATE';
    case VipPushTiming.slot11:
      return 'SLOT_11';
    case VipPushTiming.slot17:
      return 'SLOT_17';
  }
}

String labelVipPushTiming(VipPushTiming timing) {
  switch (timing) {
    case VipPushTiming.immediate:
      return 'Envio imediato';
    case VipPushTiming.slot11:
      return '11:00 (horário oficial)';
    case VipPushTiming.slot17:
      return '17:00 (horário oficial)';
  }
}

String vipPushScheduleSummary({
  required Iterable<String> displayDates,
  required VipPushTiming timing,
}) {
  final dates = displayDates.toList()..sort();
  final br = dates
      .map((raw) {
        final parts = raw.split('-');
        if (parts.length != 3) return raw;
        return '${parts[2]}/${parts[1]}/${parts[0]}';
      })
      .join(', ');
  return '$br • ${labelVipPushTiming(timing)}';
}
