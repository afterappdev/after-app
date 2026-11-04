import type { ApiClient } from './client'
import type { CityOption } from '../features/home/types'

function mapCity(raw: Record<string, unknown>): CityOption {
  return {
    name: String(raw.name ?? ''),
    uf: String(raw.uf ?? raw.state ?? ''),
  }
}

export async function searchCities(
  api: ApiClient,
  q: string,
): Promise<CityOption[]> {
  const data = await api.get<unknown>('/locations/cities', { q: q.trim() })
  if (!Array.isArray(data)) return []
  return data
    .map((item) =>
      item && typeof item === 'object'
        ? mapCity(item as Record<string, unknown>)
        : null,
    )
    .filter((item): item is CityOption => !!item?.name)
}

export async function fetchStates(api: ApiClient): Promise<string[]> {
  const data = await api.get<unknown>('/locations/states')
  if (!Array.isArray(data)) return []
  return data.map((item) => String(item))
}
