import { Module } from '@nestjs/common';
import { AccountDeletionController } from './account-deletion.controller';
import { AccountDeletionMailer } from './account-deletion.mailer';
import { AccountDeletionService } from './account-deletion.service';
import { SmtpAccountDeletionMailer } from './smtp-account-deletion.mailer';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController, AccountDeletionController],
  providers: [
    UsersService,
    AccountDeletionService,
    { provide: AccountDeletionMailer, useClass: SmtpAccountDeletionMailer },
  ],
  exports: [UsersService],
})
export class UsersModule {}
