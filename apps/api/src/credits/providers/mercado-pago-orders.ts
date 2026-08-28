import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

export const MERCADO_PAGO_API_BASE = 'https://api.mercadopago.com';

/** PIX expiration sent to Orders API (ISO-8601 duration). Minimum allowed by MP is 30 minutes. */
export const PIX_EXPIRATION_ISO8601 = 'PT1H';

export type AfterPurchaseStatus =
  | 'PENDING'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED';

export type MercadoPagoHttpResult = {
  status: number;
  data: unknown;
};

export type MercadoPagoOrderPayment = {
  id?: string;
  status?: string;
  status_detail?: string;
  amount?: string;
  date_of_expiration?: string;
  payment_method?: {
    id?: string;
    type?: string;
    qr_code?: string | null;
    qr_code_base64?: string | null;
    ticket_url?: string | null;
  };
};

export type MercadoPagoOrder = {
  id?: string;
  status?: string;
  status_detail?: string;
  total_amount?: string;
  external_reference?: string;
  transactions?: {
    payments?: MercadoPagoOrderPayment[] | MercadoPagoOrderPayment;
  };
};

/**
 * Mercado Pago Orders `status` (+ `status_detail`) → AFTER `PurchaseStatus`.
 *
 * | Mercado Pago                         | AFTER      |
 * |--------------------------------------|------------|
 * | processed (accredited)               | PAID       |
 * | processed (partially_refunded)       | REFUNDED   |
 * | created / processing / action_required | PENDING  |
 * | failed                               | FAILED     |
 * | canceled / cancelled / expired       | CANCELLED  |
 * | refunded / charged_back              | REFUNDED   |
 */
export function mapMercadoPagoOrderStatus(
  status?: string | null,
  statusDetail?: string | null,
): AfterPurchaseStatus {
  const s = (status ?? '').trim().toLowerCase();
  const d = (statusDetail ?? '').trim().toLowerCase();

  if (s === 'processed' && (d === 'partially_refunded' || d.includes('refund'))) {
    return 'REFUNDED';
  }
  if (s === 'processed') return 'PAID';
  if (s === 'failed') return 'FAILED';
  if (s === 'canceled' || s === 'cancelled' || s === 'expired') {
    return 'CANCELLED';
  }
  if (s === 'refunded' || s === 'charged_back') return 'REFUNDED';
  return 'PENDING';
}

export function formatBrlAmount(value: number): string {
  return Number(value).toFixed(2);
}

export function parseBrlAmount(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value));
  return Number.isFinite(n) ? n : null;
}

export function firstOrderPayment(
  order: MercadoPagoOrder | null | undefined,
): MercadoPagoOrderPayment | undefined {
  const payments = order?.transactions?.payments;
  if (Array.isArray(payments)) return payments[0];
  if (payments && typeof payments === 'object') return payments;
  return undefined;
}

/**
 * `data.id` from an Orders webhook: JSON body and/or query.
 * Express `qs` parses `?data.id=ORD…` as `{ data: { id } }` — not `{ 'data.id' }`.
 * Never uses the notification envelope `id` (e.g. `"123456"`), which is not the Order id.
 */
export function extractMercadoPagoDataId(
  payload?: unknown,
  query?: Record<string, unknown>,
): string | null {
  const body = asRecord(payload);
  const data = asRecord(body?.data);
  return (
    coerceResourceId(data?.id) ||
    queryParam(query, 'data.id') ||
    queryParam(query, 'data_id') ||
    null
  );
}

export function extractMercadoPagoOrderId(
  payload: unknown,
  query?: Record<string, unknown>,
): string | null {
  const raw = extractMercadoPagoDataId(payload, query);
  if (!raw || isNotificationEnvelopeId(raw)) return null;
  return raw;
}

