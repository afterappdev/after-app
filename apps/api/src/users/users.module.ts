import { Module } from '@nestjs/common';
import { AccountDeletionController } from './account-deletion.controller';
import { AccountDeletionMailer } from './account-deletion.mailer';
import { AccountDeletionService } from './account-deletion.service';
import { ResendAccountDeletionMailer } from './resend-account-deletion.mailer';
import { AuthModule } from '../auth/auth.module';
import { LocationsModule } from '../locations/locations.module';
import { UploadsModule } from '../uploads/uploads.module';
import { UsersController } from './users.controller';
import { AccountLifecycleService } from './account-lifecycle.service';
import { ACCOUNT_PURGE_EXECUTOR } from './account-purge.executor';
import { AccountPermanentPurgeExecutorImpl } from './account-purge.executor.impl';
import { AccountPurgeScheduler } from './account-purge.scheduler';
import { AccountPurgeService } from './account-purge.service';
import { AccountPurgeAuditService } from './account-purge.audit';
import { AccountPurgeStore } from './account-purge.store';
import { UsersService } from './users.service';

@Module({
  imports: [UploadsModule, AuthModule, LocationsModule],
  controllers: [UsersController, AccountDeletionController],
  providers: [
    AccountLifecycleService,
    UsersService,
    AccountDeletionService,
    AccountPurgeAuditService,
    AccountPurgeStore,
    AccountPurgeService,
    AccountPurgeScheduler,
    {
      provide: ACCOUNT_PURGE_EXECUTOR,
      useClass: AccountPermanentPurgeExecutorImpl,
    },
    { provide: AccountDeletionMailer, useClass: ResendAccountDeletionMailer },
  ],
  exports: [UsersService],
})
export class UsersModule {}
