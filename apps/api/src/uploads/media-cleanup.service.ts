import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { deleteLocalUploads, isLegacyLocalUpload } from '../common/utils/local-uploads';
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
    const seen = new Set<string>();
    for (const raw of urls) {
      const url = raw?.trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      try {
        const removedFromR2 = await this.r2.deleteByUrl(url);
        if (removedFromR2) continue;
        if (isLegacyLocalUpload(url, this.publicApiUrl())) {
          await deleteLocalUploads([url], this.publicApiUrl());
        }
      } catch {
        this.logger.warn(`Falha ao limpar mídia (${this.safeUrl(url)})`);
      }
    }
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
