import { Logger } from '@nestjs/common';

const logger = new Logger('CloudflareWebAnalyticsVisits');

const GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql';

/** Janela padrão antiga (diag / testes). Card do dashboard usa `sinceLaunch`. */
const DASHBOARD_PERIOD_DAYS = 30;

/** Cloudflare Web Analytics retém meses, não anos; pedimos desde o início conhecido do site. */
const DEFAULT_ANALYTICS_SINCE = '2020-01-01';

/** Limite GraphQL CF (~13w2d); pedimos abaixo para margem. */
const CF_MAX_CHUNK_DAYS = 92;

/** CF não serve dados mais antigos que ~26w2d na conta. */
const CF_MAX_HISTORY_DAYS = 182;

const VISITS_QUERY = `
query WebAnalyticsVisits($accountTag: String!, $filter: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      total: rumPageloadEventsAdaptiveGroups(filter: $filter, limit: 1) {
        sum {
          visits
        }
      }
    }
  }
}`;

export type CloudflareWebAnalyticsRange =
  | { kind: 'lastDays'; days: number }
  | { kind: 'lastHours'; hours: number }
  | { kind: 'sinceLaunch' };

export function readWebAnalyticsSinceDate(): string {
  const configured = process.env.CLOUDFLARE_WEB_ANALYTICS_SINCE?.trim();
  if (configured && /^\d{4}-\d{2}-\d{2}$/.test(configured)) {
    return configured;
  }
  return DEFAULT_ANALYTICS_SINCE;
}

/** Início real da série: config, limitado ao que o CF ainda expõe. */
export function effectiveWebAnalyticsSinceDate(now = new Date()): string {
  const configured = readWebAnalyticsSinceDate();
  const retentionFloor = addDaysYmd(
    isoDateUtc(now),
    -(CF_MAX_HISTORY_DAYS - 1),
  );
  return maxYmd(configured, retentionFloor);
}

export const dashboardSiteTrafficRange: CloudflareWebAnalyticsRange = {
  kind: 'sinceLaunch',
};

function isoDateUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map((part) => Number(part));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return isoDateUtc(dt);
}

function maxYmd(a: string, b: string): string {
  return a >= b ? a : b;
}

function minYmd(a: string, b: string): string {
  return a <= b ? a : b;
}

function readConfig():
  | { accountId: string; siteTag: string; token: string }
  | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const siteTag = process.env.CLOUDFLARE_WEB_ANALYTICS_SITE_TAG?.trim();
  const token = process.env.CLOUDFLARE_ANALYTICS_API_TOKEN?.trim();
  if (!accountId || !siteTag || !token) {
    logger.warn(
      'CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_WEB_ANALYTICS_SITE_TAG ou CLOUDFLARE_ANALYTICS_API_TOKEN ausente — visitas indisponíveis.',
    );
    return null;
  }
  return { accountId, siteTag, token };
}

/** Filtro alinhado ao painel Web Analytics (siteTag, bot humano, sem /admin). */
export function buildWebAnalyticsVisitsFilter(
  siteTag: string,
  range: CloudflareWebAnalyticsRange,
): Record<string, unknown> {
  const timeScope =
    range.kind === 'lastHours'
      ? {
          datetime_geq: new Date(
            Date.now() - range.hours * 60 * 60 * 1000,
          ).toISOString(),
          datetime_leq: new Date().toISOString(),
        }
      : range.kind === 'sinceLaunch'
        ? {
            date_geq: readWebAnalyticsSinceDate(),
            date_leq: isoDateUtc(new Date()),
          }
        : (() => {
            const end = new Date();
            const start = new Date(end);
            start.setUTCDate(start.getUTCDate() - (range.days - 1));
            return {
              date_geq: isoDateUtc(start),
              date_leq: isoDateUtc(end),
            };
          })();

  return {
    siteTag,
    bot: 0,
    ...timeScope,
    AND: [
      { requestPath_neq: '/admin' },
      { requestPath_notlike: '/admin/%' },
    ],
  };
}

