import { readVipPushSlots } from './promo-push.slots';

describe('readVipPushSlots', () => {
  it('sem aprovação não escolhe horário', () => {
    expect(readVipPushSlots({})).toEqual([]);
    expect(readVipPushSlots({ PROMO_PUSH_VIP_SLOT_TIMES: '  ' })).toEqual([]);
  });

  it('aceita no máximo dois horários válidos', () => {
    expect(readVipPushSlots({ PROMO_PUSH_VIP_SLOT_TIMES: '10:00, 18:30' })).toEqual([
      { index: 1, minuteOfDay: 600 },
      { index: 2, minuteOfDay: 1110 },
    ]);
  });

  it('configuração inválida não agenda nada', () => {
    expect(readVipPushSlots({ PROMO_PUSH_VIP_SLOT_TIMES: '10:00,18:00,21:00' })).toEqual([]);
    expect(readVipPushSlots({ PROMO_PUSH_VIP_SLOT_TIMES: '25:00' })).toEqual([]);
    expect(readVipPushSlots({ PROMO_PUSH_VIP_SLOT_TIMES: '10:00,10:00' })).toEqual([]);
  });
});
