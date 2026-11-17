import { appStoreReviewAscStartUrlCandidates } from './app-store-review.config';
import { createAppStoreReviewConnectJwt } from './app-store-review-connect-jwt';
import {
  ascResponseRequestId,
  fetchAscJsonWithBackoff,
  formatAscAppleErrors,
  sleep,
} from './asc-http.util';

export type AscCustomerReview = {
  id: string;
  rating: number;
  title: string;
  body: string;
  reviewerNickname: string | null;
  territory: string | null;
  createdAt: Date;
};

export type AscReviewsFetchResult =
  | { ok: true; reviews: AscCustomerReview[] }
  | { ok: false; code: 'ASC_CONFIG'; message: string }
  | { ok: false; code: 'ASC_AUTH'; message: string; httpStatus: number; requestId?: string | null }
  | { ok: false; code: 'ASC_FORBIDDEN'; message: string; httpStatus: number; requestId?: string | null }
  | { ok: false; code: 'ASC_HTTP'; message: string; httpStatus: number; requestId?: string | null }
  | { ok: false; code: 'ASC_NETWORK'; message: string };

export type AscCustomerReviewsPageDiag = {
  url: string;
  httpStatus: number;
  requestId: string | null;
  attempts: number;
  reviewCount: number;
  appleErrors: ReturnType<typeof formatAscAppleErrors>;
  hasNext: boolean;
};

type AscReviewResource = {
  type?: string;
  id?: string;
  attributes?: {
    rating?: number;
    title?: string;
    body?: string;
    reviewerNickname?: string;
    territory?: string;
    createdDate?: string;
  };
};

type AscReviewsPage = {
  data?: AscReviewResource[];
  links?: { next?: string | null };
};

function mapReview(row: AscReviewResource): AscCustomerReview | null {
  const id = row.id?.trim();
  if (!id) return null;
  const rating = Number(row.attributes?.rating ?? 0);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) return null;
  const createdRaw = row.attributes?.createdDate;
  const createdAt = createdRaw ? new Date(createdRaw) : null;
  if (!createdAt || Number.isNaN(createdAt.getTime())) return null;
  return {
    id,
    rating: Math.trunc(rating),
    title: String(row.attributes?.title ?? ''),
    body: String(row.attributes?.body ?? ''),
    reviewerNickname: row.attributes?.reviewerNickname?.trim() || null,
    territory: row.attributes?.territory?.trim() || null,
    createdAt,
  };
}

export type AscFetchDeps = {
  fetchFn?: typeof fetch;
  jwtFactory?: () => string | null;
  env?: NodeJS.ProcessEnv;
};

function failureFromResponse(
  res: Response,
  body: unknown,
  code: 'ASC_AUTH' | 'ASC_FORBIDDEN' | 'ASC_HTTP',
  baseMessage: string,
): AscReviewsFetchResult {
  const detail = formatAscAppleErrors(body);
  const suffix = detail ? ` Detalhe: ${detail}` : '';
  const requestId = ascResponseRequestId(res);
  const permissionHint =
    res.status === 500
      ? ' Confirme permissão Customer Reviews na chave ASC; HTTP 500 também ocorre sem escopo.'
      : '';
  return {
    ok: false,
    code,
    httpStatus: res.status,
    requestId,
    message: `${baseMessage}${suffix}${permissionHint}`,
  };
}

