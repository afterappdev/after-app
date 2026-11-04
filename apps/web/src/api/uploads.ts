import type { ApiClient } from './client'

export type UploadResult = {
  url: string
  path?: string
  filename?: string
  mimeType?: string
  size?: number
}

export async function uploadFile(api: ApiClient, file: File): Promise<UploadResult> {
  const row = await api.upload<Record<string, unknown>>('/uploads', file)
  return {
    url: String(row.url ?? ''),
    path: row.path != null ? String(row.path) : undefined,
    filename: row.filename != null ? String(row.filename) : undefined,
    mimeType: row.mimeType != null ? String(row.mimeType) : undefined,
    size: typeof row.size === 'number' ? row.size : undefined,
  }
}
