export type AscAppleError = {
  status?: string;
  code?: string;
  title?: string;
  detail?: string;
  id?: string;
};

export function parseAscAppleErrors(body: unknown): AscAppleError[] {
  const errors = (body as { errors?: AscAppleError[] })?.errors;
  if (!Array.isArray(errors)) return [];
  return errors.map((e) => ({
    status: e.status ?? undefined,
    code: e.code ?? undefined,
    title: e.title ?? undefined,
    detail: e.detail ?? undefined,
    id: e.id ?? undefined,
  }));
}

export function formatAscAppleErrors(body: unknown): string {
  const rows = parseAscAppleErrors(body);
  if (rows.length === 0) return '';
  return rows
    .map((e) =>
      [e.code, e.title, e.detail].filter(Boolean).join(': '),
    )
    .join('; ')
    .slice(0, 400);
}

export function ascResponseRequestId(res: Response): string | null {
  return (
    res.headers.get('x-request-id') ||
    res.headers.get('apple-request-uuid') ||
    res.headers.get('x-apple-request-uuid') ||
    res.headers.get('x-daiquiri-instance') ||
    null
  );
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const RETRYABLE_HTTP = new Set([429, 500, 502, 503, 504]);

export async function fetchAscJsonWithBackoff(
  url: string,
  jwt: string,
  fetchFn: typeof fetch = fetch,
  options?: { maxAttempts?: number; timeoutMs?: number },
): Promise<{
  res: Response;
  body: unknown;
  attempts: number;
}> {
  const maxAttempts = options?.maxAttempts ?? 5;
  const timeoutMs = options?.timeoutMs ?? 60_000;
  let lastRes!: Response;
  let lastBody: unknown = {};
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetchFn(url, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let body: unknown = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { parseError: true, rawPrefix: text.slice(0, 120) };
    }
    lastRes = res;
    lastBody = body;
    if (res.ok) {
      return { res, body, attempts: attempt };
    }
    if (res.status === 401 || res.status === 403 || !RETRYABLE_HTTP.has(res.status)) {
      return { res, body, attempts: attempt };
    }
    if (attempt >= maxAttempts) {
      return { res, body, attempts: attempt };
    }
    const base = Math.min(30_000, 1000 * 2 ** (attempt - 1));
    const retryAfter = res.headers.get('retry-after');
    const parsed = retryAfter ? Number(retryAfter) : NaN;
    const wait =
      Number.isFinite(parsed) && parsed > 0
        ? Math.min(60_000, parsed * 1000)
        : base;
    await sleep(wait);
  }
  return { res: lastRes, body: lastBody, attempts: maxAttempts };
}