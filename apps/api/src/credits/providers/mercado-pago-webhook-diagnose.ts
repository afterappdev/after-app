import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Temporary local diagnosis for a rejected Mercado Pago webhook.
 * It recomputes the documented manifest on its own and does not decide HTTP.
 * Remove this module after the real notification is explained.
 */
export type MercadoPagoHmacDiagnosis = {
  official: boolean;
  lowerId: boolean;
  firstSegment: 'single' | 'matches' | 'differs';
  lowerFirst: boolean;
  omitRequest: 'same' | 'matches' | 'differs';
  omitRequestLower: boolean;
  requestParts: number;
  dataLen: number;
  requestLen: number;
  tsLen: number;
  v1Len: number;
  v1Hex: boolean;
  signatureHeader: 'string' | 'array' | 'absent';
  requestHeader: 'string' | 'array' | 'absent';
};

export function diagnoseMercadoPagoWebhookHmac(input: {
  secret: string;
  dataId?: unknown;
  xRequestId?: unknown;
  xSignature?: unknown;
}): MercadoPagoHmacDiagnosis {
  const dataId = textValue(input.dataId);
  const requestId = textValue(input.xRequestId);
  const { ts, v1 } = parseSignature(textValue(input.xSignature));
  const secret = input.secret.trim();
  const segments = requestId
    ? requestId.split(',').map((part) => part.trim()).filter(Boolean)
    : [];
  const first = segments[0] ?? '';
  const canCompare = Boolean(secret && ts && v1);
  const matches = (id: string, request: string) =>
    canCompare && hexEqual(hmacSha256(secret, documentedManifest(id, request, ts)), v1);

  return {
    official: matches(dataId, requestId),
    lowerId: Boolean(dataId) && matches(dataId.toLowerCase(), requestId),
    firstSegment:
      segments.length <= 1 ? 'single' : matches(dataId, first) ? 'matches' : 'differs',
    lowerFirst: segments.length > 1 && Boolean(dataId) && matches(dataId.toLowerCase(), first),
    omitRequest: requestId
      ? matches(dataId, '')
        ? 'matches'
        : 'differs'
      : 'same',
    omitRequestLower: Boolean(requestId && dataId) && matches(dataId.toLowerCase(), ''),
    requestParts: segments.length,
    dataLen: dataId.length,
    requestLen: requestId.length,
    tsLen: ts.length,
    v1Len: v1.length,
    v1Hex: /^[0-9a-f]+$/i.test(v1),
    signatureHeader: headerShape(input.xSignature),
    requestHeader: headerShape(input.xRequestId),
  };
}

export type MercadoPagoRawHeaderObservation = {
  signatureCount: number;
  requestCount: number;
  signatureName: 'lower' | 'mixed' | 'absent';
  requestName: 'lower' | 'mixed' | 'absent';
  signatureEqualsFirst: boolean | null;
  signatureEqualsJoin: boolean | null;
  requestEqualsFirst: boolean | null;
  requestEqualsJoin: boolean | null;
  signatureCommaInOne: boolean;
  requestCommaInOne: boolean;
  queryRelation: 'same' | 'case' | 'differs' | 'absent';
  queryEncoded: boolean;
};

/**
 * Compares the header string Nest already normalized with the wire headers.
 * Counts and booleans only: the values themselves are not returned.
 * Node joins repeated headers with a comma and a space before Express sees them.
 */
export function observeMercadoPagoRawHeaders(input: {
  rawHeaders?: readonly string[];
  xSignature?: string;
  xRequestId?: string;
  rawUrl?: string;
  parsedDataId?: string | null;
}): MercadoPagoRawHeaderObservation {
  const signature = headerOccurrences(input.rawHeaders, 'x-signature');
  const request = headerOccurrences(input.rawHeaders, 'x-request-id');
  const parsed = input.parsedDataId?.trim() || null;
  const fromUrl = dataIdFromRawUrl(input.rawUrl);
  return {
    signatureCount: signature.values.length,
    requestCount: request.values.length,
    signatureName: nameCase(signature.names),
    requestName: nameCase(request.names),
    signatureEqualsFirst: equalsReference(input.xSignature, signature.values, 'first'),
    signatureEqualsJoin: equalsReference(input.xSignature, signature.values, 'join'),
    requestEqualsFirst: equalsReference(input.xRequestId, request.values, 'first'),
    requestEqualsJoin: equalsReference(input.xRequestId, request.values, 'join'),
    signatureCommaInOne: signature.values.length === 1 && signature.values[0].includes(','),
    requestCommaInOne: request.values.length === 1 && request.values[0].includes(','),
    queryRelation: queryRelation(fromUrl.value, parsed),
    queryEncoded: fromUrl.encoded,
  };
}

