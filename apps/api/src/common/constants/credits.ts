/**
 * Business rule (pending product confirmation):
 * 1 credit = 1 day of banner display on HOME.
 * Change CREDIT_PER_DISPLAY_DAY via env if the rule changes.
 */
export const CREDIT_PACKAGES = [
  { key: 'unit_1', credits: 1, priceBrl: 34.9, storeProductId: 'after.credits.1' },
  { key: 'combo_5', credits: 5, priceBrl: 149.9, storeProductId: 'after.credits.5' },
  { key: 'combo_10', credits: 10, priceBrl: 199.9, storeProductId: 'after.credits.10' },
] as const;

export type CreditPackageKey = (typeof CREDIT_PACKAGES)[number]['key'];

/**
 * Common credits granted automatically on new venue signup.
 * Set to 0: new establishments start with no welcome bonus (purchases/coupons/admin unchanged).
 * Historical welcome purchases and document linking still use stored amounts.
 */
export const VENUE_SIGNUP_BONUS_CREDITS = 0;

/**
 * WelcomeCreditClaim / WelcomeCreditVenueProvision CHECK constraints require 1
 * when recording an automatic signup grant. Signup no longer calls those paths
 * when VENUE_SIGNUP_BONUS_CREDITS is 0; historical linking uses stored amounts.
 */
export const WELCOME_SIGNUP_CLAIM_CREDITS = 1;
