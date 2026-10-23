import { Prisma } from '@prisma/client';
import { LocationsService } from '../locations/locations.service';
import { PrismaService } from '../prisma/prisma.service';
import { planPromoPushEvents } from './promo-push.plan';
import { PromoPushPublisherService } from './promo-push.publisher';

describe('PromoPushPublisherService', () => {
  const locations = {
    resolveMunicipalityId: jest.fn(async () => 3550308),
  };
  const updates: unknown[] = [];
  const prisma = {
    promoPushEvent: {
      updateMany: jest.fn(async (args) => {
        updates.push(args);
        return { count: 1 };
      }),
    },
  };

  function writer() {
    const rows: { bannerScheduleId: string; slot: number }[] = [];
    const tx = {
      promoPushEvent: {
        createMany: async ({
          data,
          skipDuplicates,
        }: {
          data: { bannerScheduleId: string; slot: number }[];
          skipDuplicates?: boolean;
        }) => {
          for (const row of data) {
            if (
              skipDuplicates &&
              rows.some(
                (item) =>
                  item.bannerScheduleId === row.bannerScheduleId &&
                  item.slot === row.slot,
              )
            ) {
              continue;
            }
            rows.push(row);
          }
          return { count: rows.length };
        },
      },
    };
    return { rows, tx: tx as unknown as Prisma.TransactionClient };
  }

  const service = new PromoPushPublisherService(
    locations as unknown as LocationsService,
    prisma as unknown as PrismaService,
  );

  it('reprocessar a mesma agenda não duplica e republicar cria outro evento', async () => {
    const previous = process.env.PROMO_PUSH_VIP_SLOT_TIMES;
    process.env.PROMO_PUSH_VIP_SLOT_TIMES = '18:00';
    try {
      const { rows, tx } = writer();
      const input = {
        bannerId: 'banner-1',
        venueId: 'venue-1',
        contentKind: null,
        now: new Date('2026-10-20T15:00:00.000Z'),
        schedules: [
          {
            id: 'sch-1',
            displayDate: new Date('2026-10-20T00:00:00.000Z'),
            ibgeCityId: 3550308,
            tier: 'VIP' as const,
            vipCreditEntryId: 'proof-1',
          },
        ],
      };
      await service.recordSchedules(tx, input);
      await service.recordSchedules(tx, input);
      await service.recordSchedules(tx, {
        ...input,
        bannerId: 'banner-2',
        schedules: [{ ...input.schedules[0], id: 'sch-2', vipCreditEntryId: 'proof-2' }],
      });
      expect(rows.map((row) => row.bannerScheduleId)).toEqual(['sch-1', 'sch-2']);
      expect(planPromoPushEvents({ ...input, slots: [{ index: 1, minuteOfDay: 18 * 60 }] })).toHaveLength(1);
    } finally {
      if (previous == null) delete process.env.PROMO_PUSH_VIP_SLOT_TIMES;
      else process.env.PROMO_PUSH_VIP_SLOT_TIMES = previous;
    }
  });

  it('cancelar marca pendências sem apagar o histórico', async () => {
    await service.skipBanner('banner-1');
    expect(prisma.promoPushEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          bannerId: 'banner-1',
          status: { in: ['PENDING', 'PROCESSING'] },
        },
        data: expect.objectContaining({
          status: 'SKIPPED',
          error: 'BANNER_CANCELLED',
        }),
      }),
    );
  });
});
