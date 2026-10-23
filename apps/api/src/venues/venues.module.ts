import { Module } from '@nestjs/common';
import { LocationsModule } from '../locations/locations.module';
import { UploadsModule } from '../uploads/uploads.module';
import { VenuesController } from './venues.controller';
import { VenuesService } from './venues.service';

@Module({
  imports: [UploadsModule, LocationsModule],
  controllers: [VenuesController],
  providers: [VenuesService],
  exports: [VenuesService],
})
export class VenuesModule {}
