import { Module } from '@nestjs/common';
import { R2StorageService } from './r2-storage.service';
import { UploadsController } from './uploads.controller';

@Module({
  controllers: [UploadsController],
  providers: [R2StorageService],
})
export class UploadsModule {}
