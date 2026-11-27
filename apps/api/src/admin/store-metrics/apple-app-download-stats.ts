import { gunzipSync } from 'zlib';
import { Logger } from '@nestjs/common';
import { createAppStoreConnectJwt } from './app-store-connect-jwt';
import {
  aggregateFromDateMap,
  ingestFirstTimeDownloadsByDate,
  isAppStoreDownloadsStandardReport,
} from './apple-download-tsv';

const logger = new Logger('AppleAppDownloadStats');
const API = 'https://api.appstoreconnect.apple.com/v1';

type AscList<T> = { data?: T[] };

type AscPaginationLinks = { next?: string | null };

type AscPaginatedList<T> = AscList<T> & { links?: AscPaginationLinks };

type AscDailyInstancesPage = AscPaginatedList<{ id: string }>;

export type AppleInstallAggregate = {
  total: number;
  lastDataDate: string;
  firstDataDate: string;
};

/** Autenticação ASC rejeitada (token/chave/issuer). */
export class AscHttpError extends Error {
  constructor(readonly status: number) {
    super(`ASC_HTTP_${status}`);
    this.name = 'AscHttpError';
  }
}

export async function fetchAppleAppInstallAggregate(): Promise<AppleInstallAggregate | null> {
  const appId = process.env.APPLE_APP_APPLE_ID?.trim();
  if (!appId) {
    logger.warn('APPLE_APP_APPLE_ID ausente — downloads App Store indisponíveis.');
    return null;
  }
  const jwt = createAppStoreConnectJwt();
  if (!jwt) {
    logger.warn(
      'APP_STORE_CONNECT_ISSUER_ID / APP_STORE_CONNECT_KEY_ID / APP_STORE_CONNECT_PRIVATE_KEY incompletos.',
    );
    return null;
  }

  const headers = { Authorization: `Bearer ${jwt}`, Accept: 'application/json' };
  let requests = await listAnalyticsReportRequests(appId, headers);
  if (!requests) return null;

  if (!requests.ongoingId && !requests.snapshotId) {
    const created = await ensureOngoingAnalyticsReportRequest(appId, headers);
    if (created) {
      requests = await listAnalyticsReportRequests(appId, headers);
      if (!requests) return null;
    }
  }

  const orderedRequestIds = [
    requests.snapshotId,
    requests.ongoingId,
  ].filter((id): id is string => Boolean(id));

  if (orderedRequestIds.length === 0) {
    logger.warn(
      'Nenhuma solicitação ONGOING ou ONE_TIME_SNAPSHOT no App Store Connect (relatório pode levar 24–48 h).',
    );
    return null;
  }

  const byDate = new Map<string, number>();
  for (const requestId of orderedRequestIds) {
    const reportId = await findAppDownloadsStandardReportId(requestId, headers);
    if (!reportId) continue;
    await ingestAllDailyInstances(reportId, jwt, headers, byDate);
  }

  return aggregateFromDateMap(byDate);
}

/** @deprecated use fetchAppleAppInstallAggregate */
export async function fetchAppleAppTotalDownloads(): Promise<number | null> {
  const agg = await fetchAppleAppInstallAggregate();
  return agg?.total ?? null;
}

async function ascFetch<T>(url: string, headers: Record<string, string>): Promise<T | null> {
  const res = await fetch(url, { headers });
  if (res.status === 401 || res.status === 403) {
    logger.warn(`App Store Connect ${res.status} — confira Issuer ID, Key ID e .p8 no Railway.`);
    throw new AscHttpError(res.status);
  }
  if (!res.ok) {
    logger.warn(`App Store Connect ${res.status}`);
    return null;
  }
  return (await res.json()) as T;
}

async function ascPost(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<boolean> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 401 || res.status === 403) {
    throw new AscHttpError(res.status);
  }
  if (!res.ok) {
    logger.warn(`App Store Connect POST ${res.status}`);
    return false;
  }
  return true;
}

async function ensureOngoingAnalyticsReportRequest(
  appId: string,
  headers: Record<string, string>,
): Promise<boolean> {
  logger.log('Criando analyticsReportRequest ONGOING no App Store Connect.');
  return ascPost(`${API}/analyticsReportRequests`, headers, {
    data: {
      type: 'analyticsReportRequests',
      attributes: { accessType: 'ONGOING' },
      relationships: {
        app: { data: { type: 'apps', id: appId } },
      },
    },
  });
}

async function listAnalyticsReportRequests(
  appId: string,
  headers: Record<string, string>,
): Promise<{ ongoingId: string | null; snapshotId: string | null } | null> {
  const list = await ascFetch<
    AscList<{ id: string; attributes?: { accessType?: string } }>
  >(`${API}/apps/${appId}/analyticsReportRequests?limit=50`, headers);
  if (!list) return null;
  const rows = list.data ?? [];
  const ongoing = rows.find((r) => r.attributes?.accessType === 'ONGOING');
  const snapshot = rows.find(
    (r) => r.attributes?.accessType === 'ONE_TIME_SNAPSHOT',
  );
  return {
    ongoingId: ongoing?.id ?? null,
    snapshotId: snapshot?.id ?? null,
  };
}

async function findAppDownloadsStandardReportId(
  requestId: string,
  headers: Record<string, string>,
): Promise<string | null> {
  const list = await ascFetch<AscList<{ id: string; attributes?: { name?: string } }>>(
    `${API}/analyticsReportRequests/${requestId}/reports?limit=200`,
    headers,
  );
  if (!list) return null;
  const match = list.data?.find((r) =>
    isAppStoreDownloadsStandardReport(r.attributes?.name),
  );
  return match?.id ?? null;
}

async function ingestAllDailyInstances(
  reportId: string,
  jwt: string,
  headers: Record<string, string>,
  byDate: Map<string, number>,
): Promise<void> {
  let nextUrl: string | null =
    `${API}/analyticsReports/${reportId}/instances?filter[granularity]=DAILY&limit=200`;

  while (nextUrl) {
    const page: AscDailyInstancesPage | null =
      await ascFetch<AscDailyInstancesPage>(nextUrl, headers);
    if (!page) break;
    for (const row of page.data ?? []) {
      await ingestInstanceSegments(row.id, jwt, headers, byDate);
    }
    const following = page.links?.next?.trim();
    nextUrl = following ? following : null;
  }
}

async function ingestInstanceSegments(
  instanceId: string,
  jwt: string,
  headers: Record<string, string>,
  byDate: Map<string, number>,
): Promise<void> {
  const list = await ascFetch<
    AscList<{ attributes?: { url?: string } }>
  >(`${API}/analyticsReportInstances/${instanceId}/segments`, headers);
  const segUrl = list?.data?.[0]?.attributes?.url;
  if (!segUrl) return;

  // URLs de segmento são pré-assinadas; Bearer no GET costuma devolver 400.
  let gzRes = await fetch(segUrl);
  if (!gzRes.ok && (gzRes.status === 401 || gzRes.status === 403)) {
    gzRes = await fetch(segUrl, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
  }
  if (!gzRes.ok) {
    logger.warn(`Download segmento Analytics falhou (${gzRes.status}).`);
    return;
  }
  const buf = Buffer.from(await gzRes.arrayBuffer());
  const text = gunzipSync(buf).toString('utf8');
  ingestFirstTimeDownloadsByDate(text, byDate);
}