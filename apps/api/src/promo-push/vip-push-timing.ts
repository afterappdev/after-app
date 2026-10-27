import { BadRequestException } from '@nestjs/common';
import { BUSINESS_TIME_ZONE } from '../common/constants/timezone';
import { civilDayWindow, startOfCivilDayUtc } from './promo-push.window';
import { PromoContentKind } from './promo-push.copy';
import { PromoPushEventDraft, PromoScheduleInput } from './promo-push.plan';

export type VipPushTimingChoice = 'IMMEDIATE' | 'SLOT_11' | 'SLOT_17';

/** Slot 0 = envio imediato (uma campanha por dia VIP). */
export const VIP_PUSH_IMMEDIATE_SLOT = 0;

export const OFFICIAL_VIP_SLOT_11_MINUTES = 11 * 60;
export const OFFICIAL_VIP_SLOT_17_MINUTES = 17 * 60;

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type VipPublicationPlan = {
  date: string;
  pushTiming: VipPushTimingChoice;
};

export function parseDisplayDateOnly(value: string): Date {
  const m = DATE.exec(value.trim());
  if (!m) throw new BadRequestException(`Data inválida: ${value}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** Civil day YYYY-MM-DD in America/Sao_Paulo. */
export function civilDateLabel(now: Date, timeZone = BUSINESS_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const mo = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${mo}-${d}`;
}

/** Minutes since civil midnight in America/Sao_Paulo. */
export function minutesSinceMidnightSp(
  now: Date,
  timeZone = BUSINESS_TIME_ZONE,
): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

export function compareDateLabels(a: string, b: string): number {
  return a.localeCompare(b);
}

/** Horários permitidos para um dia civil VIP. */
export function allowedVipPushTimings(
  displayDate: string,
  now: Date,
): VipPushTimingChoice[] {
  if (!DATE.test(displayDate)) return [];
  const today = civilDateLabel(now);
  const cmp = compareDateLabels(displayDate, today);
  if (cmp < 0) return [];
  if (cmp > 0) return ['SLOT_11', 'SLOT_17'];
  const minutes = minutesSinceMidnightSp(now);
  if (minutes < OFFICIAL_VIP_SLOT_11_MINUTES) {
    return ['SLOT_11', 'SLOT_17'];
  }
  if (minutes < OFFICIAL_VIP_SLOT_17_MINUTES) {
    return ['SLOT_17', 'IMMEDIATE'];
  }
  return ['IMMEDIATE'];
}

export function allowedVipPushTimingsForAllDates(
  dates: string[],
  now: Date,
): VipPushTimingChoice[] {
  if (dates.length === 0) return [];
  let options = allowedVipPushTimings(dates[0], now);
  for (let i = 1; i < dates.length; i += 1) {
    const next = allowedVipPushTimings(dates[i], now);
    options = options.filter((item) => next.includes(item));
  }
  return options;
}

/** Opções de horário VIP por dia civil (sem interseção global). */
export function allowedVipPushTimingsByDate(
  dates: string[],
  now: Date,
): Record<string, VipPushTimingChoice[]> {
  const byDate: Record<string, VipPushTimingChoice[]> = {};
  for (const date of dates) {
    const trimmed = date.trim();
    if (!DATE.test(trimmed)) continue;
    byDate[trimmed] = allowedVipPushTimings(trimmed, now);
  }
  return byDate;
}

export type VipPublicationInputMode =
  | 'none'
  | 'explicit_vip_publications'
  | 'legacy_vip_dates_only';

function normalizeVipDateList(vipDates: string[]): string[] {
  const seen = new Set<string>();
  const dates: string[] = [];
  for (const value of vipDates) {
    const date = value.trim();
    if (!DATE.test(date)) {
      throw new BadRequestException(`Data VIP inválida: ${value}`);
    }
    if (seen.has(date)) {
      throw new BadRequestException(`Data VIP repetida: ${date}`);
    }
    seen.add(date);
    dates.push(date);
  }
  return dates.sort((a, b) => a.localeCompare(b));
}

function assertMatchingVipDateSets(
  vipDates: string[],
  plans: VipPublicationPlan[],
): void {
  const fromPlans = [...plans.map((p) => p.date)].sort((a, b) => a.localeCompare(b));
  const fromDates = [...vipDates].sort((a, b) => a.localeCompare(b));
  if (fromPlans.length !== fromDates.length) {
    throw new BadRequestException(
      'Payload VIP inconsistente: vipDates e vipPublications devem listar os mesmos dias.',
    );
  }
  for (let i = 0; i < fromPlans.length; i += 1) {
    if (fromPlans[i] !== fromDates[i]) {
      throw new BadRequestException(
        'Payload VIP inconsistente: vipDates e vipPublications devem listar os mesmos dias.',
      );
    }
  }
}

export function validateVipPublicationPlans(
  plans: VipPublicationPlan[],
  now: Date,
): VipPublicationPlan[] {
  const seen = new Set<string>();
  const normalized: VipPublicationPlan[] = [];
  for (const plan of plans) {
    const date = plan.date.trim();
    if (!DATE.test(date)) {
      throw new BadRequestException(`Data VIP inválida: ${plan.date}`);
    }
    if (seen.has(date)) {
      throw new BadRequestException(`Data VIP repetida: ${date}`);
    }
    seen.add(date);
    const allowed = allowedVipPushTimings(date, now);
    if (!allowed.includes(plan.pushTiming)) {
      throw new BadRequestException(
        `Horário ${labelTiming(plan.pushTiming)} não está disponível para ${date}`,
      );
    }
    normalized.push({ date, pushTiming: plan.pushTiming });
  }
  return normalized.sort((a, b) => a.date.localeCompare(b.date));
}

export function normalizeVipPublicationInput(
  vipDates: string[] | undefined,
  vipPublications: VipPublicationPlan[] | undefined,
  now: Date,
): {
  vipDates: string[];
  plans: VipPublicationPlan[];
  inputMode: VipPublicationInputMode;
} {
  const hasVipDates = (vipDates?.length ?? 0) > 0;
  const publicationsProvided = vipPublications !== undefined;
  const hasPublications = (vipPublications?.length ?? 0) > 0;

  if (publicationsProvided && !hasPublications && hasVipDates) {
    throw new BadRequestException(
      'Payload VIP inválido: vipPublications vazio com vipDates preenchido. ' +
        'Use vipPublications com horário por dia ou envie apenas vipDates (cliente legado).',
    );
  }

  if (hasPublications) {
    const plans = validateVipPublicationPlans(vipPublications!, now);
    const normalizedDates = normalizeVipDateList(vipDates ?? plans.map((p) => p.date));
    if (hasVipDates) {
      assertMatchingVipDateSets(normalizedDates, plans);
    }
    return {
      vipDates: plans.map((p) => p.date),
      plans,
      inputMode: 'explicit_vip_publications',
    };
  }

  if (hasVipDates) {
    const dates = normalizeVipDateList(vipDates!);
    return {
      vipDates: dates,
      plans: [],
      inputMode: 'legacy_vip_dates_only',
    };
  }

  return { vipDates: [], plans: [], inputMode: 'none' };
}

export function timingToSlot(timing: VipPushTimingChoice): number {
  switch (timing) {
    case 'IMMEDIATE':
      return VIP_PUSH_IMMEDIATE_SLOT;
    case 'SLOT_11':
      return 1;
    case 'SLOT_17':
      return 2;
  }
}

export function planVipPushEventForSchedule(input: {
  schedule: PromoScheduleInput & { pushTiming: VipPushTimingChoice };
  bannerId: string;
  venueId: string;
  contentKind: PromoContentKind;
  now: Date;
}): PromoPushEventDraft | null {
  const schedule = input.schedule;
  if (schedule.tier !== 'VIP' || !schedule.vipCreditEntryId) return null;
  if (schedule.ibgeCityId == null) return null;
  const window = civilDayWindow(schedule.displayDate);
  if (window.expiresAt.getTime() <= input.now.getTime()) return null;

  let availableAt: Date;
  const slot = timingToSlot(schedule.pushTiming);
  if (schedule.pushTiming === 'IMMEDIATE') {
    availableAt = input.now;
  } else {
    const y = schedule.displayDate.getUTCFullYear();
    const mo = schedule.displayDate.getUTCMonth() + 1;
    const d = schedule.displayDate.getUTCDate();
    const start = startOfCivilDayUtc(y, mo, d);
    const minutes =
      schedule.pushTiming === 'SLOT_11'
        ? OFFICIAL_VIP_SLOT_11_MINUTES
        : OFFICIAL_VIP_SLOT_17_MINUTES;
    availableAt = new Date(start.getTime() + minutes * 60 * 1000);
    if (availableAt.getTime() <= input.now.getTime()) {
      throw new BadRequestException(
        `Horário ${labelTiming(schedule.pushTiming)} já passou para este dia`,
      );
    }
  }
  if (availableAt.getTime() >= window.expiresAt.getTime()) return null;

  return {
    bannerScheduleId: schedule.id,
    slot,
    bannerId: input.bannerId,
    venueId: input.venueId,
    ibgeCityId: schedule.ibgeCityId,
    displayDate: schedule.displayDate,
    contentKind: input.contentKind,
    status: 'PENDING',
    availableAt,
    expiresAt: window.expiresAt,
  };
}

export function labelTiming(timing: VipPushTimingChoice): string {
  switch (timing) {
    case 'IMMEDIATE':
      return 'Envio imediato';
    case 'SLOT_11':
      return '11:00';
    case 'SLOT_17':
      return '17:00';
  }
}
