/**
 * Garante analyticsReportRequest ONE_TIME_SNAPSHOT (só cria se faltar).
 * Chave Admin Codemagic After via CLI — não mexe no Railway. Sem .p8/JWT na saída.
 */
const { existsSync, readFileSync } = require('fs');
const { resolve } = require('path');

const API = 'https://api.appstoreconnect.apple.com/v1';
const DEFAULT_APP_ID = '6812746791';

function parseArgs(argv) {
  const out = { appId: DEFAULT_APP_ID };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--issuer' && argv[i + 1]) out.issuer = argv[++i].trim();
    else if (a === '--key-id' && argv[i + 1]) out.keyId = argv[++i].trim();
    else if (a === '--p8' && argv[i + 1]) out.p8Path = resolve(argv[++i]);
    else if (a === '--app-id' && argv[i + 1]) out.appId = argv[++i].trim();
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function pickAppleErrors(body) {
  return (body?.errors ?? []).map((e) => ({
    status: e.status ?? null,
    code: e.code ?? null,
    title: e.title ?? null,
    detail: e.detail ?? null,
  }));
}

async function ascJson(method, url, jwt, body) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = {};
  try {
    json = JSON.parse(await res.text());
  } catch {
    json = {};
  }
  return { http_status: res.status, apple_errors: pickAppleErrors(json), body: res.ok ? json : null };
}

function loadJwt(args) {
  if (!args.issuer || !args.keyId || !args.p8Path || !existsSync(args.p8Path)) return null;
  process.env.APP_STORE_CONNECT_ISSUER_ID = args.issuer;
  process.env.APP_STORE_CONNECT_KEY_ID = args.keyId;
  process.env.APP_STORE_CONNECT_PRIVATE_KEY = readFileSync(args.p8Path, 'utf8');
  const p = require.resolve('../src/admin/store-metrics/app-store-connect-jwt');
  delete require.cache[p];
  return require(p).createAppStoreConnectJwt();
}

async function listSnapshot(appId, jwt) {
  const url = `${API}/apps/${appId}/analyticsReportRequests?limit=50`;
  const list = await ascJson('GET', url, jwt);
  const rows = list.body?.data ?? [];
  const snapshot = rows.find((r) => r.attributes?.accessType === 'ONE_TIME_SNAPSHOT');
  const ongoing = rows.find((r) => r.attributes?.accessType === 'ONGOING');
  return { list, snapshotId: snapshot?.id ?? null, ongoingId: ongoing?.id ?? null, requestCount: rows.length };
}

(async () => {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log('Uso: node ... asc-ensure-snapshot-analytics.js --issuer UUID --key-id ID --p8 path [--app-id 6812746791]');
    process.exit(0);
  }

  const report = { app_id: args.appId, jwt: 'unavailable', action: null, get_before: null, post_create: null, get_after: null };
  const jwt = loadJwt(args);
  if (!jwt) {
    report.error = 'issuer, key-id e --p8 válidos são obrigatórios.';
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  report.jwt = 'ok';

  const before = await listSnapshot(args.appId, jwt);
  report.get_before = {
    http_status: before.list.http_status,
    apple_errors: before.list.apple_errors,
    request_count: before.requestCount,
    has_ongoing: Boolean(before.ongoingId),
    has_snapshot: Boolean(before.snapshotId),
    snapshot_request_id: before.snapshotId ? '[present]' : null,
  };

  if (before.list.http_status !== 200) {
    report.action = 'aborted_list_failed';
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }

  if (before.snapshotId) {
    report.action = 'skipped_snapshot_exists';
    report.get_after = report.get_before;
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  report.action = 'creating_one_time_snapshot';
  const post = await ascJson('POST', `${API}/analyticsReportRequests`, jwt, {
    data: {
      type: 'analyticsReportRequests',
      attributes: { accessType: 'ONE_TIME_SNAPSHOT' },
      relationships: { app: { data: { type: 'apps', id: args.appId } } },
    },
  });
  report.post_create = {
    http_status: post.http_status,
    apple_errors: post.apple_errors,
    created: Boolean(post.body?.data?.id),
  };

  const after = await listSnapshot(args.appId, jwt);
  report.get_after = {
    http_status: after.list.http_status,
    apple_errors: after.list.apple_errors,
    request_count: after.requestCount,
    has_snapshot: Boolean(after.snapshotId),
    snapshot_request_id: after.snapshotId ? '[present]' : null,
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(after.snapshotId ? 0 : 3);
})().catch((e) => {
  console.error(JSON.stringify({ fatal: String(e) }));
  process.exit(1);
});