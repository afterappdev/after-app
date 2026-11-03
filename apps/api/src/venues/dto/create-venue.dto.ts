import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateVenueDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  city!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(2)
  state!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsIn(['CPF', 'CNPJ'])
  documentType?: 'CPF' | 'CNPJ';

  @IsOptional()
  @IsString()
  @MaxLength(18)
  documentNumber?: string;
}
