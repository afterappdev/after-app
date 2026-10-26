import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { deleteLocalUploads, isLegacyLocalUpload } from '../common/utils/local-uploads';
import type { UploadCleanupReport } from './upload-cleanup.types';
import { R2StorageService } from './r2-storage.service';

@Injectable()
export class MediaCleanupService {
  private readonly logger = new Logger(MediaCleanupService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly r2: R2StorageService,
  ) {}

  async deleteStoredUpload(url: string | null | undefined): Promise<void> {
    await this.deleteStoredUploads([url]);
  }

  async deleteStoredUploads(
    urls: Array<string | null | undefined>,
  ): Promise<void> {
    await this.deleteStoredUploadsWithReport(urls);
  }

  async deleteStoredUploadsWithReport(
    urls: Array<string | null | undefined>,
  ): Promise<UploadCleanupReport> {
    const failedUrls: string[] = [];
    let attempted = 0;
    let removed = 0;
    const seen = new Set<string>();
    for (const raw of urls) {
      const url = raw?.trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      attempted += 1;
      try {
        const removedFromR2 = await this.r2.deleteByUrl(url);
        if (removedFromR2) {
          removed += 1;
          continue;
        }
        if (isLegacyLocalUpload(url, this.publicApiUrl())) {
          await deleteLocalUploads([url], this.publicApiUrl());
          removed += 1;
          continue;
        }
        removed += 1;
      } catch {
        failedUrls.push(url);
        this.logger.warn(`Falha ao limpar mídia (${this.safeUrl(url)})`);
      }
    }
    return { attempted, removed, failedUrls };
  }

  private publicApiUrl(): string | undefined {
    return this.config.get<string>('PUBLIC_API_URL');
  }

  private safeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return 'relative-or-invalid';
    }
  }
}
