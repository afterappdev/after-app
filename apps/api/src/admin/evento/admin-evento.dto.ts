import { IsBoolean, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class EventoCheckDto {
  @IsBoolean()
  checked!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  section?: string;
}

export class EventoFeedQueryDto {
  @IsString()
  @IsISO8601()
  since!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  section?: string;
}

export class EventoSectionQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  section?: string;
}
