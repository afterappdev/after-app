import { unlink } from 'fs/promises';
import { basename, join } from 'path';

const UPLOAD_DIR = join(process.cwd(), 'uploads');

const LEGACY_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://10.0.2.2:3000',
]);

const SAFE_FILENAME = /^[A-Za-z0-9._-]+$/;

function publicApiOrigin(publicApiUrl?: string | null): string | null {
  const raw = publicApiUrl?.trim() || process.env.PUBLIC_API_URL?.trim() || '';
  if (!raw) return null;
  try {
    return new URL(raw.replace(/\/$/, '')).origin;
  } catch {
    return null;
  }
}

function safeUploadFilename(name: string): string | null {
  const filename = basename(name);
  if (!filename || filename === '.' || filename === '..') return null;
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return null;
  }
  if (!SAFE_FILENAME.test(filename)) return null;
  return filename;
}

function pathnameFilename(pathname: string): string | null {
  const match = pathname.match(/^\/uploads\/([^/]+)$/);
  if (!match) return null;
  try {
    return safeUploadFilename(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

export function isLegacyLocalUpload(
  url: string | null | undefined,
  publicApiUrl?: string | null,
): boolean {
  return localUploadFilename(url, publicApiUrl) != null;
}

export function localUploadFilename(
  url: string | null | undefined,
  publicApiUrl?: string | null,
): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    if (!trimmed.includes('://')) {
      if (trimmed.includes('\\') || trimmed.includes('..')) return null;
      return pathnameFilename(trimmed.split(/[?#]/)[0]);
    }

    const parsed = new URL(trimmed);
    const allowedOrigin = publicApiOrigin(publicApiUrl);
    const isLegacyHost =
      LEGACY_ORIGINS.has(parsed.origin) ||
      (allowedOrigin != null && parsed.origin === allowedOrigin);
    if (!isLegacyHost) {
      return null;
    }
    return pathnameFilename(parsed.pathname);
  } catch {
    return null;
  }
}

export async function deleteLocalUploads(
  urls: Array<string | null | undefined>,
  publicApiUrl?: string | null,
) {
  const seen = new Set<string>();
  for (const url of urls) {
    const filename = localUploadFilename(url, publicApiUrl);
    if (!filename || seen.has(filename)) {
      continue;
    }
    seen.add(filename);
    try {
      await unlink(join(UPLOAD_DIR, filename));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        continue;
      }
      throw err;
    }
  }
}
