import { Logger } from '@nestjs/common';

const logger = new Logger('CloudflareWebAnalyticsVisits');

const GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql';

const DASHBOARD_PERIOD_DAYS = 30;

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
  | { kind: 'lastHours'; hours: number };

function isoDateUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
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

export async function fetchCloudflareWebAnalyticsVisits(
  range: CloudflareWebAnalyticsRange = {
    kind: 'lastDays',
    days: DASHBOARD_PERIOD_DAYS,
  },
): Promise<{ total: number; periodDays: number | null; periodHours: number | null } | null> {
  const cfg = readConfig();
  if (!cfg) return null;

  const filter = buildWebAnalyticsVisitsFilter(cfg.siteTag, range);

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

  const json = (await res.json()) as {
    errors?: { message?: string }[];
    data?: {
      viewer?: {
        accounts?: {
          total?: { sum?: { visits?: number } }[];
        }[];
      };
    };
  };

  if (json.errors?.length) {
    logger.warn(
      `Cloudflare Web Analytics GraphQL: ${json.errors.map((e) => e.message ?? 'erro').join('; ')}`,
    );
    return null;
  }

  const visits = json.data?.viewer?.accounts?.[0]?.total?.[0]?.sum?.visits;
  if (typeof visits !== 'number' || !Number.isFinite(visits)) {
    logger.warn('Cloudflare Web Analytics GraphQL sem sum.visits na resposta.');
    return null;
  }

  return {
    total: Math.trunc(visits),
    periodDays: range.kind === 'lastDays' ? range.days : null,
    periodHours: range.kind === 'lastHours' ? range.hours : null,
  };
}

export const dashboardSiteTrafficPeriodDays = DASHBOARD_PERIOD_DAYS;
