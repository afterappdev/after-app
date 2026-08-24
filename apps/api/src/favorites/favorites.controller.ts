import { Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FavoritesService } from './favorites.service';

@Controller('favorites')
@UseGuards(JwtAuthGuard)
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.favoritesService.list(user.userId);
  }

  @Post(':venueId')
  add(@CurrentUser() user: AuthUser, @Param('venueId') venueId: string) {
    return this.favoritesService.add(user.userId, venueId);
  }

  @Delete(':venueId')
  remove(@CurrentUser() user: AuthUser, @Param('venueId') venueId: string) {
    return this.favoritesService.remove(user.userId, venueId);
  }
}
