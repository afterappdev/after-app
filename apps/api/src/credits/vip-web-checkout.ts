import { CREDIT_PACKAGES } from '../common/constants/credits';
import { asMoney } from './purchase-public';
import { vipPackageByKey } from './vip-catalog';

export const VIP_WEB_PACKAGE_KEY = 'vip_unit_1';
export const VIP_WEB_PRODUCT_ID = 'after.credits.vip.1';
export const VIP_WEB_PRICE_BRL = 99.9;
export const VIP_WEB_CREDITS = 1;

export const WEB_CREDIT_PACKAGE_KEYS = [
  ...CREDIT_PACKAGES.map((item) => item.key),
  VIP_WEB_PACKAGE_KEY,
] as const;

export type WebSale = {
  key: string;
  credits: number;
  priceBrl: number;
  productId: string | null;
  modality: 'COMMON' | 'VIP';
};

export type VipSettlementNext =
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'CHARGED_BACK';

export type VipSettlementEffect = 'grant' | 'refund' | 'reject' | 'ignore' | 'keep';

export function vipGrantOperationKey(purchaseId: string): string {
  return `vip:purchase:${purchaseId}:grant`;
}

export function vipRefundOperationKey(purchaseId: string): string {
  return `vip:purchase:${purchaseId}:refund`;
}

export type VipLedgerRow = {
  operationKey: string;
  kind: string;
  credits: number;
  balanceDelta: number;
  createdAt?: Date | string | null;
  scheduleId?: string | null;
};

export type VipClawbackPlan = {
  recover: number;
  unrecovered: number;
  scheduleId: string | null;
};

const vipPurchaseKey = /^vip:purchase:([^:]+):(grant|refund)$/;

function purchaseIdFromOperation(operationKey: string): string | null {
  return vipPurchaseKey.exec(operationKey)?.[1] ?? null;
}

/**
 * A refund may recover only the credit granted by this purchase.
 * Consumes eat the oldest grants first. A consumed grant opens a
 * shortfall instead of taking a newer purchase's credit.
 * The caller must hold the wallet row lock while reading `entries`.
 */
export function planVipPurchaseClawback(input: {
  purchaseId: string;
  vipBalance: number;
  entries: VipLedgerRow[];
}): VipClawbackPlan {
  const ordered = [...input.entries].sort((left, right) => {
    const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
    const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
    if (leftTime !== rightTime) return leftTime - rightTime;
    return left.operationKey.localeCompare(right.operationKey);
  });
  const clawed = new Set<string>();
  for (const entry of ordered) {
    if (entry.kind === 'refund' && entry.balanceDelta < 0) {
      const id = purchaseIdFromOperation(entry.operationKey);
      if (id) clawed.add(id);
    }
  }
  if (clawed.has(input.purchaseId)) {
    return { recover: 0, unrecovered: 0, scheduleId: null };
  }
  const grants = ordered.filter((entry) => {
    const id = purchaseIdFromOperation(entry.operationKey);
    return entry.kind === 'grant' && entry.balanceDelta > 0 && id != null && !clawed.has(id);
  });
  const consumes = ordered.filter(
    (entry) => entry.kind === 'consume' && entry.balanceDelta < 0,
  );
  const eaten = new Map<string, VipLedgerRow>();
  let consumeIndex = 0;
  for (const grant of grants) {
    if (consumeIndex >= consumes.length) break;
    const id = purchaseIdFromOperation(grant.operationKey);
    if (!id) continue;
    eaten.set(id, consumes[consumeIndex]);
    consumeIndex += 1;
  }
  const consumed = eaten.get(input.purchaseId);
  if (consumed) {
    return {
      recover: 0,
      unrecovered: 1,
      scheduleId: consumed.scheduleId ?? null,
    };
  }
  const ownGrant = grants.some(
    (entry) => purchaseIdFromOperation(entry.operationKey) === input.purchaseId,
  );
  if (!ownGrant || input.vipBalance < 1) {
    return { recover: 0, unrecovered: 1, scheduleId: null };
  }
  return { recover: 1, unrecovered: 0, scheduleId: null };
}

/** A VIP day still ahead of the São Paulo civil date loses the future benefit. */
export function futureVipBenefitRevoked(displayDate: Date, todayCivil: string): boolean {
  const civil = displayDate.toISOString().slice(0, 10);
  return civil > todayCivil;
}

export function saoPauloCivilDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
  }).format(now);
}

export function webSaleByKey(packageKey: string): WebSale | null {
  const common = CREDIT_PACKAGES.find((item) => item.key === packageKey);
  if (common) {
    return {
      key: common.key,
      credits: common.credits,
      priceBrl: common.priceBrl,
      productId: null,
      modality: 'COMMON',
    };
  }
  const vip = vipPackageByKey(packageKey);
  if (
    !vip ||
    vip.credits !== VIP_WEB_CREDITS ||
    vip.storeProductId !== VIP_WEB_PRODUCT_ID ||
    vip.referencePriceBrl !== VIP_WEB_PRICE_BRL
  ) {
    return null;
  }
  return {
    key: vip.key,
    credits: VIP_WEB_CREDITS,
    priceBrl: VIP_WEB_PRICE_BRL,
    productId: VIP_WEB_PRODUCT_ID,
    modality: 'VIP',
  };
}

export function purchaseWalletTarget(purchase: {
  packageKey: string;
  productId?: string | null;
}): 'common' | 'vip' {
  if (purchase.packageKey === VIP_WEB_PACKAGE_KEY) return 'vip';
  const productId = purchase.productId ?? '';
  if (productId.includes('.vip.')) return 'vip';
  return 'common';
}

export function vipPurchaseAccepted(purchase: {
  packageKey: string;
  productId?: string | null;
  credits: number;
  amountPaid: unknown;
}): boolean {
  if (purchase.packageKey !== VIP_WEB_PACKAGE_KEY) return false;
  if (purchase.productId !== VIP_WEB_PRODUCT_ID) return false;
  if (purchase.credits !== VIP_WEB_CREDITS) return false;
  return Math.abs(asMoney(purchase.amountPaid) - VIP_WEB_PRICE_BRL) <= 0.009;
}

/**
 * VIP wallet decision shared by webhook and polling.
 * Common purchases are not decided here.
 * A repeated PAID is ignore. A later failure keeps the credit.
 * Refund and chargeback remove only unused VIP credit.
 * A divergent amount or product is reject and must not touch either wallet.
 */
export function decideVipSettlement(input: {
  status: string;
  packageKey: string;
  productId?: string | null;
  credits: number;
  amountPaid: unknown;
  next: VipSettlementNext;
  orderAmountBrl?: number | null;
}): VipSettlementEffect {
  if (purchaseWalletTarget(input) !== 'vip') return 'ignore';
  if (input.next === 'PAID') {
    const payable = input.status === 'PENDING' || input.status === 'CANCELLED';
    if (!payable) return 'ignore';
    if (!vipPurchaseAccepted(input)) return 'reject';
    if (
      input.orderAmountBrl == null ||
      Math.abs(asMoney(input.orderAmountBrl) - VIP_WEB_PRICE_BRL) > 0.009
    ) {
      return 'reject';
    }
    return 'grant';
  }
  if (input.next === 'FAILED' || input.next === 'CANCELLED') {
    return input.status === 'PAID' ? 'keep' : 'ignore';
  }
  if (input.next === 'REFUNDED' || input.next === 'CHARGED_BACK') {
    if (input.status !== 'PAID') return 'ignore';
    return vipPurchaseAccepted(input) ? 'refund' : 'reject';
  }
  return 'ignore';
}