export function verifyMercadoPagoWebhookSignature(input: {
  secret: string;
  xSignature?: string;
  xRequestId?: string;
  dataId?: string;
}): boolean {
  const secret = input.secret.trim();
  const xSignature = input.xSignature ?? '';
  if (!secret || !xSignature) return false;

  let ts: string | undefined;
  let hash: string | undefined;
  for (const part of xSignature.split(',')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    if (key === 'ts') ts = val;
    if (key === 'v1') hash = val;
  }
  if (!ts || !hash) return false;

  const dataId = (input.dataId ?? '').trim().toLowerCase();
  const requestId = (input.xRequestId ?? '').trim();
  const parts: string[] = [];
  if (dataId) parts.push(`id:${dataId}`);
  if (requestId) parts.push(`request-id:${requestId}`);
  parts.push(`ts:${ts}`);
  const manifest = `${parts.join(';')};`;

  const computed = createHmac('sha256', secret).update(manifest).digest('hex');
  return timingSafeEqualHex(computed, hash);
}

const SAFE_DIAGNOSTIC_KEYS = [
  'status',
  'status_code',
  'code',
  'message',
  'error',
  'status_detail',
  'cause',
] as const;

/** Nested MP `cause[]` / `errors[]` items use `description` for the actual reason. */
const NESTED_DIAGNOSTIC_KEYS = [...SAFE_DIAGNOSTIC_KEYS, 'description'] as const;

const GENERIC_DIAGNOSTIC_VALUES = new Set(['', 'failed', 'error', '402']);

export function sanitizeProviderError(message: unknown): string {
  const text = typeof message === 'string' ? message : String(message ?? '');
  return text
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/APP_USR-[A-Za-z0-9._-]+/g, '[redacted]')
    .replace(/TEST-[A-Za-z0-9._-]+/g, '[redacted]')
    .replace(/MERCADO_PAGO_ACCESS_TOKEN[=:\s]+\S+/gi, 'MERCADO_PAGO_ACCESS_TOKEN=[redacted]')
    .replace(/MERCADO_PAGO_WEBHOOK_SECRET[=:\s]+\S+/gi, 'MERCADO_PAGO_WEBHOOK_SECRET=[redacted]')
    .replace(/(?:client_secret|Client Secret)[=:\s]+\S+/gi, 'client_secret=[redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+\b/g, '[redacted]');
}

/**
 * Compact, allowlisted view of a Mercado Pago error body for logs.
 * Orders API HTTP 402 uses code `failed`; the actionable reason is in
 * `message` / `status_detail` / `cause` / `errors[]`, not the code alone.
 */
export function mercadoPagoErrorLogDetails(data: unknown): Record<string, unknown> {
  const record = asRecord(data);
  if (!record) return {};

  const details = pickSafeDiagnosticRecord(record);
  const payment = firstOrderPayment(record as MercadoPagoOrder);
  if (payment) {
    mergePreferSpecific(details, pickSafeDiagnosticRecord(payment as Record<string, unknown>));
  }
  const firstError = firstErrorRecord(record);
  if (firstError) mergePreferSpecific(details, pickSafeDiagnosticRecord(firstError, 1));
  return details;
}

export function formatMercadoPagoErrorLog(data: unknown): string {
  try {
    return JSON.stringify(mercadoPagoErrorLogDetails(data));
  } catch {
    return '{}';
  }
}

export function mercadoPagoPublicErrorMessage(data: unknown, fallback: string): string {
  const record = asRecord(data);
  const errors = record?.errors;
  const firstError = Array.isArray(errors) ? asRecord(errors[0]) : null;
  const raw =
    (typeof firstError?.message === 'string' && firstError.message) ||
    (typeof record?.message === 'string' && record.message) ||
    (typeof record?.error === 'string' && record.error) ||
    fallback;
  const sanitized = sanitizeProviderError(raw).trim();
  if (!sanitized || /\[redacted\]/i.test(sanitized) || /access.?token/i.test(sanitized)) {
    return fallback;
  }
  return sanitized.slice(0, 280);
}

