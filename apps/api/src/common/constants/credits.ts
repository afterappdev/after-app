/**
 * Business rule (pending product confirmation):
 * 1 credit = 1 day of banner display on HOME.
 * Change CREDIT_PER_DISPLAY_DAY via env if the rule changes.
 */
export const CREDIT_PACKAGES = [
  { key: 'unit_1', credits: 1, priceBrl: 25, storeProductId: 'after.credits.1' },
  { key: 'combo_5', credits: 5, priceBrl: 115, storeProductId: 'after.credits.5' },
  { key: 'combo_10', credits: 10, priceBrl: 200, storeProductId: 'after.credits.10' },
] as const;

export type CreditPackageKey = (typeof CREDIT_PACKAGES)[number]['key'];

/** Free credits granted when a venue account is created. */
export const VENUE_SIGNUP_BONUS_CREDITS = 2;
