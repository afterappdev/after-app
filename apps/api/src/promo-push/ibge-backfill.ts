import { IbgeMunicipality, matchIbgeMunicipality } from './ibge-city';

export type IbgeBackfillRow = {
  id: string;
  city: string;
  state: string;
  ibgeCityId: number | null;
};

/**
 * Fills only rows whose IBGE id is still null and whose name+UF matches
 * exactly one municipality. A stored id is never replaced. Ambiguous names,
 * a missing UF and an unknown pair stay null.
 */
export function planIbgeBackfill(
  rows: readonly IbgeBackfillRow[],
  cities: readonly IbgeMunicipality[],
): { id: string; ibgeCityId: number }[] {
  const planned: { id: string; ibgeCityId: number }[] = [];
  for (const row of rows) {
    if (row.ibgeCityId != null) continue;
    const ibgeCityId = matchIbgeMunicipality(cities, row.city, row.state);
    if (ibgeCityId == null) continue;
    planned.push({ id: row.id, ibgeCityId });
  }
  return planned;
}
