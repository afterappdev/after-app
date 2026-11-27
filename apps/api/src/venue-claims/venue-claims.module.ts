import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { VenueClaimsController } from './venue-claims.controller';
import { VenueClaimsService } from './venue-claims.service';

@Module({
  imports: [ConfigModule],
  controllers: [VenueClaimsController],
  providers: [VenueClaimsService],
})
export class VenueClaimsModule {}