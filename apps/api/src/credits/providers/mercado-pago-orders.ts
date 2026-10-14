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
  retryAfter?: string | null;
};

/** Reconciliation GET aborted by its own deadline. The message stays generic. */
export class MercadoPagoTimeoutError extends Error {
  constructor() {
    super('timeout');
    this.name = 'MercadoPagoTimeoutError';
  }
}

export type MercadoPagoTransportKind = 'timeout' | 'dns' | 'connection' | 'tls' | 'unknown';

/** Network failure whose message is already sanitized. `transport` is taken from the error code, not guessed. */
export class MercadoPagoNetworkError extends Error {
  constructor(
    readonly transport: Exclude<MercadoPagoTransportKind, 'timeout'>,
    message: string,
  ) {
    super(message);
    this.name = 'MercadoPagoNetworkError';
  }
}

const DNS_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ENODATA']);
const CONNECTION_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ETIMEDOUT',
  'EPIPE',
  'ECONNABORTED',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
  'UND_ERR_CLOSED',
]);
const TLS_CODES = new Set([
  'CERT_HAS_EXPIRED',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'ERR_SSL_WRONG_VERSION_NUMBER',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
]);

function errorCode(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('code' in value)) return null;
  const code = (value as { code?: unknown }).code;
  return typeof code === 'string' && code.trim() ? code.trim().toUpperCase() : null;
}

function walkThrown(error: unknown, visit: (value: object) => void, seen = new Set<unknown>()): void {
  if (!error || typeof error !== 'object' || seen.has(error)) return;
  seen.add(error);
  visit(error);
  const record = error as { cause?: unknown; errors?: unknown };
  if (Array.isArray(record.errors)) {
    for (const item of record.errors) walkThrown(item, visit, seen);
  }
  if (record.cause) walkThrown(record.cause, visit, seen);
}

function codeKind(code: string): MercadoPagoTransportKind | null {
  if (DNS_CODES.has(code)) return 'dns';
  if (CONNECTION_CODES.has(code)) return 'connection';
  if (TLS_CODES.has(code)) return 'tls';
  return null;
}

/**
 * Reads only error name, `code`, and the same tokens already present in the message.
 * An unrecognized failure stays `unknown`.
 */
export function classifyMercadoPagoNetworkFailure(error: unknown): MercadoPagoTransportKind {
  if (error instanceof MercadoPagoTimeoutError) return 'timeout';
  if (error instanceof MercadoPagoNetworkError) return error.transport;
  let kind: MercadoPagoTransportKind | null = null;
  const texts: string[] = [];
  walkThrown(error, (value) => {
    const name = value instanceof Error ? value.name : '';
    if (value instanceof MercadoPagoTimeoutError || name === 'AbortError') {
      kind = 'timeout';
    }
    const code = errorCode(value);
    const fromCode = code ? codeKind(code) : null;
    if (fromCode && kind == null) kind = fromCode;
    if (value instanceof Error && value.message) texts.push(value.message);
  });
  if (kind) return kind;
  const tokens = texts
    .join(' ')
    .toUpperCase()
    .split(/[^A-Z0-9_]+/)
    .filter((token) => token.length > 2);
  for (const token of tokens) {
    const found = codeKind(token);
    if (found) return found;
  }
  return 'unknown';
}

export type MercadoPagoOrderPayment = {
  id?: string;
  status?: string;
  status_detail?: string;
  amount?: string;
  paid_amount?: string;
  reference_id?: string;
  date_of_expiration?: string;
  payment_method?: {
    id?: string;
    type?: string;
    qr_code?: string | null;
    qr_code_base64?: string | null;
    ticket_url?: string | null;
    installments?: number;
  };
};

export type MercadoPagoOrderRefund = {
  id?: string;
  amount?: string;
  transaction_amount?: string;
  transaction_id?: string;
  reference_id?: string;
  status?: string;
};

