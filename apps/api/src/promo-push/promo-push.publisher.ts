import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LocationsService } from '../locations/locations.service';
import { PrismaService } from '../prisma/prisma.service';
import { PromoContentKind } from './promo-push.copy';
import { planPromoPushEvents, PromoScheduleInput } from './promo-push.plan';
import { readVipPushSlots } from './promo-push.slots';

export const PROMO_PUSH_PUBLISHER = 'PROMO_PUSH_PUBLISHER';

export type PromoPushEventWriter = {
  promoPushEvent: {
    createMany(args: {
      data: Prisma.PromoPushEventCreateManyInput | Prisma.PromoPushEventCreateManyInput[];
      skipDuplicates?: boolean;
    }): Promise<unknown>;
  };
};

export interface PromoPushPublisher {
  resolveVenueCity(city: string, state: string): Promise<number | null>;
  recordSchedules(
    db: PromoPushEventWriter,
    input: {
      bannerId: string;
      venueId: string;
      contentKind: PromoContentKind;
      schedules: PromoScheduleInput[];
      now: Date;
    },
  ): Promise<void>;
  skipBanner(bannerId: string): Promise<void>;
}

@Injectable()
export class NoopPromoPushPublisher implements PromoPushPublisher {
  resolveVenueCity(): Promise<number | null> {
    return Promise.resolve(null);
  }

  recordSchedules(): Promise<void> {
    return Promise.resolve();
  }

  skipBanner(): Promise<void> {
    return Promise.resolve();
  }
}

@Injectable()
export class PromoPushPublisherService implements PromoPushPublisher {
  constructor(
    private readonly locations: LocationsService,
    private readonly prisma: PrismaService,
  ) {}

  resolveVenueCity(city: string, state: string): Promise<number | null> {
    return this.locations.resolveMunicipalityId(city, state);
  }

  async recordSchedules(
    db: PromoPushEventWriter,
    input: {
      bannerId: string;
      venueId: string;
      contentKind: PromoContentKind;
      schedules: PromoScheduleInput[];
      now: Date;
    },
  ): Promise<void> {
    const data = planPromoPushEvents({
      ...input,
      slots: readVipPushSlots(process.env),
    });
    if (!data.length) return;
    await db.promoPushEvent.createMany({ data, skipDuplicates: true });
  }

  async skipBanner(bannerId: string): Promise<void> {
    await this.prisma.promoPushEvent.updateMany({
      where: {
        bannerId,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
      data: {
        status: 'SKIPPED',
        error: 'BANNER_CANCELLED',
        lockedUntil: null,
        lockedBy: null,
      },
    });
  }
}
