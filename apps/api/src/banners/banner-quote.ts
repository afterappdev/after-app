import { BadRequestException } from '@nestjs/common';

export type PublicationTierName = 'COMMON' | 'VIP';

export type QuotedDate = {
  date: string;
  tier: PublicationTierName;
};

export type PublicationQuote = {
  days: QuotedDate[];
  commonCredits: number;
  vipCredits: number;
};

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Server-side price of a publication. A VIP day replaces the common
 * credit for that civil date. The client does not send a price.
 */
export function quotePublication(input: {
  dates: string[];
  vipDates?: string[];
  creditPerDisplayDay: number;
}): PublicationQuote {
  const perDay =
    Number.isFinite(input.creditPerDisplayDay) && input.creditPerDisplayDay > 0
      ? input.creditPerDisplayDay
      : 1;
  const common = normalize(input.dates, 'comum');
  const vip = normalize(input.vipDates ?? [], 'VIP');
  const overlap = common.find((date) => vip.includes(date));
  if (overlap) {
    throw new BadRequestException(
      `A data ${overlap} não pode ser comum e VIP ao mesmo tempo`,
    );
  }
  if (common.length + vip.length === 0) {
    throw new BadRequestException('Informe ao menos uma data');
  }
  const days: QuotedDate[] = [
    ...common.map((date) => ({ date, tier: 'COMMON' as const })),
    ...vip.map((date) => ({ date, tier: 'VIP' as const })),
  ];
  return {
    days,
    commonCredits: common.length * perDay,
    vipCredits: vip.length,
  };
}

function normalize(values: string[], label: string): string[] {
  const seen = new Set<string>();
  const dates: string[] = [];
  for (const value of values) {
    const date = value.trim();
    if (!DATE.test(date)) {
      throw new BadRequestException(`Data inválida: ${value}`);
    }
    if (seen.has(date)) {
      throw new BadRequestException(`Data ${label} repetida: ${date}`);
    }
    seen.add(date);
    dates.push(date);
  }
  return dates;
}
