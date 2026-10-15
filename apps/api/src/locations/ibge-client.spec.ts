import { IbgeUnavailableError, fetchIbgeJson } from './ibge-client';

describe('fetchIbgeJson', () => {
  it('rejeita endereco fora do IBGE antes de abrir conexao', async () => {
    await expect(fetchIbgeJson('https://example.com/cidades')).rejects.toBeInstanceOf(
      IbgeUnavailableError,
    );
    await expect(
      fetchIbgeJson('http://servicodados.ibge.gov.br/api/v1/localidades/estados'),
    ).rejects.toBeInstanceOf(IbgeUnavailableError);
    await expect(fetchIbgeJson('nao-e-url')).rejects.toBeInstanceOf(
      IbgeUnavailableError,
    );
  });

  it('nao inclui detalhe interno na falha publica', async () => {
    try {
      await fetchIbgeJson('https://example.com/cidades');
      throw new Error('deveria falhar');
    } catch (error) {
      expect(error).toBeInstanceOf(IbgeUnavailableError);
      expect((error as Error).message).toBe(
        'Não foi possível consultar as cidades. Tente novamente.',
      );
      expect((error as Error).message).not.toMatch(/UNABLE_TO_VERIFY|certificate|example.com/i);
    }
  });
});