export function buildWebAnalyticsVisitsFilterForDates(
  siteTag: string,
  dateGeg: string,
  dateLeq: string,
): Record<string, unknown> {
  return {
    siteTag,
    bot: 0,
    date_geq: dateGeg,
    date_leq: dateLeq,
    AND: [
      { requestPath_neq: '/admin' },
      { requestPath_notlike: '/admin/%' },
    ],
  };
}

type VisitsGraphResponse = {
  errors?: { message?: string }[];
  data?: {
    viewer?: {
      accounts?: {
        total?: { sum?: { visits?: number } }[];
      }[];
    };
  };
};

async function fetchVisitsSumForFilter(
  cfg: { accountId: string; siteTag: string; token: string },
  filter: Record<string, unknown>,
): Promise<number | null> {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: VISITS_QUERY,
      variables: { accountTag: cfg.accountId, filter },
    }),
  });

  if (!res.ok) {
    logger.warn(`Cloudflare Web Analytics GraphQL falhou (${res.status}).`);
    return null;
  }

  const json = (await res.json()) as VisitsGraphResponse;

  if (json.errors?.length) {
    logger.warn(
      `Cloudflare Web Analytics GraphQL: ${json.errors.map((e) => e.message ?? 'erro').join('; ')}`,
    );
    return null;
  }

  const visits = json.data?.viewer?.accounts?.[0]?.total?.[0]?.sum?.visits;
  if (typeof visits === 'number' && Number.isFinite(visits)) {
    return Math.trunc(visits);
  }
  return 0;
}

async function fetchSinceLaunchVisits(
  cfg: { accountId: string; siteTag: string; token: string },
): Promise<{ total: number; periodSince: string } | null> {
  const since = effectiveWebAnalyticsSinceDate();
  const end = isoDateUtc(new Date());
  let cursor = since;
  let total = 0;

  while (cursor <= end) {
    const chunkEnd = minYmd(addDaysYmd(cursor, CF_MAX_CHUNK_DAYS - 1), end);
    const filter = buildWebAnalyticsVisitsFilterForDates(
      cfg.siteTag,
      cursor,
      chunkEnd,
    );
    const visits = await fetchVisitsSumForFilter(cfg, filter);
    if (visits === null) return null;
    total += visits;
    if (chunkEnd >= end) break;
    cursor = addDaysYmd(chunkEnd, 1);
  }

  return { total, periodSince: since };
}

export async function fetchCloudflareWebAnalyticsVisits(
  range: CloudflareWebAnalyticsRange = {
    kind: 'lastDays',
    days: DASHBOARD_PERIOD_DAYS,
  },
): Promise<{
  total: number;
  periodDays: number | null;
  periodHours: number | null;
  periodSince: string | null;
  periodScope: 'lastDays' | 'lastHours' | 'sinceLaunch';
} | null> {
  const cfg = readConfig();
  if (!cfg) return null;

  if (range.kind === 'sinceLaunch') {
    const aggregate = await fetchSinceLaunchVisits(cfg);
    if (aggregate === null) return null;
    return {
      total: aggregate.total,
      periodDays: null,
      periodHours: null,
      periodSince: aggregate.periodSince,
      periodScope: 'sinceLaunch',
    };
  }

  const filter = buildWebAnalyticsVisitsFilter(cfg.siteTag, range);
  const visits = await fetchVisitsSumForFilter(cfg, filter);
  if (visits === null) return null;

  const periodSince =
    range.kind === 'lastDays'
      ? (buildWebAnalyticsVisitsFilter(cfg.siteTag, range).date_geq as string)
      : null;

  return {
    total: visits,
    periodDays: range.kind === 'lastDays' ? range.days : null,
    periodHours: range.kind === 'lastHours' ? range.hours : null,
    periodSince,
    periodScope: range.kind,
  };
}

export const dashboardSiteTrafficPeriodDays = DASHBOARD_PERIOD_DAYS;