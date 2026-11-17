const { googleAccessToken } = require('../src/admin/store-metrics/google-service-account');

const GCS_SCOPE = 'https://www.googleapis.com/auth/devstorage.read_only';
const BUCKET = 'pubsite_prod_5200942396652379336';
const OBJECTS = [
  'stats/installs/installs_com.r2p.after.after_app_202609_overview.csv',
  'stats/installs/installs_com.r2p.after.after_app_202610_overview.csv',
  'stats/installs/installs_com.r2p.after.after_app_202611_overview.csv',
];

function decodeCsvBytes(buf) {
  const buffer = Buffer.from(buf);
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.toString('utf16le').replace(/^\ufeff/, '');
  }
  return buffer.toString('utf8');
}

function splitCsvLine(line) {
  const out = [];
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

(async () => {
  const token = await googleAccessToken([GCS_SCOPE]);
  const byDate = new Map();
  let lastDataDate = '';

  for (const objectName of OBJECTS) {
    const mediaUrl =
      `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(BUCKET)}` +
      `/o/${encodeURIComponent(objectName)}?alt=media`;
    const res = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.log(JSON.stringify({ objectName, status: res.status }));
      continue;
    }
    const text = decodeCsvBytes(await res.arrayBuffer());
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const headers = splitCsvLine(lines[0]);
    const dailyIdx = headers.findIndex(
      (h) => h.trim().toLowerCase() === 'daily user installs',
    );
    for (let i = 1; i < lines.length; i++) {
      const cols = splitCsvLine(lines[i]);
      const date = (cols[0] ?? '').trim();
      if (!date) continue;
      const n = Number.parseInt(
        (cols[dailyIdx] ?? '').replace(/[^\d-]/g, ''),
        10,
      );
      if (!Number.isFinite(n)) continue;
      byDate.set(date, n);
      if (date.localeCompare(lastDataDate) > 0) lastDataDate = date;
    }
  }

  let sum = 0;
  for (const v of byDate.values()) sum += v;
  console.log(
    JSON.stringify({ uniqueDays: byDate.size, sum, lastDataDate }, null, 2),
  );
})().catch((e) => {
  console.error(String(e));
  process.exit(1);
});