import { ReportStatus } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class ModerateReportDto {
  @IsEnum(ReportStatus)
  @IsIn([ReportStatus.REVIEWING, ReportStatus.RESOLVED, ReportStatus.REJECTED])
  status!: ReportStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adminNote?: string;

  @IsOptional()
  @IsBoolean()
  removeContent?: boolean;
}
