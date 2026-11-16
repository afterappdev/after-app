import { Module } from '@nestjs/common';
import { VenuesModule } from '../venues/venues.module';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

@Module({
  imports: [VenuesModule],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
