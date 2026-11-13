import 'package:after_app/features/venue/venue_hours.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('buildHoursJson período único usa open/close legado', () {
    final form = createDefaultHoursForm();
    final json = buildHoursJson(form);
    expect(json['mon'], {'open': '10:00', 'close': '22:00'});
    expect(json[hoursMetaKey], {'mode': 'single'});
  });

  test('parseHoursForm e buildHoursJson dois períodos', () {
    final loaded = parseHoursForm({
      'sat': {
        'closed': false,
        'periods': [
          {'open': '10:00', 'close': '22:00'},
          {'open': '18:00', 'close': '23:00'},
        ],
      },
      hoursMetaKey: {'mode': 'split'},
    });
    expect(loaded.mode, HoursMode.split);
    expect(loaded.days['sat']!.periods.length, 2);

    final json = buildHoursJson(loaded);
    expect(json['sat'], {
      'closed': false,
      'periods': [
        {'open': '10:00', 'close': '22:00'},
        {'open': '18:00', 'close': '23:00'},
      ],
    });
  });

  test('formatVenueDayHoursText junta intervalos', () {
    expect(
      formatVenueDayHoursText({
        'periods': [
          {'open': '11:00', 'close': '14:00'},
          {'open': '18:00', 'close': '23:00'},
        ],
      }),
      '11:00 – 14:00 · 18:00 – 23:00',
    );
  });
}
