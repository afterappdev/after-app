const FIRST_TIME_TYPES = new Set([
  'first-time download',
  'first time download',
]);

export function isAppStoreDownloadsStandardReport(name: string | undefined): boolean {
  const n = (name ?? '').trim().toLowerCase();
  return n === 'app downloads standard';
}

export function ingestFirstTimeDownloadsByDate(
  tsv: string,
  byDate: Map<string, number>,
): void {
  const lines = tsv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return;
  const headers = lines[0]!.split('\t').map((h) => h.trim());
  const dateIdx = headers.findIndex((h) => h.toLowerCase() === 'date');
  const typeIdx = headers.findIndex((h) => h.toLowerCase() === 'download type');
  const countsIdx = headers.findIndex((h) => h.toLowerCase() === 'counts');
  if (countsIdx < 0 || dateIdx < 0) return;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split('\t');
    const date = (cols[dateIdx] ?? '').trim();
    if (!date) continue;
    if (typeIdx >= 0) {
      const kind = (cols[typeIdx] ?? '').trim().toLowerCase();
      if (!FIRST_TIME_TYPES.has(kind)) continue;
    }
    const n = Number.parseInt((cols[countsIdx] ?? '').trim(), 10);
    if (!Number.isFinite(n)) continue;
    byDate.set(date, n);
  }
}

export function aggregateFromDateMap(byDate: Map<string, number>): {
  total: number;
  lastDataDate: string;
  firstDataDate: string;
} | null {
  if (byDate.size === 0) return null;
  let total = 0;
  let firstDataDate = '';
  let lastDataDate = '';
  for (const [date, count] of byDate) {
    total += count;
    if (!firstDataDate || date.localeCompare(firstDataDate) < 0) {
      firstDataDate = date;
    }
    if (!lastDataDate || date.localeCompare(lastDataDate) > 0) {
      lastDataDate = date;
    }
  }
  return { total, lastDataDate, firstDataDate };
}