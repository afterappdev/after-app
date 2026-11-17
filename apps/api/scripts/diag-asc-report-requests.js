/**
 * App Store Connect — lista solicitações de relatório e, se 200, resume downloads.
 * Usa createAppStoreConnectJwt (mesmo helper da API). Não imprime JWT nem .p8.
 */
const { gunzipSync } = require('zlib');
const {
  createAppStoreConnectJwt,
} = require('../src/admin/store-metrics/app-store-connect-jwt');

const API = 'https://api.appstoreconnect.apple.com/v1';

function envFlag(name) {
  const v = process.env[name];
  if (v == null || String(v).trim() === '') return 'missing';
  return 'set';
}

function pickAppleErrors(body) {
  const errors = Array.isArray(body?.errors) ? body.errors : [];
  return errors.map((e) => ({
    status: e.status ?? null,
    code: e.code ?? null,
    title: e.title ?? null,
    detail: e.detail ?? null,
  }));
}

async function ascJson(url, jwt) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/json' },
  });
  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = {};
  }
  return {
    http_status: res.status,
    apple_errors: pickAppleErrors(json),
    body: res.ok ? json : null,
  };
}

function sumFirstTimeDownloads(tsv) {
  const lines = tsv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;
  const headers = lines[0].split('\t').map((h) => h.trim());
  const typeIdx = headers.findIndex((h) => h.toLowerCase() === 'download type');
  const countsIdx = headers.findIndex((h) => h.toLowerCase() === 'counts');
  if (countsIdx < 0) return null;
  let total = 0;
  let any = false;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    if (typeIdx >= 0) {
      const kind = (cols[typeIdx] ?? '').trim().toLowerCase();
      if (
        kind !== 'first-time download' &&
        kind !== 'first time download'
      ) {
        continue;
      }
    }
    const n = Number.parseInt((cols[countsIdx] ?? '').trim(), 10);
    if (!Number.isFinite(n)) continue;
    total += n;
    any = true;
  }
  return any ? total : null;
}

(async () => {
  const appId = process.env.APPLE_APP_APPLE_ID?.trim() ?? '';
  const jwt = createAppStoreConnectJwt();

  const out = {
    env: {
      APP_STORE_CONNECT_ISSUER_ID: envFlag('APP_STORE_CONNECT_ISSUER_ID'),
      APP_STORE_CONNECT_KEY_ID: envFlag('APP_STORE_CONNECT_KEY_ID'),
      APP_STORE_CONNECT_PRIVATE_KEY: envFlag('APP_STORE_CONNECT_PRIVATE_KEY'),
      APPLE_APP_APPLE_ID: envFlag('APPLE_APP_APPLE_ID'),
    },
    jwt_for_app_store_connect: jwt ? 'ok' : 'unavailable',
    list_analytics_report_requests: null,
    downloads_probe: null,
  };

  if (!jwt || !appId) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  const listUrl = `${API}/apps/${appId}/analyticsReportRequests?limit=20`;
  const list = await ascJson(listUrl, jwt);
  const rows = list.body?.data ?? [];
  const ongoing = rows.find((r) => r.attributes?.accessType === 'ONGOING');

  out.list_analytics_report_requests = {
    http_status: list.http_status,
    apple_errors: list.apple_errors,
    request_count: rows.length,
    ongoing_request_id: ongoing?.id ?? null,
    has_active_ongoing_request: Boolean(ongoing?.id),
  };

  if (list.http_status !== 200 || !ongoing?.id) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  const requestId = ongoing.id;
  const reports = await ascJson(
    `${API}/analyticsReportRequests/${requestId}/reports?limit=200`,
    jwt,
  );
  const reportRows = reports.body?.data ?? [];
  const downloadsReport = reportRows.find((r) => {
    const name = (r.attributes?.name ?? '').toLowerCase();
    return name.includes('app store download') || name === 'app downloads';
  });
  const reportId = downloadsReport?.id ?? reportRows[0]?.id ?? null;

  out.downloads_probe = {
    reports_http_status: reports.http_status,
    reports_apple_errors: reports.apple_errors,
    app_store_downloads_report_found: Boolean(downloadsReport?.id),
    report_id: reportId ? '[present]' : null,
  };

  if (!reportId || reports.http_status !== 200) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  const instances = await ascJson(
    `${API}/analyticsReports/${reportId}/instances?filter[granularity]=DAILY&limit=50`,
    jwt,
  );
  const instRows = instances.body?.data ?? [];
  instRows.sort((a, b) =>
    (b.attributes?.processingDate ?? '').localeCompare(
      a.attributes?.processingDate ?? '',
    ),
  );
  const instanceId = instRows[0]?.id ?? null;
  out.downloads_probe.instances_http_status = instances.http_status;
  out.downloads_probe.latest_processing_date =
    instRows[0]?.attributes?.processingDate ?? null;

  if (!instanceId || instances.http_status !== 200) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  const segments = await ascJson(
    `${API}/analyticsReportInstances/${instanceId}/segments`,
    jwt,
  );
  const segUrl = segments.body?.data?.[0]?.attributes?.url ?? null;
  out.downloads_probe.segments_http_status = segments.http_status;

  if (!segUrl || segments.http_status !== 200) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  const gzRes = await fetch(segUrl, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  out.downloads_probe.segment_download_http_status = gzRes.status;
  if (gzRes.ok) {
    const buf = Buffer.from(await gzRes.arrayBuffer());
    const tsv = gunzipSync(buf).toString('utf8');
    out.downloads_probe.first_time_downloads_total =
      sumFirstTimeDownloads(tsv);
  }

  console.log(JSON.stringify(out, null, 2));
})().catch((e) => {
  console.error(JSON.stringify({ fatal: String(e) }));
  process.exit(1);
});