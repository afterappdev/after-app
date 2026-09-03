import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { REAL_SALE_PROVIDERS } from '../finance';

export class AdminSalesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsIn([...REAL_SALE_PROVIDERS])
  provider?: (typeof REAL_SALE_PROVIDERS)[number];

  /** Inclusive calendar date in America/Sao_Paulo. Format YYYY-MM-DD. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  /** Inclusive calendar date in America/Sao_Paulo. Format YYYY-MM-DD. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;
}

export class AdminSalesMonthlyQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(36)
  months?: number;
}
