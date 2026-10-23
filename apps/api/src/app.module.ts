import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { BannersModule } from './banners/banners.module';
import { CouponsModule } from './coupons/coupons.module';
import { CreditsModule } from './credits/credits.module';
import { FavoritesModule } from './favorites/favorites.module';
import { HomeModule } from './home/home.module';
import { LocationsModule } from './locations/locations.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { PromoPushModule } from './promo-push/promo-push.module';
import { UploadsModule } from './uploads/uploads.module';
import { ReportsModule } from './reports/reports.module';
import { UsersModule } from './users/users.module';
import { VenuesModule } from './venues/venues.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath:
        process.env.AFTER_CARD_TEST === '1'
          ? ['.env.card-test', '.env']
          : undefined,
    }),
    PrismaModule,
    PromoPushModule,
    AuthModule,
    AdminModule,
    UsersModule,
    VenuesModule,
    HomeModule,
    FavoritesModule,
    CreditsModule,
    CouponsModule,
    BannersModule,
    UploadsModule,
    LocationsModule,
    NotificationsModule,
    ReportsModule,
  ],
})
export class AppModule {}
