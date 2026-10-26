import { IsIn, IsOptional } from 'class-validator';

export class AdminAccountRemoveQueryDto {
  /**
   * hard: refuse when financial blockers exist.
   * tombstone: anonymize and retain financial rows when blockers exist.
   */
  @IsOptional()
  @IsIn(['hard', 'tombstone'])
  strategy?: 'hard' | 'tombstone';
}