export async function fetchAscCustomerReviewsPageDiag(
  url: string,
  deps: AscFetchDeps = {},
): Promise<AscCustomerReviewsPageDiag | { ok: false; message: string }> {
  const jwt = (deps.jwtFactory ?? createAppStoreReviewConnectJwt)();
  if (!jwt) {
    return {
      ok: false,
      message:
        'Credenciais ASC ausentes (APP_STORE_REVIEW_CONNECT_* ou APP_STORE_CONNECT_*).',
    };
  }
  const fetchFn = deps.fetchFn ?? fetch;
  try {
    const { res, body, attempts } = await fetchAscJsonWithBackoff(url, jwt, fetchFn);
    const page = body as AscReviewsPage;
    return {
      url,
      httpStatus: res.status,
      requestId: ascResponseRequestId(res),
      attempts,
      reviewCount: Array.isArray(page.data) ? page.data.length : 0,
      appleErrors: formatAscAppleErrors(body),
      hasNext: Boolean(page.links?.next),
    };
  } catch {
    return { ok: false, message: 'Falha de rede ao consultar customerReviews.' };
  }
}

export async function fetchAllAppStoreCustomerReviews(
  appAppleId: string,
  deps: AscFetchDeps = {},
): Promise<AscReviewsFetchResult> {
  const env = deps.env ?? process.env;
  const fetchFn = deps.fetchFn ?? fetch;
  const jwt = (deps.jwtFactory ?? (() => createAppStoreReviewConnectJwt(env)))();
  if (!jwt) {
    return {
      ok: false,
      code: 'ASC_CONFIG',
      message:
        'Variáveis APP_STORE_REVIEW_CONNECT_* ou APP_STORE_CONNECT_ISSUER_ID / KEY_ID / PRIVATE_KEY são obrigatórias para customerReviews.',
    };
  }

  const reviews: AscCustomerReview[] = [];
  const startUrls = appStoreReviewAscStartUrlCandidates(appAppleId, env);
  let url: string | null = startUrls[0] ?? null;
  let firstPageResolved = false;
  let lastHttpFail: AscReviewsFetchResult | null = null;

  const ingestPage = (page: AscReviewsPage) => {
    for (const row of page.data ?? []) {
      const mapped = mapReview(row);
      if (mapped) reviews.push(mapped);
    }
  };

  if (!url) {
    return {
      ok: false,
      code: 'ASC_CONFIG',
      message: 'URL inicial customerReviews indisponível.',
    };
  }

  while (url) {
    let res: Response;
    let body: unknown;
    try {
      const fetched = await fetchAscJsonWithBackoff(url, jwt, fetchFn);
      res = fetched.res;
      body = fetched.body;
    } catch {
      return {
        ok: false,
        code: 'ASC_NETWORK',
        message: 'Falha de rede ao consultar customerReviews na App Store Connect API.',
      };
    }

    if (res.status === 401) {
      return failureFromResponse(
        res,
        body,
        'ASC_AUTH',
        'Token App Store Connect rejeitado ao consultar customerReviews.',
      );
    }
    if (res.status === 403) {
      return failureFromResponse(
        res,
        body,
        'ASC_FORBIDDEN',
        'Chave App Store Connect sem permissão para GET /v1/apps/{id}/customerReviews (Customer Reviews ou Admin).',
      );
    }

    if (!res.ok) {
      const base = `App Store Connect customerReviews HTTP ${res.status}`;
      const fail = failureFromResponse(res, body, 'ASC_HTTP', base);
      lastHttpFail = fail;
      if (!firstPageResolved) {
        const idx = startUrls.indexOf(url);
        const nextStart = idx >= 0 ? startUrls[idx + 1] : undefined;
        if (nextStart) {
          await sleep(1_500);
          url = nextStart;
          continue;
        }
      }
      return fail;
    }

    firstPageResolved = true;
    const page = body as AscReviewsPage;
    ingestPage(page);
    const next = page.links?.next;
    url = typeof next === 'string' && next.trim() ? next.trim() : null;
  }

  if (reviews.length === 0 && lastHttpFail) {
    return lastHttpFail;
  }

  return { ok: true, reviews };
}

export async function probeAppStoreCustomerReviewsAccess(
  appAppleId: string,
  deps: AscFetchDeps = {},
): Promise<AscReviewsFetchResult> {
  return fetchAllAppStoreCustomerReviews(appAppleId, deps);
}