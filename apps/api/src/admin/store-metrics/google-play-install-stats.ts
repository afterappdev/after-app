import { Logger } from '@nestjs/common';
import { googleAccessToken } from './google-service-account';

const logger = new Logger('GooglePlayInstallStats');

const GCS_SCOPE = 'https://www.googleapis.com/auth/devstorage.read_only';

type StorageObject = { name?: string; updated?: string };

/** Reads latest Play Console installs overview CSV from the linked GCS bucket. */
export async function fetchGooglePlayTotalInstalls(): Promise<number | null> {
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
    `/o?prefix=${encodeURIComponent(prefix)}&fields=items(name,updated)`;

  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listRes.ok) {
    logger.warn(`GCS list falhou (${listRes.status}) para bucket ${bucket}.`);
    return null;
  }
  const listJson = (await listRes.json()) as { items?: StorageObject[] };
  const objects = (listJson.items ?? []).filter((o) =>
    o.name?.endsWith('_overview.csv'),
  );
  if (objects.length === 0) {
    logger.warn('Nenhum CSV overview de installs encontrado no bucket Play.');
    return null;
  }
  objects.sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? ''));
  const objectName = objects[0].name!;
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
  const text = await fileRes.text();
  return parseTotalUserInstalls(text);
}

function parseTotalUserInstalls(csv: string): number | null {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return null;
  const headers = splitCsvLine(lines[0]);
  const totalIdx = headers.findIndex(
    (h) => h.trim().toLowerCase() === 'total user installs',
  );
  if (totalIdx < 0) return null;

  let bestDate = '';
  let bestTotal: number | null = null;
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length <= totalIdx) continue;
    const date = cols[0]?.trim() ?? '';
    const n = Number.parseInt(cols[totalIdx]!.replace(/[^\d-]/g, ''), 10);
    if (!Number.isFinite(n)) continue;
    if (date.localeCompare(bestDate) >= 0) {
      bestDate = date;
      bestTotal = n;
    }
  }
  return bestTotal;
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