export type MercadoPagoOrder = {
  id?: string;
  status?: string;
  status_detail?: string;
  total_amount?: string;
  external_reference?: string;
  /** Legacy Orders field used by older fixtures. */
  currency_id?: string;
  /** Field returned by the current Orders API. */
  currency?: string;
  transactions?: {
    payments?: MercadoPagoOrderPayment[] | MercadoPagoOrderPayment;
    refunds?: MercadoPagoOrderRefund[] | MercadoPagoOrderRefund;
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

export type MercadoPagoOrderEnvelope = {
  order: MercadoPagoOrder | null;
  orderId: string | null;
  status: string | null;
  statusDetail: string | null;
  code: string | null;
  detail: string | null;
};

/**
 * Orders HTTP 402 often wraps the created order in `data` and the reason in
 * `errors[].details`. A missing root `id` does not mean the order is absent.
 */
export function readMercadoPagoOrderEnvelope(
  data: unknown,
): MercadoPagoOrderEnvelope {
  const root = asRecord(data);
  const nested = asRecord(root?.data);
  const nestedIsOrder = Boolean(
    nested && (nested.id || nested.status || nested.transactions),
  );
  const order = (nestedIsOrder ? nested : root) as MercadoPagoOrder | null;
  const payment = firstOrderPayment(order);
  const error = firstErrorRecord(root ?? {});
  const detail =
    errorDetailText(error?.details) ??
    textOrNull(payment?.status_detail) ??
    textOrNull(order?.status_detail);
  return {
    order: order && (order.id || order.status || order.transactions) ? order : null,
    orderId: validOrderId(textOrNull(order?.id)),
    status: textOrNull(order?.status) ?? textOrNull(payment?.status),
    statusDetail: textOrNull(order?.status_detail) ?? textOrNull(payment?.status_detail),
    code: textOrNull(error?.code) ?? textOrNull(root?.code),
    detail,
  };
}

/** Decline is definitive only from a failed/cancelled status or a specific reason. */
export function isUnequivocalCardDecline(
  envelope: MercadoPagoOrderEnvelope,
): boolean {
  const status = (envelope.status ?? '').trim().toLowerCase();
  if (
    status === 'processing' ||
    status === 'created' ||
    status === 'action_required' ||
    status === 'pending'
  ) {
    return false;
  }
  if (
    status === 'failed' ||
    status === 'canceled' ||
    status === 'cancelled' ||
    status === 'expired'
  ) {
    return true;
  }
  const detail = (envelope.detail ?? '').trim().toLowerCase();
  if (!detail || detail === 'failed' || detail === 'error' || detail === '402') {
    return false;
  }
  return /cc_rejected|rejected_|required_call_for_authorize|call_for_authorize|insufficient|bad_filled|invalid_/.test(
    detail,
  );
}

/**
 * Resource id for processing. The signed id is the query param, so it wins
 * when both are present. The body is only a fallback. Never uses the
 * notification envelope `id` (e.g. `"123456"`).
 * Express `qs` parses `?data.id=ORD…` as `{ data: { id } }` — not `{ 'data.id' }`.
 */
export function extractMercadoPagoDataId(
  payload?: unknown,
  query?: Record<string, unknown>,
): string | null {
  return (
    extractMercadoPagoSignatureDataId(query) ||
    bodyDataId(payload) ||
    null
  );
}

/** Query `data.id` only. The HMAC manifest does not cover the JSON body. */
export function extractMercadoPagoSignatureDataId(
  query?: Record<string, unknown>,
): string | null {
  return queryParam(query, 'data.id') || queryParam(query, 'data_id');
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

  // Orders manual still says to lowercase alphanumeric ids. Mercado Pago signs
  // the original query value (sdk-nodejs#439). A numeric simulation is unchanged
  // either way; an uppercase Order id is not.
  const dataId = (input.dataId ?? '').trim();
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
  const envelope = readMercadoPagoOrderEnvelope(data);
  const payment = firstOrderPayment(envelope.order);
  if (payment) {
    mergePreferSpecific(details, pickSafeDiagnosticRecord(payment as Record<string, unknown>));
  }
  const firstError = firstErrorRecord(record);
  if (firstError) mergePreferSpecific(details, pickSafeDiagnosticRecord(firstError, 1));
  if (envelope.orderId) details.order_id = envelope.orderId;
  if (envelope.status) mergePreferSpecific(details, { status: envelope.status });
  if (envelope.detail) mergePreferSpecific(details, { status_detail: envelope.detail });
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

export type MercadoPagoWebhookSignatureDiagnostic = {
  source: 'query' | 'absent';
  format: 'absent' | 'numeric' | 'alphanumeric' | 'other';
  letterCase: 'absent' | 'upper' | 'lower' | 'mixed' | 'numeric';
  normalized: 'none' | 'original';
  query: 'present' | 'absent';
  body: 'present' | 'absent';
  mismatch: boolean;
  xSignature: 'present' | 'absent';
  ts: 'present' | 'absent';
  v1: 'present' | 'absent';
  xRequestId: 'present' | 'absent';
};

/** Safe fields for a webhook log. No id, header value, secret, or body. */
export function inspectMercadoPagoWebhookSignature(input: {
  payload?: unknown;
  query?: Record<string, unknown>;
  xSignature?: string;
  xRequestId?: string;
}): MercadoPagoWebhookSignatureDiagnostic {
  const queryId = extractMercadoPagoSignatureDataId(input.query);
  const bodyId = bodyDataId(input.payload);
  let ts = false;
  let v1 = false;
  for (const part of (input.xSignature ?? '').split(',')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 'ts' && value) ts = true;
    if (key === 'v1' && value) v1 = true;
  }
  return {
    source: queryId ? 'query' : 'absent',
    format: signatureIdFormat(queryId),
    letterCase: signatureIdCase(queryId),
    normalized: queryId ? 'original' : 'none',
    query: queryId ? 'present' : 'absent',
    body: bodyId ? 'present' : 'absent',
    mismatch: Boolean(queryId && bodyId && queryId !== bodyId),
    xSignature: input.xSignature?.trim() ? 'present' : 'absent',
    ts: ts ? 'present' : 'absent',
    v1: v1 ? 'present' : 'absent',
    xRequestId: input.xRequestId?.trim() ? 'present' : 'absent',
  };
}

export function formatMercadoPagoWebhookSignatureLog(
  outcome: 'accepted' | 'rejected',
  diagnostic: MercadoPagoWebhookSignatureDiagnostic,
): string {
  return [
    `Mercado Pago webhook signature ${outcome}`,
    `source=${diagnostic.source}`,
    `format=${diagnostic.format}`,
    `case=${diagnostic.letterCase}`,
    `normalized=${diagnostic.normalized}`,
    `query=${diagnostic.query}`,
    `body=${diagnostic.body}`,
    `mismatch=${diagnostic.mismatch}`,
    `xSignature=${diagnostic.xSignature}`,
    `ts=${diagnostic.ts}`,
    `v1=${diagnostic.v1}`,
    `xRequestId=${diagnostic.xRequestId}`,
  ].join(' ');
}

function signatureIdFormat(
  id: string | null,
): MercadoPagoWebhookSignatureDiagnostic['format'] {
  if (!id) return 'absent';
  if (/^\d+$/.test(id)) return 'numeric';
  if (/^[A-Za-z0-9]+$/.test(id)) return 'alphanumeric';
  return 'other';
}

function signatureIdCase(
  id: string | null,
): MercadoPagoWebhookSignatureDiagnostic['letterCase'] {
  if (!id) return 'absent';
  if (!/[A-Za-z]/.test(id)) return 'numeric';
  if (id === id.toUpperCase()) return 'upper';
  if (id === id.toLowerCase()) return 'lower';
  return 'mixed';
}

function bodyDataId(payload?: unknown): string | null {
  const body = asRecord(payload);
  const data = asRecord(body?.data);
  return coerceResourceId(data?.id);
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

function textOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = sanitizeProviderError(value).trim();
  return trimmed || null;
}

function validOrderId(value: string | null): string | null {
  if (!value || /^\d+$/.test(value)) return null;
  return value;
}

function errorDetailText(value: unknown): string | null {
  const parts: string[] = [];
  if (typeof value === 'string') parts.push(value);
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 4)) {
      if (typeof item === 'string') parts.push(item);
    }
  }
  if (!parts.length) return null;
  const sanitized = sanitizeProviderError(parts.join('; '))
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[redacted]')
    .trim()
    .slice(0, 280);
  return sanitized || null;
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
    options?: { timeoutMs?: number },
  ): Promise<MercadoPagoHttpResult> {
    return this.request(accessToken, {
      method: 'GET',
      path: `/v1/orders/${encodeURIComponent(orderId)}`,
      timeoutMs: options?.timeoutMs,
    });
  }

  async getCurrentUser(
    accessToken: string,
    options?: { timeoutMs?: number },
  ): Promise<MercadoPagoHttpResult> {
    return this.request(accessToken, {
      method: 'GET',
      path: '/users/me',
      timeoutMs: options?.timeoutMs,
    });
  }

  private async request(
    accessToken: string,
    input: {
      method: 'GET' | 'POST';
      path: string;
      idempotencyKey?: string;
      body?: unknown;
      timeoutMs?: number;
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

    const timeoutMs = input.timeoutMs;
    const controller =
      timeoutMs != null && timeoutMs > 0 ? new AbortController() : null;
    const timer = controller
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

    let response: Response;
    try {
      response = await this.fetchImpl(`${MERCADO_PAGO_API_BASE}${input.path}`, {
        method: input.method,
        headers,
        body: input.method === 'POST' ? JSON.stringify(input.body ?? {}) : undefined,
        ...(controller ? { signal: controller.signal } : {}),
      });
    } catch (error) {
      if (controller?.signal.aborted) {
        throw new MercadoPagoTimeoutError();
      }
      const message = sanitizeProviderError(
        error instanceof Error ? error.message : 'network error',
      );
      const transport = classifyMercadoPagoNetworkFailure(error);
      if (transport === 'timeout') throw new MercadoPagoTimeoutError();
      throw new MercadoPagoNetworkError(transport, message);
    } finally {
      if (timer) clearTimeout(timer);
    }

    let data: unknown = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }
    const retryAfter =
      typeof response.headers?.get === 'function'
        ? response.headers.get('retry-after')
        : null;
    return { status: response.status, data, retryAfter };
  }
}
