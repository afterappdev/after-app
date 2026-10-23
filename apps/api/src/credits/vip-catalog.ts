/**
 * VIP catalog. It is not part of CREDIT_PACKAGES and is not registered
 * in the stores by this module. referencePriceBrl is the commercial
 * reference only. A future checkout must show the price returned by
 * Google Play or the App Store, never a value invented here.
 */
export const VIP_CREDIT_PACKAGES = [
  {
    key: 'vip_unit_1',
    modality: 'VIP',
    credits: 1,
    referencePriceBrl: 99.9,
    currency: 'BRL',
    storeProductId: 'after.credits.vip.1',
    storePriceBrl: null,
  },
] as const;

export type VipCreditPackageKey = (typeof VIP_CREDIT_PACKAGES)[number]['key'];

export function vipPackageByKey(key: string) {
  return VIP_CREDIT_PACKAGES.find((item) => item.key === key) ?? null;
}
