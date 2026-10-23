import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdatePromoPreferenceDto {
  @IsBoolean()
  enabled!: boolean;
}

export class UpdatePromoLocationDto {
  @IsOptional()
  @IsBoolean()
  clear?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  ibgeCityId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  state?: string;
}

export class RegisterPromoPushTokenDto {
  @IsString()
  @MinLength(16)
  @MaxLength(4096)
  token!: string;

  @IsIn(['android', 'ios', 'web'])
  platform!: 'android' | 'ios' | 'web';
}

export class UnregisterPromoPushTokenDto {
  @IsString()
  @MinLength(16)
  @MaxLength(4096)
  token!: string;
}
