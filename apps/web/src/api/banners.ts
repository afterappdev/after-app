import type { ApiClient } from './client'
import type {
  BannerHistoryItem,
  BannerPricing,
  CreateBannerPayload,
} from '../features/venue-credits/types'

export async function fetchBannerPricing(api: ApiClient): Promise<BannerPricing> {
  const data = await api.get<Record<string, unknown>>('/banners/pricing')
  return {
    creditPerDisplayDay: Number(data.creditPerDisplayDay ?? 1),
    vipCreditPerDisplayDay: Number(data.vipCreditPerDisplayDay ?? 1),
    commonCreditsPerVipDay: Number(data.commonCreditsPerVipDay ?? 0),
  }
}

function mapBanner(raw: Record<string, unknown>): BannerHistoryItem {
  return {
    id: String(raw.id ?? ''),
    title: raw.title as string | null | undefined,
    description: raw.description as string | null | undefined,
    imageUrl: raw.imageUrl as string | null | undefined,
    status: raw.status as string | null | undefined,
    creditsCost: raw.creditsCost != null ? Number(raw.creditsCost) : null,
    schedules: raw.schedules as BannerHistoryItem['schedules'],
  }
}

export async function fetchBannerHistory(api: ApiClient): Promise<BannerHistoryItem[]> {
  const data = await api.get<unknown>('/banners/history')
  if (!Array.isArray(data)) return []
  return data
    .map((item) =>
      item && typeof item === 'object' ? mapBanner(item as Record<string, unknown>) : null,
    )
    .filter((item): item is BannerHistoryItem => !!item?.id)
}

export async function createBanner(
  api: ApiClient,
  payload: CreateBannerPayload,
  idempotencyKey: string,
): Promise<void> {
  await api.post('/banners', payload, {
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

export async function cancelBanner(api: ApiClient, bannerId: string): Promise<void> {
  await api.post(`/banners/${encodeURIComponent(bannerId)}/cancel`)
}

export type VipPushOptionsResponse = {
  byDate?: Record<string, { options?: string[] }>
}

export async function fetchVipPushOptions(
  api: ApiClient,
  dates: string[],
): Promise<VipPushOptionsResponse> {
  if (dates.length === 0) return {}
  return api.get<VipPushOptionsResponse>('/banners/vip-push-options', {
    dates: dates.join(','),
  })
}
