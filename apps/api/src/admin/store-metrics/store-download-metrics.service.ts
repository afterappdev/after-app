import { Injectable, Logger } from '@nestjs/common';
import { fetchGooglePlayTotalInstalls } from './google-play-install-stats';
import { fetchAppleAppTotalDownloads } from './apple-app-download-stats';

export type StoreDownloadMetric = {
  total: number | null;
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
      const total = await fetchGooglePlayTotalInstalls();
      return {
        total,
        available: total != null,
        source: 'google_play',
        fetchedAt: new Date().toISOString(),
      };
    } catch (err) {
      return {
        ...emptyMetric('google_play'),
        error: String(err),
      };
    }
  }

  private async safeApple(): Promise<StoreDownloadMetric> {
    try {
      const total = await fetchAppleAppTotalDownloads();
      return {
        total,
        available: total != null,
        source: 'app_store',
        fetchedAt: new Date().toISOString(),
      };
    } catch (err) {
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
    available: false,
    source,
    fetchedAt: null,
  };
}
