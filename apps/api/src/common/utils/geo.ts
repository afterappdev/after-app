type GeoPoint = { lat: number; lng: number };

const geoCache = new Map<string, GeoPoint | null>();

export function parseCoord(value?: string): number | null {
  if (value == null || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function haversineKm(
  from: GeoPoint,
  to: { lat?: number | null; lng?: number | null },
): number | null {
  if (to.lat == null || to.lng == null) return null;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const earthKm = 6371;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) *
      Math.cos(toRad(to.lat)) *
      Math.sin(dLng / 2) ** 2;
  return earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function nominatimSearch(cacheKey: string, query: string): Promise<GeoPoint | null> {
  const key = cacheKey.trim().toLowerCase();
  if (!key) return null;
  if (geoCache.has(key)) {
    return geoCache.get(key) ?? null;
  }

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'AfterApp/1.0 (local dev)' },
    });
    if (!res.ok) {
      geoCache.set(key, null);
      return null;
    }
    const data = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    const first = data[0];
    const lat = first?.lat != null ? Number(first.lat) : NaN;
    const lng = first?.lon != null ? Number(first.lon) : NaN;
    const point =
      Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    geoCache.set(key, point);
    return point;
  } catch {
    geoCache.set(key, null);
    return null;
  }
}

export async function geocodeCity(city: string): Promise<GeoPoint | null> {
  const name = city.trim();
  if (!name) return null;
  return nominatimSearch(`city:${name}`, `${name}, Brasil`);
}

export async function geocodePlace(query: string): Promise<GeoPoint | null> {
  const q = query.trim();
  if (!q) return null;
  return nominatimSearch(`place:${q}`, q);
}

export function contactsStreetAddress(contacts: unknown): string {
  if (!contacts || typeof contacts !== 'object' || Array.isArray(contacts)) {
    return '';
  }
  const address = (contacts as { address?: unknown }).address;
  return typeof address === 'string' ? address.trim() : '';
}

/** Query for the street address saved on the venue profile. */
export function venueProfileGeoQuery(input: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
}): string | null {
  const address = input.address?.trim() ?? '';
  if (!address) return null;
  const parts = [address, input.city?.trim(), input.state?.trim(), 'Brasil'].filter(
    (part) => part,
  );
  return parts.join(', ');
}

export async function geocodeVenueProfile(input: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
}): Promise<GeoPoint | null> {
  const query = venueProfileGeoQuery(input);
  if (!query) return null;
  return geocodePlace(query);
}
