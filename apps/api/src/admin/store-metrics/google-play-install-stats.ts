import { Logger } from '@nestjs/common';
import { googleAccessToken } from './google-service-account';

const logger = new Logger('GooglePlayInstallStats');

const GCS_SCOPE = 'https://www.googleapis.com/auth/devstorage.read_only';

type StorageObject = { name?: string; updated?: string };

export type GooglePlayInstallAggregate = {
  total: number;
  lastDataDate: string;
};

/** Sums Daily User Installs from all monthly overview CSVs in the Play GCS bucket. */
export async function fetchGooglePlayInstallAggregate(): Promise<GooglePlayInstallAggregate | null> {
  const bucket = process.env.GOOGLE_PLAY_STATS_BUCKET?.trim();
  const packageName =
    process.env.GOOGLE_PLAY_PACKAGE_NAME?.trim() ?? 'com.r2p.after.after_app';
  if (!bucket) {
    logger.warn('GOOGLE_PLAY_STATS_BUCKET ausente — downloads Play indisponíveis.');
    return null;
  }

  const token = await googleAccessToken([GCS_SCOPE]);
  if (!token) {
    logger.warn('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON ausente — downloads Play indisponíveis.');
    return null;
  }

  const prefix = `stats/installs/installs_${packageName}_`;
  const listUrl =
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}` +
    `/o?prefix=${encodeURIComponent(prefix)}&fields=items(name)`;

  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listRes.ok) {
    logger.warn(`GCS list falhou (${listRes.status}) para bucket ${bucket}.`);
    return null;
  }
  const listJson = (await listRes.json()) as { items?: StorageObject[] };
  const objectNames = (listJson.items ?? [])
    .map((o) => o.name)
    .filter((name): name is string =>
      Boolean(name?.endsWith('_overview.csv')),
    )
    .sort();

  if (objectNames.length === 0) {
    logger.warn('Nenhum CSV overview de installs encontrado no bucket Play.');
    return null;
  }

  const byDate = new Map<string, number>();
  let lastDataDate = '';

  for (const objectName of objectNames) {
    const mediaUrl =
      `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}` +
      `/o/${encodeURIComponent(objectName)}?alt=media`;

    const fileRes = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!fileRes.ok) {
      logger.warn(`Download GCS falhou (${fileRes.status}) para ${objectName}.`);
      return null;
    }
    const csv = decodeCsvBytes(await fileRes.arrayBuffer());
    ingestDailyUserInstalls(csv, byDate);
  }

  if (byDate.size === 0) return null;
  for (const date of byDate.keys()) {
    if (date.localeCompare(lastDataDate) > 0) lastDataDate = date;
  }
  if (!lastDataDate) return null;

  let total = 0;
  for (const n of byDate.values()) total += n;
  return { total, lastDataDate };
}

/** @deprecated use fetchGooglePlayInstallAggregate */
export async function fetchGooglePlayTotalInstalls(): Promise<number | null> {
  const agg = await fetchGooglePlayInstallAggregate();
  return agg?.total ?? null;
}

export function decodeCsvBytes(buf: ArrayBuffer): string {
  const buffer = Buffer.from(buf);
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.toString('utf16le').replace(/^\ufeff/, '');
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
  ) {
    return buffer.toString('utf8').slice(1);
  }
  return buffer.toString('utf8');
}

export function ingestDailyUserInstalls(
  csv: string,
  byDate: Map<string, number>,
): void {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return;
  const headers = splitCsvLine(lines[0]);
  const dailyIdx = headers.findIndex(
    (h) => h.trim().toLowerCase() === 'daily user installs',
  );
  if (dailyIdx < 0) return;

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length <= dailyIdx) continue;
    const date = cols[0]?.trim() ?? '';
    if (!date) continue;
    const n = Number.parseInt(cols[dailyIdx]!.replace(/[^\d-]/g, ''), 10);
    if (!Number.isFinite(n)) continue;
    byDate.set(date, n);
  }
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}