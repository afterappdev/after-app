import { planPromoPushEvents } from './promo-push.plan';
import { VipPushSlot } from './promo-push.slots';

const now = new Date('2026-10-20T15:00:00.000Z');
const day = (isoDay: string) => new Date(`${isoDay}T00:00:00.000Z`);
const slots: VipPushSlot[] = [
  { index: 1, minuteOfDay: 10 * 60 },
  { index: 2, minuteOfDay: 18 * 60 },
];

function vip(id: string, isoDay: string) {
  return {
    id,
    displayDate: day(isoDay),
    ibgeCityId: 3550308,
    tier: 'VIP' as const,
    vipCreditEntryId: `proof-${id}`,
  };
}

describe('planPromoPushEvents', () => {
  it('agenda comum não gera push', () => {
    const drafts = planPromoPushEvents({
      bannerId: 'banner-1',
      venueId: 'venue-1',
      contentKind: null,
      now,
      slots,
      schedules: [
        {
          id: 'common',
          displayDate: day('2026-10-20'),
          ibgeCityId: 3550308,
          tier: 'COMMON',
          vipCreditEntryId: null,
        },
      ],
    });
    expect(drafts).toEqual([]);
  });

  it('dois slots futuros e nenhum horário já vencido na confirmação', () => {
    const drafts = planPromoPushEvents({
      bannerId: 'banner-1',
      venueId: 'venue-1',
      contentKind: 'PROMOTION',
      now,
      slots,
      schedules: [vip('today', '2026-10-20'), vip('future', '2026-10-21')],
    });

    expect(drafts.map((item) => [item.bannerScheduleId, item.slot])).toEqual([
      ['today', 2],
      ['future', 1],
      ['future', 2],
    ]);
    expect(drafts.find((item) => item.slot === 2 && item.bannerScheduleId === 'today')?.availableAt.toISOString()).toBe(
      '2026-10-20T21:00:00.000Z',
    );
    expect(drafts.every((item) => item.availableAt.getTime() > now.getTime())).toBe(true);
  });

  it('sem horários configurados não cria evento', () => {
    const drafts = planPromoPushEvents({
      bannerId: 'banner-1',
      venueId: 'venue-1',
      contentKind: null,
      now,
      slots: [],
      schedules: [vip('today', '2026-10-20')],
    });
    expect(drafts).toEqual([]);
  });

  it('dia passado e VIP sem comprovante ficam de fora', () => {
    const drafts = planPromoPushEvents({
      bannerId: 'banner-1',
      venueId: 'venue-1',
      contentKind: 'EVENT',
      now,
      slots,
      schedules: [
        vip('past', '2026-10-19'),
        { ...vip('unpaid', '2026-10-21'), vipCreditEntryId: null },
        { ...vip('unknown', '2026-10-21'), ibgeCityId: null },
      ],
    });
    expect(drafts).toEqual([]);
  });
});
