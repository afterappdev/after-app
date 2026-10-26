import { Injectable, Logger } from '@nestjs/common';

export type AccountPurgeAuditEvent =
  | 'deletion_requested'
  | 'deletion_cancelled'
  | 'job_started'
  | 'job_blocked'
  | 'job_resumed'
  | 'data_anonymized'
  | 'uploads_removed'
  | 'uploads_partial_failure'
  | 'job_completed'
  | 'job_failed'
  | 'admin_purge_hard'
  | 'admin_purge_tombstone';

@Injectable()
export class AccountPurgeAuditService {
  private readonly logger = new Logger('AccountPurgeAudit');

  log(
    event: AccountPurgeAuditEvent,
    fields: Record<string, string | number | boolean | undefined | null>,
  ): void {
    const safe = Object.entries(fields)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => {
        const text = String(value).replace(/\s+/g, ' ').slice(0, 120);
        return `${key}=${text}`;
      })
      .join(' ');
    this.logger.log(`event=${event}${safe ? ` ${safe}` : ''}`);
  }
}
