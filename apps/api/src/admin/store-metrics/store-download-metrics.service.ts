import { Injectable, Logger } from '@nestjs/common';
import { fetchGooglePlayInstallAggregate } from './google-play-install-stats';
import { fetchAppleAppInstallAggregate } from './apple-app-download-stats';

export type StoreDownloadMetric = {
  total: number | null;
  lastDataDate: string | null;
  available: boolean;
  source: 'google_play' | 'app_store';
  fetchedAt: string | null;
  error?: string;
};

export type StoreDownloadMetrics = {
  googlePlay: StoreDownloadMetric;
  appStore: StoreDownloadMetric;
};

const CACHE_MS_OK = 6 * 60 * 60 * 1000;
const CACHE_MS_FAIL = 60 * 1000;

@Injectable()
export class StoreDownloadMetricsService {
  private readonly logger = new Logger(StoreDownloadMetricsService.name);
  private cache: StoreDownloadMetrics | null = null;
  private cacheUntil = 0;
  private refresh: Promise<void> | null = null;
  private lastGoodGoogle: StoreDownloadMetric | null = null;
  private lastGoodApple: StoreDownloadMetric | null = null;

  async getMetrics(): Promise<StoreDownloadMetrics> {
    const now = Date.now();
    if (this.cache && now < this.cacheUntil) return this.cache;
    if (!this.refresh) {
      this.refresh = this.refreshMetrics()
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
      new Promise((resolve) => setTimeout(resolve, 12_000)),
    ]);
    return (
      this.cache ?? {
        googlePlay: emptyMetric('google_play'),
        appStore: emptyMetric('app_store'),
      }
    );
  }

  private async refreshMetrics() {
    const [play, apple] = await Promise.all([
      this.safeGoogle(),
      this.safeApple(),
    ]);
    this.cache = { googlePlay: play, appStore: apple };
    const ok = play.available || apple.available;
    this.cacheUntil = Date.now() + (ok ? CACHE_MS_OK : CACHE_MS_FAIL);
  }

  private async safeGoogle(): Promise<StoreDownloadMetric> {
    try {
      const agg = await fetchGooglePlayInstallAggregate();
      if (agg != null) {
        const metric: StoreDownloadMetric = {
          total: agg.total,
          lastDataDate: agg.lastDataDate,
          available: true,
          source: 'google_play',
          fetchedAt: new Date().toISOString(),
        };
        this.lastGoodGoogle = metric;
        return metric;
      }
      if (this.lastGoodGoogle) {
        return {
          ...this.lastGoodGoogle,
          fetchedAt: new Date().toISOString(),
        };
      }
      return emptyMetric('google_play');
    } catch (err) {
      if (this.lastGoodGoogle) {
        return {
          ...this.lastGoodGoogle,
          fetchedAt: new Date().toISOString(),
          error: String(err),
        };
      }
      return {
        ...emptyMetric('google_play'),
        error: String(err),
      };
    }
  }

  private async safeApple(): Promise<StoreDownloadMetric> {
    try {
      const agg = await fetchAppleAppInstallAggregate();
      if (agg != null) {
        const metric: StoreDownloadMetric = {
          total: agg.total,
          lastDataDate: agg.lastDataDate,
          available: true,
          source: 'app_store',
          fetchedAt: new Date().toISOString(),
        };
        this.lastGoodApple = metric;
        return metric;
      }
      if (this.lastGoodApple) {
        return {
          ...this.lastGoodApple,
          fetchedAt: new Date().toISOString(),
        };
      }
      return emptyMetric('app_store');
    } catch (err) {
      if (this.lastGoodApple) {
        return {
          ...this.lastGoodApple,
          fetchedAt: new Date().toISOString(),
          error: String(err),
        };
      }
      return {
        ...emptyMetric('app_store'),
        error: String(err),
      };
    }
  }
}

function emptyMetric(source: StoreDownloadMetric['source']): StoreDownloadMetric {
  return {
    total: null,
    lastDataDate: null,
    available: false,
    source,
    fetchedAt: null,
  };
}
