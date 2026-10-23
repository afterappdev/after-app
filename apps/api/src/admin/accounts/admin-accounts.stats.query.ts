import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminAccountsStatsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  state?: string;
}
