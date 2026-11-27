import {
  buildWebAnalyticsVisitsFilter,
  fetchCloudflareWebAnalyticsVisits,
} from './cloudflare-web-analytics-visits';

describe('buildWebAnalyticsVisitsFilter', () => {
  it('usa siteTag, bot 0, datas de 30 dias e exclui /admin', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-12T15:00:00.000Z'));

    const filter = buildWebAnalyticsVisitsFilter('site-tag-1', {
      kind: 'lastDays',
      days: 30,
    }) as {
      bot: number;
      AND: Record<string, unknown>[];
    };

    expect(filter.bot).toBe(0);
    expect(filter.siteTag).toBe('site-tag-1');
    expect(filter.date_geq).toBe('2026-10-14');
    expect(filter.date_leq).toBe('2026-11-12');
    expect(filter.AND).toEqual([
      { requestPath_neq: '/admin' },
      { requestPath_notlike: '/admin/%' },
    ]);

    jest.useRealTimers();
  });

  it('sinceLaunch usa CLOUDFLARE_WEB_ANALYTICS_SINCE ou padrão 2020-01-01', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-12T15:00:00.000Z'));
    delete process.env.CLOUDFLARE_WEB_ANALYTICS_SINCE;

    const filter = buildWebAnalyticsVisitsFilter('site-tag-1', {
      kind: 'sinceLaunch',
    }) as { date_geq: string; date_leq: string };

    expect(filter.date_geq).toBe('2020-01-01');
    expect(filter.date_leq).toBe('2026-11-12');

    process.env.CLOUDFLARE_WEB_ANALYTICS_SINCE = '2025-08-01';
    const custom = buildWebAnalyticsVisitsFilter('site-tag-1', {
      kind: 'sinceLaunch',
    }) as { date_geq: string };
    expect(custom.date_geq).toBe('2025-08-01');

    jest.useRealTimers();
  });

  it('monta janela rolling 24h com datetime para conferência no painel', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-12T15:00:00.000Z'));

    const filter = buildWebAnalyticsVisitsFilter('site-tag-1', {
      kind: 'lastHours',
      hours: 24,
    }) as { AND: Record<string, unknown>[] };

    expect(filter.datetime_geq).toBe('2026-11-11T15:00:00.000Z');
    expect(filter.datetime_leq).toBe('2026-11-12T15:00:00.000Z');

    jest.useRealTimers();
  });
});

describe('fetchCloudflareWebAnalyticsVisits', () => {
  const env = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...env };
  });

  afterAll(() => {
    process.env = env;
  });

  it('retorna null sem configuração', async () => {
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_WEB_ANALYTICS_SITE_TAG;
    delete process.env.CLOUDFLARE_ANALYTICS_API_TOKEN;
    await expect(fetchCloudflareWebAnalyticsVisits()).resolves.toBeNull();
  });

  it('aceita zero visitas como resultado válido', async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acc';
    process.env.CLOUDFLARE_WEB_ANALYTICS_SITE_TAG = 'site';
    process.env.CLOUDFLARE_ANALYTICS_API_TOKEN = 'tok';

    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          viewer: {
            accounts: [{ total: [{ sum: { visits: 0 } }] }],
          },
        },
      }),
    } as Response);

    const result = await fetchCloudflareWebAnalyticsVisits({
      kind: 'lastHours',
      hours: 24,
    });
    expect(result).toEqual({
      total: 0,
      periodDays: null,
      periodHours: 24,
      periodSince: null,
      periodScope: 'lastHours',
    });
  });

  it('soma sum.visits da resposta GraphQL', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-12T15:00:00.000Z'));
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acc';
    process.env.CLOUDFLARE_WEB_ANALYTICS_SITE_TAG = 'site';
    process.env.CLOUDFLARE_ANALYTICS_API_TOKEN = 'tok';

    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          viewer: {
            accounts: [{ total: [{ sum: { visits: 128 } }] }],
          },
        },
      }),
    } as Response);

    const result = await fetchCloudflareWebAnalyticsVisits({
      kind: 'lastDays',
      days: 30,
    });
    expect(result).toEqual({
      total: 128,
      periodDays: 30,
      periodHours: null,
      periodSince: '2026-10-14',
      periodScope: 'lastDays',
    });
    jest.useRealTimers();
  });
});
