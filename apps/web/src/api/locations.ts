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

export type StateOption = { uf: string; name: string }

export type CityInState = { id: number; name: string }

export async function fetchStates(api: ApiClient): Promise<StateOption[]> {
  const data = await api.get<unknown>('/locations/states')
  if (!Array.isArray(data)) return []
  return data
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      const uf = String(row.uf ?? '')
      const name = String(row.name ?? uf)
      return uf ? { uf, name } : null
    })
    .filter((item): item is StateOption => !!item)
}

export async function fetchCitiesByState(
  api: ApiClient,
  uf: string,
): Promise<CityInState[]> {
  const data = await api.get<unknown>(`/locations/states/${encodeURIComponent(uf)}/cities`)
  if (!Array.isArray(data)) return []
  return data
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      const name = String(row.name ?? '')
      const id = Number(row.id)
      return name && Number.isFinite(id) ? { id, name } : null
    })
    .filter((item): item is CityInState => !!item)
}
