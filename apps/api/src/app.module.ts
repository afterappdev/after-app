import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { BannersModule } from './banners/banners.module';
import { CreditsModule } from './credits/credits.module';
import { FavoritesModule } from './favorites/favorites.module';
import { HomeModule } from './home/home.module';
import { LocationsModule } from './locations/locations.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { UploadsModule } from './uploads/uploads.module';
import { UsersModule } from './users/users.module';
import { VenuesModule } from './venues/venues.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    VenuesModule,
    HomeModule,
    FavoritesModule,
    CreditsModule,
    BannersModule,
    UploadsModule,
    LocationsModule,
    NotificationsModule,
  ],
})
export class AppModule {}
