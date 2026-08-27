export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** Explicit Mercado Pago Orders sandbox. Only `'true'` (case-insensitive) enables it. */
export function isMercadoPagoSandbox(): boolean {
  return process.env.MERCADO_PAGO_SANDBOX?.trim().toLowerCase() === 'true';
}
