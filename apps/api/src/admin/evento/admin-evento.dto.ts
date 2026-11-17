import { IsBoolean, IsISO8601, IsOptional, IsString } from 'class-validator';

export class EventoCheckDto {
  @IsBoolean()
  checked!: boolean;
}

export class EventoFeedQueryDto {
  @IsString()
  @IsISO8601()
  since!: string;
}
