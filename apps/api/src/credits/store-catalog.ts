import { CREDIT_PACKAGES } from '../common/constants/credits';
import { VIP_CREDIT_PACKAGES } from './vip-catalog';

export type CommonStorePackage = (typeof CREDIT_PACKAGES)[number];
export type VipStorePackage = (typeof VIP_CREDIT_PACKAGES)[number];
export type StorePackage = CommonStorePackage | VipStorePackage;

export const STORE_CONFIRM_PACKAGE_KEYS = [
  ...CREDIT_PACKAGES.map((p) => p.key),
  ...VIP_CREDIT_PACKAGES.map((p) => p.key),
] as const;

export type StoreConfirmPackageKey = (typeof STORE_CONFIRM_PACKAGE_KEYS)[number];

export function resolveStorePackageByProductId(
  productId: string,
): StorePackage | null {
  const common = CREDIT_PACKAGES.find((item) => item.storeProductId === productId);
  if (common) return common;
  return VIP_CREDIT_PACKAGES.find((item) => item.storeProductId === productId) ?? null;
}

export function isVipStorePackage(
  pack: StorePackage,
): pack is VipStorePackage {
  return (VIP_CREDIT_PACKAGES as readonly StorePackage[]).includes(pack);
}