function timingSafeEqualHex(left: string, right: string): boolean {
  try {
    const a = Buffer.from(left, 'hex');
    const b = Buffer.from(right, 'hex');
    if (a.length === 0 || a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function coerceResourceId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (Array.isArray(value)) return coerceResourceId(value[0]);
  return null;
}

/** Dotted keys (`data.id`) plus nested objects produced by Express extended query parsing. */
function queryParam(
  query: Record<string, unknown> | undefined,
  key: string,
): string | null {
  if (!query) return null;
  const direct = coerceResourceId(query[key]);
  if (direct) return direct;
  if (!key.includes('.')) return null;
  let current: unknown = query;
  for (const part of key.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return coerceResourceId(current);
}

/** Webhook envelope `id` is numeric; Mercado Pago Order ids are `ORD…`. */
function isNotificationEnvelopeId(id: string): boolean {
  return /^\d+$/.test(id);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function firstErrorRecord(record: Record<string, unknown>): Record<string, unknown> | null {
  const errors = record.errors;
  if (Array.isArray(errors)) return asRecord(errors[0]);
  return asRecord(errors);
}

function isGenericDiagnostic(value: unknown): boolean {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as object).length === 0;
  return GENERIC_DIAGNOSTIC_VALUES.has(String(value).trim().toLowerCase());
}

function mergePreferSpecific(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): void {
  for (const [key, candidate] of Object.entries(source)) {
    if (candidate === undefined) continue;
    const current = target[key];
    if (current === undefined) {
      target[key] = candidate;
      continue;
    }
    if (!isGenericDiagnostic(candidate)) {
      target[key] = candidate;
    }
  }
}

function pickSafeDiagnosticRecord(
  record: Record<string, unknown>,
  depth = 0,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const keys = depth === 0 ? SAFE_DIAGNOSTIC_KEYS : NESTED_DIAGNOSTIC_KEYS;
  for (const key of keys) {
    if (!(key in record) || record[key] === undefined) continue;
    const picked = pickSafeDiagnosticValue(record[key], depth);
    if (picked === undefined) continue;
    if (isGenericDiagnostic(picked) && out[key] !== undefined) continue;
    out[key] = picked;
  }
  return out;
}

function pickSafeDiagnosticValue(value: unknown, depth: number): unknown {
  if (value == null || depth > 4) return undefined;
  if (typeof value === 'string') {
    const sanitized = sanitizeProviderError(value).trim().slice(0, 280);
    return sanitized || undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    const items = value
      .slice(0, 8)
      .map((item) => pickSafeDiagnosticValue(item, depth + 1))
      .filter((item) => item !== undefined);
    return items.length ? items : undefined;
  }
  const record = asRecord(value);
  if (!record) return undefined;
  const picked = pickSafeDiagnosticRecord(record, depth + 1);
  return Object.keys(picked).length ? picked : undefined;
}

@Injectable()
export class MercadoPagoOrdersClient {
  /** Overridable in tests. Never log request headers (they carry the Access Token). */
  fetchImpl: typeof fetch = fetch;

  async createOrder(
    accessToken: string,
    idempotencyKey: string,
    body: unknown,
  ): Promise<MercadoPagoHttpResult> {
    return this.request(accessToken, {
      method: 'POST',
      path: '/v1/orders',
      idempotencyKey,
      body,
    });
  }

  async getOrder(
    accessToken: string,
    orderId: string,
  ): Promise<MercadoPagoHttpResult> {
    return this.request(accessToken, {
      method: 'GET',
      path: `/v1/orders/${encodeURIComponent(orderId)}`,
    });
  }

  private async request(
    accessToken: string,
    input: {
      method: 'GET' | 'POST';
      path: string;
      idempotencyKey?: string;
      body?: unknown;
    },
  ): Promise<MercadoPagoHttpResult> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    if (input.idempotencyKey) {
      headers['X-Idempotency-Key'] = input.idempotencyKey;
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${MERCADO_PAGO_API_BASE}${input.path}`, {
        method: input.method,
        headers,
        body: input.method === 'POST' ? JSON.stringify(input.body ?? {}) : undefined,
      });
    } catch (error) {
      const message = sanitizeProviderError(
        error instanceof Error ? error.message : 'network error',
      );
      throw new Error(message);
    }

    let data: unknown = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }
    return { status: response.status, data };
  }
}
