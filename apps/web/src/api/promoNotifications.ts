import type { ApiClient } from './client'

export type PromoNotificationPreferences = {
  enabled: boolean
  ibgeCityId: number | null
  city: string
  state: string
  lastAuthorizedIbgeCityId: number | null
  lastAuthorizedCityAt: string | null
  locationFresh: boolean
}

export async function fetchPromoPreferences(
  api: ApiClient,
): Promise<PromoNotificationPreferences> {
  return api.get<PromoNotificationPreferences>('/promo-notifications/preferences')
}

export async function setPromoPreferencesEnabled(
  api: ApiClient,
  enabled: boolean,
): Promise<PromoNotificationPreferences> {
  return api.put<PromoNotificationPreferences>('/promo-notifications/preferences', {
    enabled,
  })
}
