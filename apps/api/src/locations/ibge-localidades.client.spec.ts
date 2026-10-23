import { Logger } from '@nestjs/common';
import {
  loadIbgeCitiesByUf,
  loadIbgeMunicipalities,
  loadIbgeStates,
  readOfficialStatesSnapshot,
} from './ibge-localidades.client';

describe('IbgeLocalidadesClient', () => {
  const logger = new Logger('IbgeLocalidadesTest');

  it('uses official snapshot when live fetch times out', async () => {
    const fetchFn = jest.fn(async () => {
      throw new DOMException('Aborted', 'TimeoutError');
    });

    const result = await loadIbgeStates({
      fetchFn,
      timeoutMs: 5,
      retries: 0,
      logger,
    });

    expect(result.source).toBe('snapshot');
    expect(result.rows).toEqual(readOfficialStatesSnapshot());
    expect(fetchFn).toHaveBeenCalled();
  });

  it('uses live IBGE data when fetch succeeds', async () => {
    const fetchFn = jest.fn(async () => ({
      ok: true,
      json: async () => [{ id: 35, sigla: 'SP', nome: 'São Paulo' }],
    })) as unknown as typeof fetch;

    const result = await loadIbgeStates({
      fetchFn,
      retries: 0,
      logger,
    });

    expect(result.source).toBe('live');
    expect(result.rows).toEqual([{ uf: 'SP', name: 'São Paulo' }]);
  });

  it('recovers on retry after a network failure', async () => {
    let calls = 0;
    const fetchFn = jest.fn(async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('fetch failed');
      return {
        ok: true,
        json: async () => [{ id: 33, sigla: 'RJ', nome: 'Rio de Janeiro' }],
      };
    }) as unknown as typeof fetch;

    const result = await loadIbgeStates({
      fetchFn,
      retries: 1,
      logger,
    });

    expect(result.source).toBe('live');
    expect(result.rows[0].uf).toBe('RJ');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('falls back to snapshot municipalities filtered by UF', async () => {
    const fetchFn = jest.fn(async () => {
      throw new Error('network down');
    });

    const result = await loadIbgeCitiesByUf('SP', {
      fetchFn,
      retries: 0,
      logger,
    });

    expect(result.source).toBe('snapshot');
    expect(result.rows.length).toBeGreaterThan(100);
    expect(result.rows.every((c) => c.uf === 'SP')).toBe(true);
  });

  it('loads full municipality snapshot when live list fails', async () => {
    const fetchFn = jest.fn(async () => {
      throw new Error('timeout');
    });

    const result = await loadIbgeMunicipalities({
      fetchFn,
      retries: 0,
      logger,
    });

    expect(result.source).toBe('snapshot');
    expect(result.rows.length).toBeGreaterThan(5000);
  });
});
