import { civilDayWindow, startOfCivilDayUtc } from './promo-push.window';
import { PromoContentKind } from './promo-push.copy';
import { VipPushSlot } from './promo-push.slots';

export type PromoScheduleInput = {
  id: string;
  displayDate: Date;
  ibgeCityId: number | null;
  tier?: 'COMMON' | 'VIP' | null;
  vipCreditEntryId?: string | null;
};

export type PromoPushEventDraft = {
  bannerScheduleId: string;
  slot: number;
  bannerId: string;
  venueId: string;
  ibgeCityId: number;
  displayDate: Date;
  contentKind: PromoContentKind;
  status: 'PENDING';
  availableAt: Date;
  expiresAt: Date;
};

/**
 * One pending event per configured VIP slot. Common days create nothing.
 * A slot that is already due at confirmation is omitted, so it is not
 * sent retroactively. The pair (schedule, slot) is the idempotency key.
 */
export function planPromoPushEvents(input: {
  bannerId: string;
  venueId: string;
  contentKind: PromoContentKind;
  schedules: PromoScheduleInput[];
  slots: VipPushSlot[];
  now: Date;
}): PromoPushEventDraft[] {
  if (!input.slots.length) return [];
  const drafts: PromoPushEventDraft[] = [];
  for (const schedule of input.schedules) {
    if (schedule.tier !== 'VIP' || !schedule.vipCreditEntryId) continue;
    if (schedule.ibgeCityId == null) continue;
    const window = civilDayWindow(schedule.displayDate);
    if (window.expiresAt.getTime() <= input.now.getTime()) continue;
    const start = startOfCivilDayUtc(
      schedule.displayDate.getUTCFullYear(),
      schedule.displayDate.getUTCMonth() + 1,
      schedule.displayDate.getUTCDate(),
    );
    for (const slot of input.slots) {
      const availableAt = new Date(start.getTime() + slot.minuteOfDay * 60 * 1000);
      if (availableAt.getTime() <= input.now.getTime()) continue;
      if (availableAt.getTime() >= window.expiresAt.getTime()) continue;
      drafts.push({
        bannerScheduleId: schedule.id,
        slot: slot.index,
        bannerId: input.bannerId,
        venueId: input.venueId,
        ibgeCityId: schedule.ibgeCityId,
        displayDate: schedule.displayDate,
        contentKind: input.contentKind,
        status: 'PENDING',
        availableAt,
        expiresAt: window.expiresAt,
      });
    }
  }
  return drafts;
}
