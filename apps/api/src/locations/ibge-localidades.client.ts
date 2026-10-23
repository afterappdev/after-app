import { Logger } from '@nestjs/common';
import snapshotMeta from './data/ibge-snapshot-meta.json';
import snapshotMunicipalities from './data/ibge-municipalities.json';
import snapshotStates from './data/ibge-states.json';

const STATES_URL =
  'https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome';
const MUNICIPALITIES_URL =
  'https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome';

export type IbgeStateRow = { uf: string; name: string };
export type IbgeMunicipalityRow = { id: number; name: string; uf: string };

type IbgeStateApi = { id: number; sigla: string; nome: string };
type IbgeMunicipalityApi = {
  id: number;
  nome: string;
  microrregiao?: { mesorregiao?: { UF?: { sigla?: string } } };
  'regiao-imediata'?: {
    'regiao-intermediaria'?: { UF?: { sigla?: string } };
  };
};

export type IbgeFetchDeps = {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  logger?: Logger;
};

const defaultLogger = new Logger('IbgeLocalidades');

function ufFromMunicipality(row: IbgeMunicipalityApi): string {
  return (
    row.microrregiao?.mesorregiao?.UF?.sigla ??
    row['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla ??
    ''
  );
}

async function fetchJson<T>(
  url: string,
  deps: IbgeFetchDeps,
): Promise<T | null> {
  const fetchFn = deps.fetchFn ?? fetch;
  const timeoutMs = deps.timeoutMs ?? 12_000;
  const retries = deps.retries ?? 1;
  const logger = deps.logger ?? defaultLogger;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetchFn(url, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        logger.warn(`IBGE HTTP ${res.status} for ${url}`);
        continue;
      }
      return (await res.json()) as T;
    } catch (error) {
      const label = error instanceof Error ? error.name : 'Error';
      logger.warn(
        `IBGE fetch failed (attempt ${attempt + 1}/${retries + 1}, ${label})`,
      );
    }
  }
  return null;
}

export function readOfficialStatesSnapshot(): IbgeStateRow[] {
  return snapshotStates as IbgeStateRow[];
}

export function readOfficialMunicipalitiesSnapshot(): IbgeMunicipalityRow[] {
  return snapshotMunicipalities as IbgeMunicipalityRow[];
}

export function snapshotMetadata(): typeof snapshotMeta {
  return snapshotMeta;
}

export async function loadIbgeStates(
  deps: IbgeFetchDeps = {},
): Promise<{ rows: IbgeStateRow[]; source: 'live' | 'snapshot' }> {
  const live = await fetchJson<IbgeStateApi[]>(STATES_URL, deps);
  if (live?.length) {
    return {
      source: 'live',
      rows: live.map((s) => ({ uf: s.sigla, name: s.nome })),
    };
  }
  const logger = deps.logger ?? defaultLogger;
  logger.warn(
    `IBGE indisponível; usando snapshot oficial (${snapshotMeta.fetchedAt})`,
  );
  return { source: 'snapshot', rows: readOfficialStatesSnapshot() };
}

export async function loadIbgeMunicipalities(
  deps: IbgeFetchDeps = {},
): Promise<{ rows: IbgeMunicipalityRow[]; source: 'live' | 'snapshot' }> {
  const live = await fetchJson<IbgeMunicipalityApi[]>(
    MUNICIPALITIES_URL,
    deps,
  );
  if (live?.length) {
    return {
      source: 'live',
      rows: live.map((c) => ({
        id: c.id,
        name: c.nome,
        uf: ufFromMunicipality(c),
      })),
    };
  }
  const logger = deps.logger ?? defaultLogger;
  logger.warn(
    `IBGE indisponível; usando snapshot oficial (${snapshotMeta.fetchedAt})`,
  );
  return { source: 'snapshot', rows: readOfficialMunicipalitiesSnapshot() };
}

export async function loadIbgeCitiesByUf(
  uf: string,
  deps: IbgeFetchDeps = {},
): Promise<{ rows: IbgeMunicipalityRow[]; source: 'live' | 'snapshot' }> {
  const key = uf.trim().toUpperCase();
  const url = `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${key}/municipios?orderBy=nome`;
  const live = await fetchJson<IbgeCityApi[]>(url, deps);
  if (live?.length) {
    return {
      source: 'live',
      rows: live.map((c) => ({ id: c.id, name: c.nome, uf: key })),
    };
  }
  const fromSnapshot = readOfficialMunicipalitiesSnapshot().filter(
    (c) => c.uf === key,
  );
  if (fromSnapshot.length) {
    const logger = deps.logger ?? defaultLogger;
    logger.warn(
      `IBGE indisponível para UF ${key}; usando snapshot (${snapshotMeta.fetchedAt})`,
    );
    return { source: 'snapshot', rows: fromSnapshot };
  }
  return { source: 'snapshot', rows: [] };
}

type IbgeCityApi = { id: number; nome: string };
