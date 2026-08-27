import { unlink } from 'fs/promises';
import { basename, join } from 'path';

const UPLOAD_DIR = join(process.cwd(), 'uploads');

export function localUploadFilename(
  url: string | null | undefined,
): string | null {
  if (!url) {
    return null;
  }
  try {
    const path = url.includes('://') ? new URL(url).pathname : url;
    const match = path.match(/\/uploads\/([^/?#]+)$/);
    if (!match) {
      return null;
    }
    const filename = basename(decodeURIComponent(match[1]));
    if (!filename || filename === '.' || filename === '..') {
      return null;
    }
    return filename;
  } catch {
    return null;
  }
}

export async function deleteLocalUploads(
  urls: Array<string | null | undefined>,
) {
  const seen = new Set<string>();
  for (const url of urls) {
    const filename = localUploadFilename(url);
    if (!filename || seen.has(filename)) {
      continue;
    }
    seen.add(filename);
    try {
      await unlink(join(UPLOAD_DIR, filename));
    } catch {
      // Arquivo já ausente ou URL externa (Google/Apple).
    }
  }
}
