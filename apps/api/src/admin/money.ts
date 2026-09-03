import { Prisma } from '@prisma/client';

/**
 * JSON money: number rounded to 2 decimal places via Decimal, not raw IEEE math.
 * Values like 115 serialize as 115 (JSON has no trailing zeros).
 */
export function toMoneyNumber(
  value: Prisma.Decimal | number | string | null | undefined,
): number {
  const decimal =
    value instanceof Prisma.Decimal
      ? value
      : new Prisma.Decimal(value == null ? 0 : value);
  return Number(decimal.toFixed(2));
}

export function zeroMoney(): Prisma.Decimal {
  return new Prisma.Decimal(0);
}
