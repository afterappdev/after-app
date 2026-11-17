/**
 * Diagnóstico ASC (só leitura). Usa variáveis Railway / APP_STORE_CONNECT_*.
 * Não imprime JWT nem .p8.
 */
const {
  createAppStoreConnectJwt,
} = require('../src/admin/store-metrics/app-store-connect-jwt');
const {
  fetchAppleAppInstallAggregate,
} = require('../src/admin/store-metrics/apple-app-download-stats');

const API = 'https://api.appstoreconnect.apple.com/v1';

function envFlag(name) {
  const v = process.env[name];
  if (v == null || String(v).trim() === '') return 'missing';
  return 'set';
}

function pickAppleErrors(body) {
  return (body?.errors ?? []).map((e) => ({
    status: e.status ?? null,
    code: e.code ?? null,
    title: e.title ?? null,
  }));
}

async function ascGet(url, jwt) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/json' },
  });
  let json = {};
  try {
    json = JSON.parse(await res.text());
  } catch {
    json = {};
  }
  return { http_status: res.status, apple_errors: pickAppleErrors(json), body: res.ok ? json : null };
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
    list_requests: null,
    standard_report_probe: null,
    dashboard_aggregate: null,
  };

  if (!jwt || !appId) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  const list = await ascGet(
    `${API}/apps/${appId}/analyticsReportRequests?limit=50`,
    jwt,
  );
  const rows = list.body?.data ?? [];
  const ongoing = rows.find((r) => r.attributes?.accessType === 'ONGOING');
  const snapshot = rows.find((r) => r.attributes?.accessType === 'ONE_TIME_SNAPSHOT');

  out.list_requests = {
    http_status: list.http_status,
    apple_errors: list.apple_errors,
    request_count: rows.length,
    has_ongoing: Boolean(ongoing?.id),
    has_one_time_snapshot: Boolean(snapshot?.id),
    access_types: rows.map((r) => r.attributes?.accessType).filter(Boolean),
  };

  async function probeRequest(requestId, label) {
    if (!requestId) return null;
    const reports = await ascGet(
      `${API}/analyticsReportRequests/${requestId}/reports?limit=200`,
      jwt,
    );
    const names = (reports.body?.data ?? []).map((r) => r.attributes?.name);
    const standard = names.find(
      (n) => String(n).toLowerCase() === 'app downloads standard',
    );
    let instanceCount = null;
    let instancesHttp = null;
    if (standard && reports.body?.data) {
      const hit = reports.body.data.find((r) => r.attributes?.name === standard);
      if (hit?.id) {
        const inst = await ascGet(
          `${API}/analyticsReports/${hit.id}/instances?filter[granularity]=DAILY&limit=200`,
          jwt,
        );
        instancesHttp = inst.http_status;
        instanceCount = (inst.body?.data ?? []).length;
      }
    }
    return {
      label,
      reports_http_status: reports.http_status,
      standard_report_name: standard ?? null,
      daily_instance_count: instanceCount,
      instances_http_status: instancesHttp,
    };
  }

  out.standard_report_probe = {
    ongoing: await probeRequest(ongoing?.id, 'ONGOING'),
    snapshot: await probeRequest(snapshot?.id, 'ONE_TIME_SNAPSHOT'),
  };

  try {
    const agg = await fetchAppleAppInstallAggregate();
    out.dashboard_aggregate = agg
      ? {
          total_first_time_downloads: agg.total,
          first_data_date: agg.firstDataDate,
          last_data_date: agg.lastDataDate,
          period_covered: `${agg.firstDataDate}..${agg.lastDataDate}`,
        }
      : { pending: true, reason: 'sem instâncias/segmentos ou relatório standard ainda não pronto' };
  } catch (e) {
    out.dashboard_aggregate = { pending: true, reason: String(e) };
  }

  console.log(JSON.stringify(out, null, 2));
})().catch((e) => {
  console.error(JSON.stringify({ fatal: String(e) }));
  process.exit(1);
});