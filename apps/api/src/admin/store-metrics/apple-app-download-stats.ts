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

type AscList<T> = { data: T[] };

export type AppleInstallAggregate = {
  total: number;
  lastDataDate: string;
  firstDataDate: string;
};

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
  const requests = await listAnalyticsReportRequests(appId, headers);
  if (!requests) return null;

  const orderedRequestIds = [
    requests.snapshotId,
    requests.ongoingId,
  ].filter((id): id is string => Boolean(id));

  if (orderedRequestIds.length === 0) {
    logger.warn(
      'Nenhuma solicitação ONGOING ou ONE_TIME_SNAPSHOT no App Store Connect.',
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
  if (!res.ok) {
    logger.warn(`App Store Connect ${res.status}`);
    return null;
  }
  return (await res.json()) as T;
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
    const page = await ascFetch<
      AscList<{ id: string }> & { links?: { next?: string } }
    >(nextUrl, headers);
    if (!page) break;
    for (const row of page.data ?? []) {
      await ingestInstanceSegments(row.id, jwt, headers, byDate);
    }
    nextUrl = page.links?.next ?? null;
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

  const gzRes = await fetch(segUrl, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!gzRes.ok) {
    logger.warn(`Download segmento Analytics falhou (${gzRes.status}).`);
    return;
  }
  const buf = Buffer.from(await gzRes.arrayBuffer());
  const text = gunzipSync(buf).toString('utf8');
  ingestFirstTimeDownloadsByDate(text, byDate);
}