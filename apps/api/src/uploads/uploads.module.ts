import { Module } from '@nestjs/common';
import { MediaCleanupService } from './media-cleanup.service';
import { R2StorageService } from './r2-storage.service';
import { UploadsController } from './uploads.controller';

@Module({
  controllers: [UploadsController],
  providers: [R2StorageService, MediaCleanupService],
  exports: [R2StorageService, MediaCleanupService],
})
export class UploadsModule {}
