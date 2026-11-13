import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import 'venue_hours.dart';
import 'venue_time_hm_input.dart';

const _accent = Color(0xFFF58634);

class VenueHoursEditor extends StatefulWidget {
  const VenueHoursEditor({
    super.key,
    required this.value,
    required this.onChanged,
  });

  final HoursFormState value;
  final ValueChanged<HoursFormState> onChanged;

  @override
  State<VenueHoursEditor> createState() => _VenueHoursEditorState();
}

class _VenueHoursEditorState extends State<VenueHoursEditor> {
  final Map<String, TextEditingController> _controllers = {};

  @override
  void initState() {
    super.initState();
    _syncControllers(widget.value, force: true);
  }

  @override
  void didUpdateWidget(covariant VenueHoursEditor oldWidget) {
    super.didUpdateWidget(oldWidget);
    _syncControllers(widget.value);
  }

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  String _ctrlKey(String day, int period, String field) => '$day-$period-$field';

  TextEditingController _controllerFor(String day, int period, String field, String initial) {
    final key = _ctrlKey(day, period, field);
    final existing = _controllers[key];
    if (existing != null) return existing;
    final c = TextEditingController(text: normalizeVenueTime(initial));
    c.addListener(() {
      if (!mounted) return;
      _commitPeriod(day, period);
    });
    _controllers[key] = c;
    return c;
  }

  void _syncControllers(HoursFormState state, {bool force = false}) {
    for (final d in venueHoursDays) {
      final day = state.days[d.key];
      if (day == null) continue;
      final count = state.mode == HoursMode.split ? 2 : 1;
      for (var i = 0; i < count; i++) {
        final slot = i < day.periods.length
            ? day.periods[i]
            : defaultSplitPeriod(i);
        for (final entry in [('open', slot.open), ('close', slot.close)]) {
          final key = _ctrlKey(d.key, i, entry.$1);
          final next = normalizeVenueTime(entry.$2);
          final existing = _controllers[key];
          if (existing == null) {
            _controllers[key] = TextEditingController(text: next);
            continue;
          }
          if (force || existing.text != next) {
            existing.text = next;
          }
        }
      }
    }
    if (!force) return;
    // Drop stale controllers after mode/day shape changes on next rebuild.
  }

  void _setMode(HoursMode mode) {
    if (mode == widget.value.mode) return;
    final nextDays = <String, DayHoursForm>{};
    for (final d in venueHoursDays) {
      final day = widget.value.days[d.key];
      if (day == null) continue;
      if (day.closed) {
        nextDays[d.key] = day;
        continue;
      }
      if (mode == HoursMode.single) {
        final first = day.periods.isNotEmpty ? day.periods.first : defaultTimeSlot();
        nextDays[d.key] = day.copyWith(periods: [first]);
      } else {
        final first = day.periods.isNotEmpty ? day.periods[0] : defaultSplitPeriod(0);
        final second = day.periods.length > 1 ? day.periods[1] : defaultSplitPeriod(1);
        nextDays[d.key] = day.copyWith(periods: [first, second]);
      }
    }
    final next = widget.value.copyWith(mode: mode, days: nextDays);
    widget.onChanged(next);
    _syncControllers(next, force: true);
  }

  void _toggleDay(String key) {
    final day = widget.value.days[key];
    if (day == null) return;
    final closed = !day.closed;
    final nextDay = closed
        ? day.copyWith(closed: true)
        : day.copyWith(
            closed: false,
            periods: widget.value.mode == HoursMode.split
                ? [defaultSplitPeriod(0), defaultSplitPeriod(1)]
                : [day.periods.isNotEmpty ? day.periods.first : defaultTimeSlot()],
          );
  widget.onChanged(
      widget.value.copyWith(
        days: {...widget.value.days, key: nextDay},
      ),
    );
  }

