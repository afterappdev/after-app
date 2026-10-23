export type IbgeMunicipality = {
  id: number;
  name: string;
  uf: string;
};

export function normalizePlaceName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/**
 * Resolves a municipality only when name and UF identify exactly one IBGE id.
 * A missing UF, an unknown pair, or more than one hit returns null.
 * Name alone is never enough, even when that name appears once.
 */
export function matchIbgeMunicipality(
  cities: readonly IbgeMunicipality[],
  city: string,
  state: string,
): number | null {
  const name = normalizePlaceName(city ?? '');
  const uf = normalizePlaceName(state ?? '');
  if (!name || !uf) return null;
  const hits = cities.filter(
    (item) =>
      normalizePlaceName(item.name) === name &&
      normalizePlaceName(item.uf) === uf,
  );
  if (hits.length !== 1) return null;
  return hits[0].id;
}
