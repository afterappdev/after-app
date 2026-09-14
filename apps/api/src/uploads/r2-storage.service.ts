import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { basename, extname } from 'path';

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

  async deleteByKey(key: string): Promise<void> {
    const safeKey = parseR2ObjectKey(key);
    if (!safeKey) {
      throw new Error('Invalid R2 object key');
    }
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: safeKey,
      }),
    );
  }

  async deleteByUrl(url: string): Promise<boolean> {
    const key = r2ObjectKeyFromPublicUrl(url, this.publicUrl);
    if (!key) {
      return false;
    }
    await this.deleteByKey(key);
    return true;
  }
}

const SAFE_FILENAME = /^[A-Za-z0-9._-]+$/;

export function parseR2ObjectKey(key: string): string | null {
  const trimmed = key.trim();
  if (!trimmed || trimmed.includes('\\') || trimmed.includes('..')) {
    return null;
  }
  if (trimmed.includes('//') || trimmed.startsWith('/') || trimmed.endsWith('/')) {
    return null;
  }
  if (!trimmed.startsWith('uploads/')) {
    return null;
  }
  const filename = trimmed.slice('uploads/'.length);
  if (!filename || filename.includes('/') || filename === '.' || filename === '..') {
    return null;
  }
  if (filename !== basename(filename) || !SAFE_FILENAME.test(filename)) {
    return null;
  }
  return `uploads/${filename}`;
}

export function r2ObjectKeyFromPublicUrl(
  url: string,
  publicBaseUrl: string,
): string | null {
  const base = publicBaseUrl.trim().replace(/\/$/, '');
  const raw = url.trim();
  if (!base || !raw) return null;
  try {
    const parsed = new URL(raw);
    const expected = new URL(base);
    if (parsed.origin !== expected.origin) {
      return null;
    }
    if (!parsed.pathname.startsWith('/')) {
      return null;
    }
    return parseR2ObjectKey(parsed.pathname.slice(1));
  } catch {
    return null;
  }
}

function required(config: ConfigService, key: string): string {
  const value = config.get<string>(key)?.trim() ?? '';
  if (!value) {
    throw new Error(`${key} is not configured`);
  }
  return value;
}
