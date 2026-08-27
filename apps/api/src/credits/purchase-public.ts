export type PublicCreditPurchase = {
  id: string;
  venueId: string;
  packageKey: string;
  productId: string | null;
  amountPaid: number;
  currency: string;
  credits: number;
  provider: string | null;
  status: string;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toPublicPurchase(purchase: {
  id: string;
  venueId: string;
  packageKey: string;
  productId?: string | null;
  amountPaid: unknown;
  currency: string;
  credits: number;
  provider?: string | null;
  status: string;
  confirmedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): PublicCreditPurchase {
  return {
    id: purchase.id,
    venueId: purchase.venueId,
    packageKey: purchase.packageKey,
    productId: purchase.productId ?? null,
    amountPaid: asMoney(purchase.amountPaid),
    currency: purchase.currency,
    credits: purchase.credits,
    provider: purchase.provider ?? null,
    status: purchase.status,
    confirmedAt: purchase.confirmedAt ?? null,
    createdAt: purchase.createdAt,
    updatedAt: purchase.updatedAt,
  };
}

export function asMoney(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'toNumber' in value) {
    const n = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(n) ? n : Number(value);
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
