import { IsOptional, Matches } from 'class-validator';

export class AdminSalesSummaryQueryDto {
  /** Inclusive business dates YYYY-MM-DD. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  /** Alternative to from/to: business month YYYY-MM. */
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  yearMonth?: string;
}
