import { Injectable, Logger } from '@nestjs/common';
import {
  dashboardSiteTrafficRange,
  fetchCloudflareWebAnalyticsVisits,
  effectiveWebAnalyticsSinceDate,
} from './cloudflare-web-analytics-visits';

export type SiteTrafficMetric = {
  total: number | null;
  available: boolean;
  metric: 'visits';
  periodDays: number | null;
  periodSince: string | null;
  periodScope: 'sinceLaunch' | 'lastDays' | 'lastHours' | null;
  fetchedAt: string | null;
  error?: string;
};

const CACHE_MS_OK = 6 * 60 * 60 * 1000;
const CACHE_MS_ZERO = 15 * 60 * 1000;
const CACHE_MS_FAIL = 60 * 1000;

const WAIT_FOR_REFRESH_MS = 45_000;

@Injectable()
export class SiteTrafficMetricsService {
  private readonly logger = new Logger(SiteTrafficMetricsService.name);
  private cache: SiteTrafficMetric | null = null;
  private cacheUntil = 0;
  private refresh: Promise<void> | null = null;

  invalidateCache(): void {
    this.cache = null;
    this.cacheUntil = 0;
  }

  async getMetric(options?: { forceRefresh?: boolean }): Promise<SiteTrafficMetric> {
    if (options?.forceRefresh === true) this.invalidateCache();

    const now = Date.now();
    if (this.cache && now < this.cacheUntil) return this.cache;
    if (!this.refresh) {
      this.refresh = this.refreshMetric()
        .catch((err) => {
          this.logger.warn(String(err));
        })
        .finally(() => {
          this.refresh = null;
        });
    }
    if (this.cache) return this.cache;
    await Promise.race([
      this.refresh,
      new Promise((resolve) => setTimeout(resolve, WAIT_FOR_REFRESH_MS)),
    ]);
    return this.cache ?? emptyMetric();
  }

  private async refreshMetric() {
    this.cache = await this.safeFetch();
    const ttl = !this.cache.available
      ? CACHE_MS_FAIL
      : this.cache.total === 0
        ? CACHE_MS_ZERO
        : CACHE_MS_OK;
    this.cacheUntil = Date.now() + ttl;
  }

  private async safeFetch(): Promise<SiteTrafficMetric> {
    try {
      const result = await fetchCloudflareWebAnalyticsVisits(
        dashboardSiteTrafficRange,
      );
      if (!result) return emptyMetric();
      return {
        total: result.total,
        available: true,
        metric: 'visits',
        periodDays: result.periodDays,
        periodSince: result.periodSince,
        periodScope: result.periodScope,
        fetchedAt: new Date().toISOString(),
      };
    } catch (err) {
      return {
        ...emptyMetric(),
        error: String(err),
      };
    }
  }
}

function emptyMetric(): SiteTrafficMetric {
  return {
    total: null,
    available: false,
    metric: 'visits',
    periodDays: null,
    periodSince: effectiveWebAnalyticsSinceDate(),
    periodScope: 'sinceLaunch',
    fetchedAt: null,
  };
}
