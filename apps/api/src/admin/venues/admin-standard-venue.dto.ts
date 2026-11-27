import {
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateAdminStandardVenueDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  @MaxLength(120)
  city!: string;

  @IsString()
  @MaxLength(40)
  state!: string;

  @IsString()
  @MaxLength(120)
  category!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  logoUrl?: string;

  @IsOptional()
  contacts?: object;

  @IsOptional()
  hoursJson?: object;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  menuUrl?: string | null;
}