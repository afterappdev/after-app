import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminAccountsController } from './accounts/admin-accounts.controller';
import { AdminAccountsService } from './accounts/admin-accounts.service';
import { AdminAuthController } from './auth/admin-auth.controller';
import { AdminDashboardController } from './dashboard/admin-dashboard.controller';
import { AdminDashboardService } from './dashboard/admin-dashboard.service';
import { RolesGuard } from './guards/roles.guard';
import { AdminMeController } from './me/admin-me.controller';
import { AdminMeService } from './me/admin-me.service';
import { AdminPushTokensController } from './push/admin-push-tokens.controller';
import { AdminPushModule } from './push/admin-push.module';
import { AdminSalesController } from './sales/admin-sales.controller';
import { AdminSalesService } from './sales/admin-sales.service';

@Module({
  imports: [AuthModule, AdminPushModule],
  controllers: [
    AdminAuthController,
    AdminMeController,
    AdminDashboardController,
    AdminAccountsController,
    AdminSalesController,
    AdminPushTokensController,
  ],
  providers: [
    RolesGuard,
    AdminMeService,
    AdminDashboardService,
    AdminAccountsService,
    AdminSalesService,
  ],
})
export class AdminModule {}