  void _commitPeriod(String dayKey, int index) {
    final day = widget.value.days[dayKey];
    if (day == null || day.closed) return;
    final open = normalizeVenueTime(
      _controllerFor(dayKey, index, 'open', '10:00').text,
    );
    final close = normalizeVenueTime(
      _controllerFor(dayKey, index, 'close', '22:00').text,
    );
    final periods = [...day.periods];
    while (periods.length <= index) {
      periods.add(defaultSplitPeriod(periods.length));
    }
    periods[index] = TimeSlot(open: open, close: close);
    widget.onChanged(
      widget.value.copyWith(
        days: {...widget.value.days, dayKey: day.copyWith(periods: periods)},
      ),
    );
  }

  Widget _modeButton(String label, HoursMode mode) {
    final selected = widget.value.mode == mode;
    return Expanded(
      child: Material(
        color: selected ? _accent : Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(
            color: selected ? _accent : const Color(0xFFE8E8EE),
          ),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () => _setMode(mode),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Text(
              label,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: selected ? Colors.white : const Color(0xFF282829),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _periodLine({
    required String dayKey,
    required int index,
  }) {
    final open = _controllerFor(dayKey, index, 'open', '10:00');
    final close = _controllerFor(dayKey, index, 'close', '22:00');
    return Row(
      mainAxisAlignment: MainAxisAlignment.start,
      children: [
        VenueHmTimeInput(
          controller: open,
        ),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 4),
          child: Text(
            'às',
            style: TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontSize: 12,
              color: Color(0xFF8B8B96),
            ),
          ),
        ),
        VenueHmTimeInput(
          controller: close,
        ),
      ],
    );
  }

  Widget _dayRow(String key, String label) {
    final day = widget.value.days[key];
    if (day == null) return const SizedBox.shrink();

    if (day.closed) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          children: [
            SizedBox(
              height: 32,
              child: FittedBox(
                child: Switch(
                  value: false,
                  onChanged: (_) => _toggleDay(key),
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  activeThumbColor: Colors.white,
                  activeTrackColor: _accent,
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                label,
                style: const TextStyle(
                  fontFamily: AppTheme.fontFamily,
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                  color: Color(0xFF282829),
                ),
              ),
            ),
            const Text(
              'Fechado',
              style: TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontSize: 12,
                color: Color(0xFF8B8B96),
              ),
            ),
          ],
        ),
      );
    }

    if (widget.value.mode == HoursMode.single) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          children: [
            SizedBox(
              height: 32,
              child: FittedBox(
                child: Switch(
                  value: true,
                  onChanged: (_) => _toggleDay(key),
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  activeThumbColor: Colors.white,
                  activeTrackColor: _accent,
                ),
              ),
            ),
            const SizedBox(width: 8),
            SizedBox(
              width: 68,
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontFamily: AppTheme.fontFamily,
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                  color: Color(0xFF282829),
                ),
              ),
            ),
            Expanded(
              child: Focus(
                onFocusChange: (_) => _commitPeriod(key, 0),
                child: _periodLine(dayKey: key, index: 0),
              ),
            ),
          ],
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              SizedBox(
                height: 32,
                child: FittedBox(
                  child: Switch(
                    value: true,
                    onChanged: (_) => _toggleDay(key),
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    activeThumbColor: Colors.white,
                    activeTrackColor: _accent,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  label,
                  style: const TextStyle(
                    fontFamily: AppTheme.fontFamily,
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                    color: Color(0xFF282829),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Focus(
            onFocusChange: (_) => _commitPeriod(key, 0),
            child: _periodLine(dayKey: key, index: 0),
          ),
          const SizedBox(height: 4),
          Focus(
            onFocusChange: (_) => _commitPeriod(key, 1),
            child: _periodLine(dayKey: key, index: 1),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          'MODELO DE FUNCIONAMENTO',
          style: TextStyle(
            fontFamily: AppTheme.fontFamily,
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.4,
            color: Color(0xFF8B8B96),
          ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            _modeButton('Período único', HoursMode.single),
            const SizedBox(width: 8),
            _modeButton('Dois períodos', HoursMode.split),
          ],
        ),
        const SizedBox(height: 12),
        for (var i = 0; i < venueHoursDays.length; i++) ...[
          if (i > 0) const Divider(height: 1, color: Color(0xFFE8E8EE)),
          _dayRow(venueHoursDays[i].key, venueHoursDays[i].label),
        ],
      ],
    );
  }
}
