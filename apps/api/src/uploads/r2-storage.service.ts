import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { extname } from 'path';

const ALLOWED_EXT = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.heic',
  '.heif',
  '.bmp',
  '.avif',
  '.mp4',
  '.mov',
  '.webm',
  '.m4v',
  '.mpeg',
  '.mpg',
  '.3gp',
  '.avi',
  '.mkv',
]);

export type StoredUpload = {
  key: string;
  filename: string;
  path: string;
  url: string;
};

export function objectExtension(
  originalname: string,
  mimetype: string,
): string {
  const ext = extname(originalname).toLowerCase();
  if (ALLOWED_EXT.has(ext)) return ext;
  if (mimetype === 'image/jpeg') return '.jpg';
  if (mimetype === 'image/png') return '.png';
  if (mimetype === 'image/webp') return '.webp';
  if (mimetype === 'image/gif') return '.gif';
  if (mimetype === 'video/mp4') return '.mp4';
  if (mimetype === 'video/webm') return '.webm';
  if (mimetype === 'video/quicktime') return '.mov';
  if (mimetype.startsWith('image/')) return '.jpg';
  if (mimetype.startsWith('video/')) return '.mp4';
  return '.bin';
}

@Injectable()
export class R2StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(config: ConfigService) {
    const accountId = required(config, 'R2_ACCOUNT_ID');
    const accessKeyId = required(config, 'R2_ACCESS_KEY_ID');
    const secretAccessKey = required(config, 'R2_SECRET_ACCESS_KEY');
    this.bucket = required(config, 'R2_BUCKET');
    this.publicUrl = required(config, 'R2_PUBLIC_URL').replace(/\/$/, '');

    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  async upload(input: {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
  }): Promise<StoredUpload> {
    const ext = objectExtension(input.originalname, input.mimetype);
    const filename = `${randomUUID()}${ext}`;
    const key = `uploads/${filename}`;

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: input.buffer,
          ContentType: input.mimetype,
        }),
      );
    } catch {
      throw new ServiceUnavailableException(
        'Não foi possível enviar o arquivo',
      );
    }

    return {
      key,
      filename,
      path: `/${key}`,
      url: `${this.publicUrl}/${key}`,
    };
  }
}

function required(config: ConfigService, key: string): string {
  const value = config.get<string>(key)?.trim() ?? '';
  if (!value) {
    throw new Error(`${key} is not configured`);
  }
  return value;
}
