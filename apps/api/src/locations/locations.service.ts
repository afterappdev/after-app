import { Injectable, NotFoundException } from '@nestjs/common';

type IbgeState = {
  id: number;
  sigla: string;
  nome: string;
};

type IbgeCity = {
  id: number;
  nome: string;
};

export type StateDto = { uf: string; name: string };
export type CityDto = { id: number; name: string };
export type CitySearchDto = { id: number; name: string; uf: string };

type IbgeMunicipality = IbgeCity & {
  microrregiao?: { mesorregiao?: { UF?: { sigla?: string } } };
  'regiao-imediata'?: {
    'regiao-intermediaria'?: { UF?: { sigla?: string } };
  };
};

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

  async listStates(): Promise<StateDto[]> {
    if (this.statesCache) {
      return this.statesCache;
    }

    const res = await fetch(
      'https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome',
    );
    if (!res.ok) {
      throw new NotFoundException('Não foi possível carregar os estados');
    }

    const data = (await res.json()) as IbgeState[];
    this.statesCache = data.map((s) => ({
      uf: s.sigla,
      name: s.nome,
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

    const res = await fetch(
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${key}/municipios?orderBy=nome`,
    );
    if (!res.ok) {
      throw new NotFoundException(`Cidades não encontradas para ${key}`);
    }

    const data = (await res.json()) as IbgeCity[];
    const cities = data.map((c) => ({
      id: c.id,
      name: c.nome,
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
        let score = 0;
        if (name === term) score = 3;
        else if (name.startsWith(term)) score = 2;
        else if (name.includes(term)) score = 1;
        return { city, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.city.name.localeCompare(b.city.name, 'pt-BR'))
      .slice(0, 20)
      .map((item) => item.city);
  }

  private async loadAllCities(): Promise<CitySearchDto[]> {
    if (this.allCitiesCache) {
      return this.allCitiesCache;
    }

    const res = await fetch(
      'https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome',
    );
    if (!res.ok) {
      throw new NotFoundException('Não foi possível carregar as cidades');
    }

    const data = (await res.json()) as IbgeMunicipality[];
    this.allCitiesCache = data.map((c) => ({
      id: c.id,
      name: c.nome,
      uf:
        c.microrregiao?.mesorregiao?.UF?.sigla ??
        c['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla ??
        '',
    }));
    return this.allCitiesCache;
  }
}
