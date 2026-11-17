import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { UploadsModule } from '../uploads/uploads.module';
import { CouponsModule } from '../coupons/coupons.module';
import { AdminAccountsController } from './accounts/admin-accounts.controller';
import { AdminAccountsService } from './accounts/admin-accounts.service';
import { AdminCouponsController } from './coupons/admin-coupons.controller';
import { AdminAuthController } from './auth/admin-auth.controller';
import { AdminDashboardController } from './dashboard/admin-dashboard.controller';
import { AdminDashboardService } from './dashboard/admin-dashboard.service';
import { RolesGuard } from './guards/roles.guard';
import { AdminMeController } from './me/admin-me.controller';
import { AdminMeService } from './me/admin-me.service';
import { AdminPushTokensController } from './push/admin-push-tokens.controller';
import { AdminPushModule } from './push/admin-push.module';
import { AdminReportsController } from './reports/admin-reports.controller';
import { AdminReportsService } from './reports/admin-reports.service';
import { AdminSalesController } from './sales/admin-sales.controller';
import { AdminSalesService } from './sales/admin-sales.service';
import { AdminStoreMetricsModule } from './store-metrics/admin-store-metrics.module';
import { AdminFinanceController } from './finance-ledger/admin-finance.controller';
import { AdminFinanceService } from './finance-ledger/admin-finance.service';
import { AdminEventoController } from './evento/admin-evento.controller';
import { AdminEventoService } from './evento/admin-evento.service';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    AdminPushModule,
    UploadsModule,
    CouponsModule,
    AdminStoreMetricsModule,
  ],
  controllers: [
    AdminAuthController,
    AdminMeController,
    AdminDashboardController,
    AdminAccountsController,
    AdminSalesController,
    AdminCouponsController,
    AdminPushTokensController,
    AdminReportsController,
    AdminFinanceController,
    AdminEventoController,
  ],
  providers: [
    RolesGuard,
    AdminMeService,
    AdminDashboardService,
    AdminAccountsService,
    AdminSalesService,
    AdminReportsService,
    AdminFinanceService,
    AdminEventoService,
  ],
})
export class AdminModule {}
