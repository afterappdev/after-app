import { Injectable, NotFoundException } from '@nestjs/common';
import { matchIbgeMunicipality } from '../promo-push/ibge-city';
import {
  type IbgeFetchDeps,
  type IbgeMunicipalityRow,
  loadIbgeCitiesByUf,
  loadIbgeMunicipalities,
  loadIbgeStates,
} from './ibge-localidades.client';

export type StateDto = { uf: string; name: string };
export type CityDto = { id: number; name: string };
export type CitySearchDto = { id: number; name: string; uf: string };

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

@Injectable()
export class LocationsService {
  private statesCache: StateDto[] | null = null;
  private citiesCache = new Map<string, CityDto[]>();
  private allCitiesCache: CitySearchDto[] | null = null;
  private ibgeDeps: IbgeFetchDeps = {};

  /** Test hook: inject fetch/timeouts without changing HTTP routes. */
  useIbgeDeps(deps: IbgeFetchDeps): this {
    this.ibgeDeps = deps;
    return this;
  }

  async listStates(): Promise<StateDto[]> {
    if (this.statesCache) {
      return this.statesCache;
    }

    const { rows } = await loadIbgeStates(this.ibgeDeps);
    if (!rows.length) {
      throw new NotFoundException('Não foi possível carregar os estados');
    }

    this.statesCache = rows.map((s) => ({
      uf: s.uf,
      name: s.name,
    }));
    return this.statesCache;
  }

  async listCities(uf: string): Promise<CityDto[]> {
    const key = uf.trim().toUpperCase();
    if (!key) {
      return [];
    }

    const cached = this.citiesCache.get(key);
    if (cached) {
      return cached;
    }

    const { rows } = await loadIbgeCitiesByUf(key, this.ibgeDeps);
    if (!rows.length) {
      throw new NotFoundException(`Cidades não encontradas para ${key}`);
    }

    const cities = rows.map((c) => ({
      id: c.id,
      name: c.name,
    }));
    this.citiesCache.set(key, cities);
    return cities;
  }

  async searchCities(query: string): Promise<CitySearchDto[]> {
    const cities = await this.loadAllCities();
    const term = normalize(query);
    if (!term) {
      return cities
        .filter((c) =>
          ['São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Curitiba', 'Salvador'].includes(
            c.name,
          ),
        )
        .slice(0, 20);
    }

    return cities
      .map((city) => {
        const name = normalize(city.name);
        const uf = normalize(city.uf);
        const combined = `${name} ${uf}`;
        const labeled = `${name}, ${uf}`;
        let score = 0;
        if (name === term || labeled === term) score = 3;
        else if (name.startsWith(term) || labeled.startsWith(term)) score = 2;
        else if (
          name.includes(term) ||
          combined.includes(term) ||
          labeled.includes(term)
        )
          score = 1;
        return { city, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.city.name.localeCompare(b.city.name, 'pt-BR'))
      .slice(0, 20)
      .map((item) => item.city);
  }

  async resolveMunicipalityId(
    city: string,
    state: string,
  ): Promise<number | null> {
    try {
      const cities = await this.loadAllCities();
      return matchIbgeMunicipality(cities, city, state);
    } catch {
      return null;
    }
  }

  async hasMunicipality(id: number): Promise<boolean> {
    if (!Number.isInteger(id) || id <= 0) return false;
    try {
      const cities = await this.loadAllCities();
      return cities.some((city) => city.id === id);
    } catch {
      return false;
    }
  }

  private async loadAllCities(): Promise<CitySearchDto[]> {
    if (this.allCitiesCache) {
      return this.allCitiesCache;
    }

    const { rows } = await loadIbgeMunicipalities(this.ibgeDeps);
    if (!rows.length) {
      throw new NotFoundException('Não foi possível carregar as cidades');
    }

    this.allCitiesCache = rows.map(mapMunicipalityRow);
    return this.allCitiesCache;
  }
}

function mapMunicipalityRow(c: IbgeMunicipalityRow): CitySearchDto {
  return { id: c.id, name: c.name, uf: c.uf };
}
