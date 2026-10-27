import { BadRequestException } from '@nestjs/common';
import {
  allowedVipPushTimings,
  allowedVipPushTimingsByDate,
  allowedVipPushTimingsForAllDates,
  minutesSinceMidnightSp,
  normalizeVipPublicationInput,
  planVipPushEventForSchedule,
  validateVipPublicationPlans,
  VIP_PUSH_IMMEDIATE_SLOT,
} from './vip-push-timing';

const sp = (iso: string) => new Date(iso);

describe('allowedVipPushTimings', () => {
  it('10h de SP permite 11h e 17h no mesmo dia', () => {
    const now = sp('2026-10-26T13:00:00.000Z'); // 10:00 SP (UTC-3)
    expect(allowedVipPushTimings('2026-10-26', now)).toEqual([
      'SLOT_11',
      'SLOT_17',
    ]);
  });

  it('14h de SP permite 17h e imediato', () => {
    const now = sp('2026-10-26T17:00:00.000Z'); // 14:00 SP
    expect(allowedVipPushTimings('2026-10-26', now)).toEqual([
      'SLOT_17',
      'IMMEDIATE',
    ]);
  });

  it('19h de SP permite apenas imediato no mesmo dia', () => {
    const now = sp('2026-10-26T22:00:00.000Z'); // 19:00 SP
    expect(allowedVipPushTimings('2026-10-26', now)).toEqual(['IMMEDIATE']);
  });

  it('exatamente 11h não permite slot 11h retroativo', () => {
    const now = sp('2026-10-26T14:00:00.000Z'); // 11:00 SP
    expect(allowedVipPushTimings('2026-10-26', now)).not.toContain('SLOT_11');
  });

  it('10:59:59 SP ainda permite slot 11h', () => {
    const now = sp('2026-10-26T13:59:59.000Z');
    expect(allowedVipPushTimings('2026-10-26', now)).toEqual([
      'SLOT_11',
      'SLOT_17',
    ]);
  });

  it('16:59:59 SP permite 17h e imediato', () => {
    const now = sp('2026-10-26T19:59:59.000Z');
    expect(allowedVipPushTimings('2026-10-26', now)).toEqual([
      'SLOT_17',
      'IMMEDIATE',
    ]);
  });

  it('exatamente 17h não permite slots programados no mesmo dia', () => {
    const now = sp('2026-10-26T20:00:00.000Z'); // 17:00 SP
    expect(allowedVipPushTimings('2026-10-26', now)).toEqual(['IMMEDIATE']);
  });

  it('data futura permite 11h e 17h', () => {
    const now = sp('2026-10-26T22:00:00.000Z');
    expect(allowedVipPushTimings('2026-10-28', now)).toEqual([
      'SLOT_11',
      'SLOT_17',
    ]);
  });

  it('19h permite imediato hoje ou data futura programada', () => {
    const now = sp('2026-10-26T22:00:00.000Z');
    expect(allowedVipPushTimingsForAllDates(['2026-10-26'], now)).toEqual([
      'IMMEDIATE',
    ]);
    expect(allowedVipPushTimingsForAllDates(['2026-10-27'], now)).toEqual([
      'SLOT_11',
      'SLOT_17',
    ]);
  });
});

describe('validateVipPublicationPlans', () => {
  it('rejeita horário passado manipulado', () => {
    const now = sp('2026-10-26T17:00:00.000Z'); // 14h SP
    expect(() =>
      validateVipPublicationPlans(
        [{ date: '2026-10-26', pushTiming: 'SLOT_11' }],
        now,
      ),
    ).toThrow(BadRequestException);
  });

  it('rejeita IMMEDIATE em data futura', () => {
    const now = sp('2026-10-26T22:00:00.000Z');
    expect(() =>
      validateVipPublicationPlans(
        [{ date: '2026-10-28', pushTiming: 'IMMEDIATE' }],
        now,
      ),
    ).toThrow(BadRequestException);
  });
});

describe('allowedVipPushTimingsByDate', () => {
  it('expõe opções independentes por dia', () => {
    const now = sp('2026-10-26T22:00:00.000Z'); // 19h SP hoje
    expect(
      allowedVipPushTimingsByDate(['2026-10-26', '2026-10-28'], now),
    ).toEqual({
      '2026-10-26': ['IMMEDIATE'],
      '2026-10-28': ['SLOT_11', 'SLOT_17'],
    });
  });
});

describe('normalizeVipPublicationInput', () => {
  const now = sp('2026-10-25T15:00:00.000Z');

  it('aceita cliente legado só com vipDates', () => {
    expect(
      normalizeVipPublicationInput(['2099-06-10', '2099-06-11'], undefined, now),
    ).toEqual({
      vipDates: ['2099-06-10', '2099-06-11'],
      plans: [],
      inputMode: 'legacy_vip_dates_only',
    });
  });

  it('rejeita vipPublications vazio com vipDates', () => {
    expect(() =>
      normalizeVipPublicationInput(['2099-06-10'], [], now),
    ).toThrow(BadRequestException);
  });

  it('rejeita conjuntos de datas divergentes', () => {
    expect(() =>
      normalizeVipPublicationInput(
        ['2099-06-10'],
        [{ date: '2099-06-11', pushTiming: 'SLOT_11' }],
        now,
      ),
    ).toThrow(BadRequestException);
  });

  it('aceita vipPublications explícito', () => {
    expect(
      normalizeVipPublicationInput(
        undefined,
        [
          { date: '2099-06-10', pushTiming: 'SLOT_11' },
          { date: '2099-06-11', pushTiming: 'SLOT_17' },
        ],
        now,
      ),
    ).toMatchObject({
      inputMode: 'explicit_vip_publications',
      plans: [
        { date: '2099-06-10', pushTiming: 'SLOT_11' },
        { date: '2099-06-11', pushTiming: 'SLOT_17' },
      ],
    });
  });
});

describe('planVipPushEventForSchedule', () => {
  const day = new Date('2026-10-26T00:00:00.000Z');

  it('imediato gera um evento slot 0', () => {
    const now = sp('2026-10-26T22:00:00.000Z');
    const draft = planVipPushEventForSchedule({
      schedule: {
        id: 'sch-1',
        displayDate: day,
        ibgeCityId: 3550308,
        tier: 'VIP',
        vipCreditEntryId: 'proof',
        pushTiming: 'IMMEDIATE',
      },
      bannerId: 'b1',
      venueId: 'v1',
      contentKind: null,
      now,
    });
    expect(draft?.slot).toBe(VIP_PUSH_IMMEDIATE_SLOT);
    expect(draft?.availableAt.getTime()).toBe(now.getTime());
  });

  it('data futura às 11h gera um único evento', () => {
    const now = sp('2026-10-25T15:00:00.000Z');
    const future = new Date('2026-10-28T00:00:00.000Z');
    const draft = planVipPushEventForSchedule({
      schedule: {
        id: 'sch-2',
        displayDate: future,
        ibgeCityId: 3550308,
        tier: 'VIP',
        vipCreditEntryId: 'proof',
        pushTiming: 'SLOT_11',
      },
      bannerId: 'b1',
      venueId: 'v1',
      contentKind: 'PROMOTION',
      now,
    });
    expect(draft?.slot).toBe(1);
    expect(draft!.availableAt.getTime()).toBeGreaterThan(now.getTime());
  });
});

describe('minutesSinceMidnightSp', () => {
  it('calcula minutos em SP', () => {
    expect(minutesSinceMidnightSp(sp('2026-10-26T14:00:00.000Z'))).toBe(11 * 60);
  });
});
