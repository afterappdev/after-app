import { IsOptional, Matches } from 'class-validator';

export class AdminDashboardQueryDto {
  /** Business month YYYY-MM for month-scoped KPIs and rankings. */
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  yearMonth?: string;
}
