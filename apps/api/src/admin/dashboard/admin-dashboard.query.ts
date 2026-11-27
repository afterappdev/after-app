import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, Matches } from 'class-validator';

export class AdminDashboardQueryDto {
  /** Business month YYYY-MM for month-scoped KPIs and rankings. */
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  yearMonth?: string;

  /** Reconsulta Play/App Store/Cloudflare ignorando cache de métricas externas. */
  @IsOptional()
  @Transform(({ value }) => value === '1' || value === 'true' || value === true)
  @IsBoolean()
  refreshMetrics?: boolean;
}