export function formatMercadoPagoRawHeaderObservation(
  observation: MercadoPagoRawHeaderObservation,
): string {
  return [
    'Mercado Pago webhook raw headers',
    `signatureCount=${observation.signatureCount}`,
    `requestCount=${observation.requestCount}`,
    `signatureName=${observation.signatureName}`,
    `requestName=${observation.requestName}`,
    `signatureEqualsFirst=${observation.signatureEqualsFirst}`,
    `signatureEqualsJoin=${observation.signatureEqualsJoin}`,
    `requestEqualsFirst=${observation.requestEqualsFirst}`,
    `requestEqualsJoin=${observation.requestEqualsJoin}`,
    `signatureCommaInOne=${observation.signatureCommaInOne}`,
    `requestCommaInOne=${observation.requestCommaInOne}`,
    `queryRelation=${observation.queryRelation}`,
    `queryEncoded=${observation.queryEncoded}`,
  ].join(' ');
}

function headerOccurrences(
  rawHeaders: readonly string[] | undefined,
  expected: string,
): { names: string[]; values: string[] } {
  const names: string[] = [];
  const values: string[] = [];
  const list = rawHeaders ?? [];
  for (let i = 0; i + 1 < list.length; i += 2) {
    if (list[i].toLowerCase() !== expected) continue;
    names.push(list[i]);
    values.push(list[i + 1]);
  }
  return { names, values };
}

function nameCase(names: string[]): 'lower' | 'mixed' | 'absent' {
  if (names.length === 0) return 'absent';
  return names.every((name) => name === name.toLowerCase()) ? 'lower' : 'mixed';
}

function equalsReference(
  received: string | undefined,
  values: string[],
  mode: 'first' | 'join',
): boolean | null {
  if (received == null || values.length === 0) return null;
  const reference = mode === 'first' ? values[0] : values.join(', ');
  return received === reference;
}

function dataIdFromRawUrl(rawUrl: string | undefined): {
  value: string | null;
  encoded: boolean;
} {
  const query = rawUrl?.split('?')[1]?.split('#')[0] ?? '';
  if (!query) return { value: null, encoded: false };
  let encoded = false;
  let value: string | null = null;
  for (const pair of query.split('&')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const key = decodeURIComponent(pair.slice(0, eq).replace(/\+/g, ' '));
    if (key !== 'data.id' && key !== 'data_id') continue;
    const raw = pair.slice(eq + 1);
    if (/%[0-9A-Fa-f]{2}/.test(raw)) encoded = true;
    value = decodeURIComponent(raw.replace(/\+/g, ' '));
  }
  return { value, encoded };
}

function queryRelation(
  raw: string | null,
  parsed: string | null,
): 'same' | 'case' | 'differs' | 'absent' {
  if (!raw || !parsed) return 'absent';
  if (raw === parsed) return 'same';
  if (raw.toLowerCase() === parsed.toLowerCase()) return 'case';
  return 'differs';
}

export function formatMercadoPagoHmacDiagnosis(
  diagnosis: MercadoPagoHmacDiagnosis,
): string {
  return [
    'Mercado Pago webhook hmac diagnose local',
    `official=${diagnosis.official}`,
    `lowerId=${diagnosis.lowerId}`,
    `firstSegment=${diagnosis.firstSegment}`,
    `lowerFirst=${diagnosis.lowerFirst}`,
    `omitRequest=${diagnosis.omitRequest}`,
    `omitRequestLower=${diagnosis.omitRequestLower}`,
    `requestParts=${diagnosis.requestParts}`,
    `dataLen=${diagnosis.dataLen}`,
    `requestLen=${diagnosis.requestLen}`,
    `tsLen=${diagnosis.tsLen}`,
    `v1Len=${diagnosis.v1Len}`,
    `v1Hex=${diagnosis.v1Hex}`,
    `signatureHeader=${diagnosis.signatureHeader}`,
    `requestHeader=${diagnosis.requestHeader}`,
  ].join(' ');
}

/** Documented Orders manifest. Empty id or request id is omitted. */
export function documentedManifest(
  dataId: string,
  requestId: string,
  ts: string,
): string {
  const parts: string[] = [];
  if (dataId) parts.push(`id:${dataId}`);
  if (requestId) parts.push(`request-id:${requestId}`);
  parts.push(`ts:${ts}`);
  return `${parts.join(';')};`;
}

export function hmacSha256(secret: string, message: string): string {
  return createHmac('sha256', secret).update(message).digest('hex');
}

function parseSignature(header: string): { ts: string; v1: string } {
  let ts = '';
  let v1 = '';
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 'ts') ts = value;
    if (key === 'v1') v1 = value;
  }
  return { ts, v1 };
}

function textValue(value: unknown): string {
  if (Array.isArray(value)) return textValue(value[0]);
  if (typeof value !== 'string') return '';
  return value.trim();
}

function headerShape(value: unknown): 'string' | 'array' | 'absent' {
  if (Array.isArray(value)) return value.some((item) => typeof item === 'string' && item.trim()) ? 'array' : 'absent';
  if (typeof value === 'string' && value.trim()) return 'string';
  return 'absent';
}

function hexEqual(left: string, right: string): boolean {
  if (!/^[0-9a-f]+$/i.test(left) || !/^[0-9a-f]+$/i.test(right)) return false;
  if (left.length === 0 || left.length !== right.length) return false;
  try {
    return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
  } catch {
    return false;
  }
}
