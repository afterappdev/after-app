/**
 * GET direto objects.get?alt=media — sem listar bucket. Não imprime token/chave/JSON da SA.
 */
const {
  googleAccessToken,
  readGooglePlayServiceAccount,
} = require('../src/admin/store-metrics/google-service-account');

const GCS_SCOPE = 'https://www.googleapis.com/auth/devstorage.read_only';
const BUCKET =
  process.env.PLAY_TEST_BUCKET?.trim() ??
  'pubsite_prod_5200942396652379336';
const OBJECT_NAME =
  process.env.PLAY_TEST_OBJECT?.trim() ??
  'stats/installs/installs_com.r2p.after.after_app_202611_overview.csv';

function errBody(json) {
  const e = json?.error;
  return {
    google_message: e?.message ?? null,
    reasons: (e?.errors ?? []).map((x) => x.reason).filter(Boolean),
  };
}

function decodePlayCsv(buffer) {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.toString('utf16le').replace(/^\ufeff/, '');
  }
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.toString('utf8').slice(1);
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

function dailySumNov1to9(csvText) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;
  const headers = splitCsvLine(lines[0]);
  const dailyIdx = headers.findIndex(
    (h) => h.trim().toLowerCase() === 'daily user installs',
  );
  if (dailyIdx < 0) return { error: 'missing_daily_column', headers };
  let sum = 0;
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const date = (cols[0] ?? '').trim();
    if (!/^2026-11-0[1-9]$/.test(date)) continue;
    const n = Number.parseInt((cols[dailyIdx] ?? '').replace(/[^\d-]/g, ''), 10);
    if (!Number.isFinite(n)) continue;
    rows.push({ date, daily: n });
    sum += n;
  }
  return { sum, rows, encoding_hint: csvText.includes('\u0000') ? 'utf16' : 'utf8' };
}

(async () => {
  const sa = readGooglePlayServiceAccount();
  const token = await googleAccessToken([GCS_SCOPE]);
  const mediaUrl =
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(BUCKET)}` +
    `/o/${encodeURIComponent(OBJECT_NAME)}?alt=media`;

  const out = {
    bucket: BUCKET,
    object: OBJECT_NAME,
    client_email: sa?.client_email ?? null,
    oauth_scope: GCS_SCOPE,
    token_obtained: Boolean(token),
    objects_get_media: null,
  };

  if (!token) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  const mediaRes = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const buf = Buffer.from(await mediaRes.arrayBuffer());
  let parsed = null;
  try {
    parsed = JSON.parse(buf.toString('utf8'));
  } catch {
    /* csv */
  }

  if (!mediaRes.ok || parsed?.error) {
    out.objects_get_media = {
      http_status: mediaRes.status,
      ...errBody(parsed ?? {}),
    };
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  const csvText = decodePlayCsv(buf);
  const novCheck = dailySumNov1to9(csvText);
  out.objects_get_media = {
    http_status: mediaRes.status,
    google_message: null,
    reasons: [],
    bytes: buf.length,
    bom: buf.length >= 2 ? `${buf[0].toString(16)} ${buf[1].toString(16)}` : null,
    csv_header: csvText.split(/\r?\n/)[0] ?? null,
    nov_01_09_daily_user_installs: novCheck,
  };
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => {
  console.error(JSON.stringify({ fatal: String(e) }));
  process.exit(1);
});