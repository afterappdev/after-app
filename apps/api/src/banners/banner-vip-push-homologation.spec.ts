import { BadRequestException } from '@nestjs/common';
import { planPromoPushEvents } from '../promo-push/promo-push.plan';
import { hashBannerCreateRequest } from './banner-create-idempotency';
import { quotePublication } from './banner-quote';
import {
  normalizeVipPublicationInput,
  planVipPushEventForSchedule,
} from '../promo-push/vip-push-timing';

const VIP_DAY = new Date('2099-06-10T00:00:00.000Z');
const slots = [
  { index: 1, minuteOfDay: 11 * 60 },
  { index: 2, minuteOfDay: 17 * 60 },
];

describe('homologação VIP push (unitária, sem FCM)', () => {
  const now = new Date('2099-06-09T18:00:00.000Z');

  it('1–2: um dia e multidata explícita', () => {
    const one = normalizeVipPublicationInput(
      undefined,
      [{ date: '2099-06-10', pushTiming: 'SLOT_11' }],
      now,
    );
    expect(one.plans).toHaveLength(1);
    const multi = normalizeVipPublicationInput(
      undefined,
      [
        { date: '2099-06-10', pushTiming: 'SLOT_11' },
        { date: '2099-06-11', pushTiming: 'SLOT_17' },
      ],
      now,
    );
    expect(multi.plans).toHaveLength(2);
  });

  it('3: créditos VIP = número de dias', () => {
    const q = quotePublication({
      dates: [],
      vipDates: ['2099-06-10', '2099-06-11'],
      creditPerDisplayDay: 1,
    });
    expect(q.vipCredits).toBe(2);
    expect(q.commonCredits).toBe(0);
  });

  it('4–5: um evento por schedule com timing e idempotência de hash', () => {
    const draft = planVipPushEventForSchedule({
      schedule: {
        id: 's1',
        displayDate: VIP_DAY,
        ibgeCityId: 3550308,
        tier: 'VIP',
        vipCreditEntryId: 'e1',
        pushTiming: 'SLOT_11',
      },
      bannerId: 'b1',
      venueId: 'v1',
      contentKind: null,
      now,
    });
    expect(draft?.slot).toBe(1);
    const h1 = hashBannerCreateRequest({
      imageUrl: 'https://x/a.jpg',
      dates: [],
      vipDates: ['2099-06-10'],
      vipPublications: [{ date: '2099-06-10', pushTiming: 'SLOT_11' }],
    });
    const h2 = hashBannerCreateRequest({
      imageUrl: 'https://x/a.jpg',
      dates: [],
      vipDates: ['2099-06-10'],
      vipPublications: [{ date: '2099-06-10', pushTiming: 'SLOT_17' }],
    });
    expect(h1).not.toBe(h2);
  });

  it('13–15: legado, novo e payload misto inválido', () => {
    expect(
      normalizeVipPublicationInput(['2099-06-10'], undefined, now).inputMode,
    ).toBe('legacy_vip_dates_only');
    expect(
      normalizeVipPublicationInput(undefined, [
        { date: '2099-06-10', pushTiming: 'SLOT_11' },
      ], now).inputMode,
    ).toBe('explicit_vip_publications');
    expect(() =>
      normalizeVipPublicationInput(
        ['2099-06-10'],
        [{ date: '2099-06-11', pushTiming: 'SLOT_11' }],
        now,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      normalizeVipPublicationInput(['2099-06-10'], [], now),
    ).toThrow(BadRequestException);
  });

  it('16: publicação comum não planeja push VIP', () => {
    const events = planPromoPushEvents({
      bannerId: 'b',
      venueId: 'v',
      contentKind: null,
      schedules: [
        {
          id: 'c1',
          displayDate: VIP_DAY,
          ibgeCityId: 3550308,
          tier: 'COMMON',
        },
      ],
      slots,
      now,
    });
    expect(events).toHaveLength(0);
  });

  it('legado: no máximo um evento por agendamento VIP', () => {
    const events = planPromoPushEvents({
      bannerId: 'b',
      venueId: 'v',
      contentKind: null,
      schedules: [
        {
          id: 'v1',
          displayDate: VIP_DAY,
          ibgeCityId: 3550308,
          tier: 'VIP',
          vipCreditEntryId: 'proof',
          pushTiming: null,
        },
      ],
      slots,
      now,
    });
    expect(events.length).toBe(1);
    expect(events[0]?.slot).toBe(1);
  });
});
