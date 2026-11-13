// Cadastro de horários alinhado ao After Web (`venueHours.ts`).

const venueHoursDays = <({String key, String label})>[
  (key: 'mon', label: 'Segunda'),
  (key: 'tue', label: 'Terça'),
  (key: 'wed', label: 'Quarta'),
  (key: 'thu', label: 'Quinta'),
  (key: 'fri', label: 'Sexta'),
  (key: 'sat', label: 'Sábado'),
  (key: 'sun', label: 'Domingo'),
];

const hoursMetaKey = '_hoursMeta';

enum HoursMode { single, split }

class TimeSlot {
  const TimeSlot({required this.open, required this.close});

  final String open;
  final String close;

  TimeSlot copyWith({String? open, String? close}) {
    return TimeSlot(
      open: open ?? this.open,
      close: close ?? this.close,
    );
  }
}

class DayHoursForm {
  const DayHoursForm({required this.closed, required this.periods});

  final bool closed;
  final List<TimeSlot> periods;

  DayHoursForm copyWith({bool? closed, List<TimeSlot>? periods}) {
    return DayHoursForm(
      closed: closed ?? this.closed,
      periods: periods ?? this.periods,
    );
  }
}

class HoursFormState {
  const HoursFormState({required this.mode, required this.days});

  final HoursMode mode;
  final Map<String, DayHoursForm> days;

  HoursFormState copyWith({
    HoursMode? mode,
    Map<String, DayHoursForm>? days,
  }) {
    return HoursFormState(
      mode: mode ?? this.mode,
      days: days ?? this.days,
    );
  }
}

TimeSlot defaultTimeSlot() => const TimeSlot(open: '10:00', close: '22:00');

TimeSlot defaultSplitPeriod(int index) {
  if (index == 0) return const TimeSlot(open: '11:00', close: '14:30');
  return const TimeSlot(open: '18:00', close: '23:00');
}

String normalizeVenueTime(String value) {
  final trimmed = value.trim();
  final match = RegExp(r'^(\d{1,2}):(\d{2})$').firstMatch(trimmed);
  if (match == null) return trimmed;
  final h = match.group(1)!.padLeft(2, '0');
  return '$h:${match.group(2)!}';
}

HoursFormState createDefaultHoursForm() {
  final days = <String, DayHoursForm>{};
  for (final d in venueHoursDays) {
    days[d.key] = DayHoursForm(closed: false, periods: [defaultTimeSlot()]);
  }
  return HoursFormState(mode: HoursMode.single, days: days);
}

DayHoursForm? _parseLegacyDay(dynamic value) {
  if (value is! Map) return null;
  final row = Map<String, dynamic>.from(value);
  if (row['closed'] == true) {
    return DayHoursForm(closed: true, periods: [defaultTimeSlot()]);
  }
  final periodsRaw = row['periods'];
  if (periodsRaw is List && periodsRaw.isNotEmpty) {
    final periods = <TimeSlot>[];
    for (final p in periodsRaw) {
      if (p is! Map) continue;
      final open = p['open']?.toString();
      final close = p['close']?.toString();
      if (open == null || close == null) continue;
      periods.add(
        TimeSlot(
          open: normalizeVenueTime(open),
          close: normalizeVenueTime(close),
        ),
      );
    }
    if (periods.isNotEmpty) {
      return DayHoursForm(closed: false, periods: periods);
    }
  }
  final open = row['open']?.toString();
  final close = row['close']?.toString();
  if (open != null && close != null) {
    return DayHoursForm(
      closed: false,
      periods: [
        TimeSlot(
          open: normalizeVenueTime(open),
          close: normalizeVenueTime(close),
        ),
      ],
    );
  }
  return null;
}

HoursMode _inferModeFromDays(Map<String, DayHoursForm> days) {
  for (final d in venueHoursDays) {
    final day = days[d.key];
    if (day != null && !day.closed && day.periods.length > 1) {
      return HoursMode.split;
    }
  }
  return HoursMode.single;
}

HoursFormState parseHoursForm(Map<String, dynamic>? hoursJson) {
  final base = createDefaultHoursForm();
  if (hoursJson == null) return base;

  var mode = HoursMode.single;
  final meta = hoursJson[hoursMetaKey];
  if (meta is Map) {
    final m = meta['mode']?.toString();
    if (m == 'split') mode = HoursMode.split;
    if (m == 'single') mode = HoursMode.single;
  }

  final days = Map<String, DayHoursForm>.from(base.days);
  for (final d in venueHoursDays) {
    final parsed = _parseLegacyDay(hoursJson[d.key]);
    if (parsed != null) days[d.key] = parsed;
  }

  if (meta is! Map) {
    mode = _inferModeFromDays(days);
  }

  for (final d in venueHoursDays) {
    final day = days[d.key];
    if (day == null || day.closed) continue;
    if (mode == HoursMode.single && day.periods.length > 1) {
      days[d.key] = day.copyWith(periods: [day.periods.first]);
    }
    if (mode == HoursMode.split && day.periods.isEmpty) {
      days[d.key] = DayHoursForm(
        closed: false,
        periods: [defaultSplitPeriod(0), defaultSplitPeriod(1)],
      );
    }
    if (mode == HoursMode.split && day.periods.length == 1) {
      days[d.key] = day.copyWith(
        periods: [...day.periods, defaultSplitPeriod(1)],
      );
    }
  }

  return HoursFormState(mode: mode, days: days);
}

Map<String, dynamic> buildHoursJson(HoursFormState form) {
  final map = <String, dynamic>{
    hoursMetaKey: {
      'mode': form.mode == HoursMode.split ? 'split' : 'single',
    },
  };
  for (final d in venueHoursDays) {
    final row = form.days[d.key];
    if (row == null) continue;
    if (row.closed) {
      map[d.key] = {'closed': true};
      continue;
    }
    final periods = row.periods
        .map(
          (p) => {
            'open': normalizeVenueTime(p.open),
            'close': normalizeVenueTime(p.close),
          },
        )
        .toList();
    if (periods.length == 1) {
      map[d.key] = periods.first;
    } else {
      map[d.key] = {'closed': false, 'periods': periods};
    }
  }
  return map;
}

/// Texto para ficha pública (um ou dois intervalos).
String formatVenueDayHoursText(dynamic value) {
  if (value is! Map) return 'Fechado';
  final row = Map<String, dynamic>.from(value);
  if (row['closed'] == true) return 'Fechado';
  final periodsRaw = row['periods'];
  if (periodsRaw is List && periodsRaw.isNotEmpty) {
    final parts = <String>[];
    for (final p in periodsRaw) {
      if (p is! Map) continue;
      final open = p['open']?.toString();
      final close = p['close']?.toString();
      if (open != null && close != null) {
        parts.add('$open – $close');
      }
    }
    if (parts.isNotEmpty) return parts.join(' · ');
  }
  final open = row['open']?.toString();
  final close = row['close']?.toString();
  if (open != null && close != null) return '$open – $close';
  return 'Fechado';
}
