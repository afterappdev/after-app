import { gunzipSync } from 'zlib';
import { Logger } from '@nestjs/common';
import { createAppStoreConnectJwt } from './app-store-connect-jwt';

const logger = new Logger('AppleAppDownloadStats');
const API = 'https://api.appstoreconnect.apple.com/v1';

type AscList<T> = { data: T[] };

export async function fetchAppleAppTotalDownloads(): Promise<number | null> {
  const appId = process.env.APPLE_APP_APPLE_ID?.trim();
  if (!appId) {
    logger.warn('APPLE_APP_APPLE_ID ausente — downloads App Store indisponíveis.');
    return null;
  }
  const jwt = createAppStoreConnectJwt();
  if (!jwt) {
    logger.warn(
      'APP_STORE_CONNECT_ISSUER_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY incompletos.',
    );
    return null;
  }

  const headers = { Authorization: `Bearer ${jwt}`, Accept: 'application/json' };
  const requestId = await ensureOngoingReportRequest(appId, headers);
  if (!requestId) return null;

  const reportId = await findAppDownloadsReportId(requestId, headers);
  if (!reportId) return null;

  const instanceId = await latestDailyInstanceId(reportId, headers);
  if (!instanceId) return null;

  const segmentUrl = await latestSegmentUrl(instanceId, headers);
  if (!segmentUrl) return null;

  const gzRes = await fetch(segmentUrl, { headers: { Authorization: `Bearer ${jwt}` } });
  if (!gzRes.ok) {
    logger.warn(`Download segmento Analytics falhou (${gzRes.status}).`);
    return null;
  }
  const buf = Buffer.from(await gzRes.arrayBuffer());
  const text = gunzipSync(buf).toString('utf8');
  return sumFirstTimeAndRedownloads(text);
}

async function ascFetch<T>(url: string, headers: Record<string, string>): Promise<T | null> {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    logger.warn(`App Store Connect ${res.status}: ${url}`);
    return null;
  }
  return (await res.json()) as T;
}

async function ensureOngoingReportRequest(
  appId: string,
  headers: Record<string, string>,
): Promise<string | null> {
  const list = await ascFetch<AscList<{ id: string; attributes?: { accessType?: string } }>>(
    `${API}/apps/${appId}/analyticsReportRequests?limit=20`,
    headers,
  );
  const ongoing = list?.data?.find((r) => r.attributes?.accessType === 'ONGOING');
  if (ongoing?.id) return ongoing.id;

  const res = await fetch(`${API}/analyticsReportRequests`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: {
        type: 'analyticsReportRequests',
        attributes: { accessType: 'ONGOING' },
        relationships: {
          app: { data: { type: 'apps', id: appId } },
        },
      },
    }),
  });
  if (!res.ok) {
    logger.warn(`Criar analyticsReportRequest falhou (${res.status}).`);
    return null;
  }
  const body = (await res.json()) as AscList<{ id: string }>;
  return body.data?.[0]?.id ?? null;
}

async function findAppDownloadsReportId(
  requestId: string,
  headers: Record<string, string>,
): Promise<string | null> {
  const list = await ascFetch<AscList<{ id: string; attributes?: { name?: string } }>>(
    `${API}/analyticsReportRequests/${requestId}/reports?limit=200`,
    headers,
  );
  const match = list?.data?.find((r) => {
    const name = (r.attributes?.name ?? '').toLowerCase();
    return name.includes('app store download') || name === 'app downloads';
  });
  return match?.id ?? list?.data?.[0]?.id ?? null;
}

async function latestDailyInstanceId(
  reportId: string,
  headers: Record<string, string>,
): Promise<string | null> {
  const list = await ascFetch<AscList<{ id: string; attributes?: { processingDate?: string } }>>(
    `${API}/analyticsReports/${reportId}/instances?filter[granularity]=DAILY&limit=50`,
    headers,
  );
  const rows = list?.data ?? [];
  if (rows.length === 0) return null;
  rows.sort((a, b) =>
    (b.attributes?.processingDate ?? '').localeCompare(
      a.attributes?.processingDate ?? '',
    ),
  );
  return rows[0]?.id ?? null;
}

async function latestSegmentUrl(
  instanceId: string,
  headers: Record<string, string>,
): Promise<string | null> {
  const list = await ascFetch<
    AscList<{ id: string; attributes?: { url?: string; sizeInBytes?: number } }>
  >(`${API}/analyticsReportInstances/${instanceId}/segments`, headers);
  const seg = list?.data?.[0];
  return seg?.attributes?.url ?? null;
}

/** Sums Counts for first-time downloads and redownloads (excludes updates). */
function sumFirstTimeAndRedownloads(tsv: string): number | null {
  const lines = tsv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;
  const headers = lines[0]!.split('\t').map((h) => h.trim());
  const typeIdx = headers.findIndex((h) => h.toLowerCase() === 'download type');
  const countsIdx = headers.findIndex((h) => h.toLowerCase() === 'counts');
  if (countsIdx < 0) return null;

  const includeTypes = new Set([
    'first-time download',
    'redownload',
    'first time download',
  ]);
  let total = 0;
  let any = false;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split('\t');
    if (typeIdx >= 0) {
      const kind = (cols[typeIdx] ?? '').trim().toLowerCase();
      if (!includeTypes.has(kind)) continue;
    }
    const n = Number.parseInt((cols[countsIdx] ?? '').trim(), 10);
    if (!Number.isFinite(n)) continue;
    total += n;
    any = true;
  }
  return any ? total : null;
}
