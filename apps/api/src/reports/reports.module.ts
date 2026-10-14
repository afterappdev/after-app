import { Module } from '@nestjs/common';
import { AdminPushModule } from '../admin/push/admin-push.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [AdminPushModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
