import { Module } from '@nestjs/common';
import { SiteTrafficMetricsService } from './site-traffic-metrics.service';
import { StoreDownloadMetricsService } from './store-download-metrics.service';

@Module({
  providers: [StoreDownloadMetricsService, SiteTrafficMetricsService],
  exports: [StoreDownloadMetricsService, SiteTrafficMetricsService],
})
export class AdminStoreMetricsModule {}