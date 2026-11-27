import { MediaType, PhotoKind } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class UpdateAdminVenueProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  coverUrl?: string;

  @IsOptional()
  contacts?: object;

  @IsOptional()
  hoursJson?: object;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  menuUrl?: string | null;
}

export class AddAdminVenuePhotoDto {
  @IsUrl({ require_tld: false })
  url!: string;

  @IsEnum(PhotoKind)
  kind!: PhotoKind;

  @IsOptional()
  @IsEnum(MediaType)
  mediaType?: MediaType;
}
