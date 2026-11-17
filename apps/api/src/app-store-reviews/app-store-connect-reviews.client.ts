import { createAppStoreConnectJwt } from '../admin/store-metrics/app-store-connect-jwt';
import { appStoreReviewAscListUrl } from './app-store-review.config';

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
  | { ok: false; code: 'ASC_AUTH'; message: string; httpStatus: number }
  | { ok: false; code: 'ASC_FORBIDDEN'; message: string; httpStatus: number }
  | { ok: false; code: 'ASC_HTTP'; message: string; httpStatus: number }
  | { ok: false; code: 'ASC_NETWORK'; message: string };

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

function pickAppleErrors(body: unknown): string {
  const errors = (body as { errors?: { title?: string; detail?: string; code?: string }[] })
    ?.errors;
  if (!Array.isArray(errors) || errors.length === 0) return '';
  return errors
    .map((e) => [e.title, e.detail, e.code].filter(Boolean).join(': '))
    .join('; ')
    .slice(0, 400);
}

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
};

export async function fetchAllAppStoreCustomerReviews(
  appAppleId: string,
  deps: AscFetchDeps = {},
): Promise<AscReviewsFetchResult> {
  const fetchFn = deps.fetchFn ?? fetch;
  const jwt = (deps.jwtFactory ?? createAppStoreConnectJwt)();
  if (!jwt) {
    return {
      ok: false,
      code: 'ASC_CONFIG',
      message:
        'Variáveis APP_STORE_CONNECT_ISSUER_ID, APP_STORE_CONNECT_KEY_ID e APP_STORE_CONNECT_PRIVATE_KEY são obrigatórias para customerReviews.',
    };
  }

  const reviews: AscCustomerReview[] = [];
  let url: string | null = appStoreReviewAscListUrl(appAppleId);

  while (url) {
    let res: Response;
    try {
      res = await fetchFn(url, {
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      return {
        ok: false,
        code: 'ASC_NETWORK',
        message: 'Falha de rede ao consultar customerReviews na App Store Connect API.',
      };
    }

    const body = (await res.json().catch(() => ({}))) as AscReviewsPage & {
      errors?: unknown;
    };

    if (res.status === 401 || res.status === 403) {
      const detail = pickAppleErrors(body);
      const suffix = detail ? ` Detalhe: ${detail}` : '';
      if (res.status === 403) {
        return {
          ok: false,
          code: 'ASC_FORBIDDEN',
          httpStatus: 403,
          message:
            'Chave App Store Connect sem permissão para GET /v1/apps/{id}/customerReviews (role precisa incluir Customer Reviews ou Admin).' +
            suffix,
        };
      }
      return {
        ok: false,
        code: 'ASC_AUTH',
        httpStatus: 401,
        message: 'Token App Store Connect rejeitado ao consultar customerReviews.' + suffix,
      };
    }

    if (!res.ok) {
      const detail = pickAppleErrors(body);
      const permissionHint =
        res.status === 500
          ? ' Confirme na chave ASC (Users and Access) permissão Customer Reviews; HTTP 500 também ocorre sem escopo.'
          : '';
      return {
        ok: false,
        code: 'ASC_HTTP',
        httpStatus: res.status,
        message: `App Store Connect customerReviews HTTP ${res.status}.${detail ? ` ${detail}` : ''}${permissionHint}`,
      };
    }

    for (const row of body.data ?? []) {
      const mapped = mapReview(row);
      if (mapped) reviews.push(mapped);
    }

    const next = body.links?.next;
    url = typeof next === 'string' && next.trim() ? next.trim() : null;
  }

  return { ok: true, reviews };
}

export async function probeAppStoreCustomerReviewsAccess(
  appAppleId: string,
  deps: AscFetchDeps = {},
): Promise<AscReviewsFetchResult> {
  const fetchFn = deps.fetchFn ?? fetch;
  const jwt = (deps.jwtFactory ?? createAppStoreConnectJwt)();
  if (!jwt) {
    return {
      ok: false,
      code: 'ASC_CONFIG',
      message:
        'Variáveis APP_STORE_CONNECT_ISSUER_ID, APP_STORE_CONNECT_KEY_ID e APP_STORE_CONNECT_PRIVATE_KEY são obrigatórias.',
    };
  }

  const url = `${appStoreReviewAscListUrl(appAppleId).split('?')[0]}?limit=1&sort=-createdDate`;
  try {
    const res = await fetchFn(url, {
      headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      return { ok: true, reviews: [] };
    }
    if (res.status === 403) {
      return {
        ok: false,
        code: 'ASC_FORBIDDEN',
        httpStatus: 403,
        message:
          'Sem permissão para customerReviews. Gere chave ASC com acesso a Customer Reviews.',
      };
    }
    if (res.status === 401) {
      return {
        ok: false,
        code: 'ASC_AUTH',
        httpStatus: 401,
        message: 'Token App Store Connect inválido.',
      };
    }
    return {
      ok: false,
      code: 'ASC_HTTP',
      httpStatus: res.status,
      message: `Probe customerReviews HTTP ${res.status}. ${pickAppleErrors(body)}`,
    };
  } catch {
    return {
      ok: false,
      code: 'ASC_NETWORK',
      message: 'Rede indisponível no probe customerReviews.',
    };
  }
}