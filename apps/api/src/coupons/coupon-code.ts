const COUPON_CODE = /^[A-Z0-9](?:[A-Z0-9-]{0,31})$/;

/**
 * Trim + uppercase. "after2" and " AFTER2 " both become "AFTER2".
 * Internal spaces and symbols other than "-" stay invalid.
 */
export function normalizeCouponCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isCouponCode(raw: string): boolean {
  const code = normalizeCouponCode(raw);
  return code.length > 0 && COUPON_CODE.test(code);
}
