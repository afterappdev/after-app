import 'package:after_app/features/credits/vip_push_timing.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('10h SP permite 11h e 17h no mesmo dia', () {
    final now = DateTime.utc(2026, 10, 26, 13); // 10:00 SP
    expect(
      allowedVipPushTimingsForDateLabel('2026-10-26', now),
      [VipPushTiming.slot11, VipPushTiming.slot17],
    );
  });

  test('14h SP permite 17h e imediato', () {
    final now = DateTime.utc(2026, 10, 26, 17); // 14:00 SP
    expect(
      allowedVipPushTimingsForDateLabel('2026-10-26', now),
      [VipPushTiming.slot17, VipPushTiming.immediate],
    );
  });

  test('19h SP permite apenas imediato hoje', () {
    final now = DateTime.utc(2026, 10, 26, 22); // 19:00 SP
    expect(
      allowedVipPushTimingsForDateLabel('2026-10-26', now),
      [VipPushTiming.immediate],
    );
  });

  test('data futura permite 11h e 17h', () {
    final now = DateTime.utc(2026, 10, 26, 22);
    expect(
      allowedVipPushTimingsForDateLabel('2026-10-28', now),
      [VipPushTiming.slot11, VipPushTiming.slot17],
    );
  });
}
