export class UploadPurgeIncompleteError extends Error {
  constructor(
    public readonly failedUrls: string[],
    message = 'upload_purge_incomplete',
  ) {
    super(message);
    this.name = 'UploadPurgeIncompleteError';
  }
}

export type { UploadCleanupReport } from '../uploads/upload-cleanup.types';
