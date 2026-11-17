import { Module } from '@nestjs/common';
import { AppStoreReviewScheduler } from './app-store-review.scheduler';
import { AppStoreReviewStore } from './app-store-review.store';
import { AppStoreReviewSyncService } from './app-store-review-sync.service';

@Module({
  providers: [
    AppStoreReviewStore,
    AppStoreReviewSyncService,
  {
    provide: AppStoreReviewScheduler,
    useFactory: (store: AppStoreReviewStore, sync: AppStoreReviewSyncService) =>
      new AppStoreReviewScheduler(store, sync).useEnv(process.env),
    inject: [AppStoreReviewStore, AppStoreReviewSyncService],
  },
  ],
  exports: [AppStoreReviewSyncService],
})
export class AppStoreReviewModule {}