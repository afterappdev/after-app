import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { PhotoKind } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VenuesService } from './venues.service';

class UpdateVenueDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  coverUrl?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsOptional()
  contacts?: object;

  @IsOptional()
  hoursJson?: object;
}

class AddPhotoDto {
  @IsUrl({ require_tld: false })
  url!: string;

  @IsOptional()
  @IsEnum(PhotoKind)
  kind?: PhotoKind;
}

class UpsertReviewDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(800)
  testimonial?: string;
}

@Controller('venues')
export class VenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  @Get()
  list(@Query('city') city: string) {
    return this.venuesService.listByCity(city ?? '');
  }

  @Get('search')
  search(
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('minRating') minRating?: string,
    @Query('acceptsMealVoucher') acceptsMealVoucher?: string,
    @Query('hasKidsSpace') hasKidsSpace?: string,
    @Query('hasCoverCharge') hasCoverCharge?: string,
    @Query('hasWheelchairAccess') hasWheelchairAccess?: string,
  ) {
    const rating = Number(minRating);
    return this.venuesService.searchByName(q ?? '', {
      category: category?.trim() || undefined,
      minRating: Number.isFinite(rating) && rating > 0 ? rating : undefined,
      acceptsMealVoucher: acceptsMealVoucher === 'true',
      hasKidsSpace: hasKidsSpace === 'true',
      hasCoverCharge: hasCoverCharge === 'true',
      hasWheelchairAccess: hasWheelchairAccess === 'true',
    });
  }

  @Get(':id/reviews')
  listReviews(@Param('id') id: string) {
    return this.venuesService.listReviews(id);
  }

  @Post(':id/reviews')
  @UseGuards(JwtAuthGuard)
  upsertReview(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpsertReviewDto,
  ) {
    return this.venuesService.upsertReview(user, id, dto);
  }

  @Get(':id')
  get(
    @Param('id') id: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('city') city?: string,
  ) {
    return this.venuesService.getPublic(id, lat, lng, city);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateVenueDto,
  ) {
    return this.venuesService.updateOwned(user.userId, id, dto);
  }

  @Post(':id/photos')
  @UseGuards(JwtAuthGuard)
  addPhoto(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddPhotoDto,
  ) {
    return this.venuesService.addPhoto(user.userId, id, dto.url, dto.kind);
  }

  @Delete(':id/photos/:photoId')
  @UseGuards(JwtAuthGuard)
  removePhoto(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('photoId') photoId: string,
  ) {
    return this.venuesService.removePhoto(user.userId, id, photoId);
  }
}
