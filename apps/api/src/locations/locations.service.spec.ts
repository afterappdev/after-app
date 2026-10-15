import { ServiceUnavailableException } from '@nestjs/common';
import { fetchIbgeJson } from './ibge-client';
import { LocationsService } from './locations.service';

jest.mock('./ibge-client', () => ({
  fetchIbgeJson: jest.fn(),
}));

const fetchIbgeJsonMock = fetchIbgeJson as jest.MockedFunction<
  typeof fetchIbgeJson
>;

const municipalities = [
  municipality('São Paulo', 'SP', 3550308),
  municipality('São José do Rio Preto', 'SP', 3549805),
  municipality('Campinas', 'SP', 3509502),
  municipality('Rio de Janeiro', 'RJ', 3304557),
  municipality('Rio Claro', 'SP', 3543907),
];

function municipality(nome: string, uf: string, id: number) {
  return {
    id,
    nome,
    microrregiao: { mesorregiao: { UF: { sigla: uf } } },
  };
}

describe('LocationsService searchCities', () => {
  let service: LocationsService;

  beforeEach(() => {
    fetchIbgeJsonMock.mockReset();
    service = new LocationsService();
  });

  it('encontra cidades com e sem acento', async () => {
    fetchIbgeJsonMock.mockResolvedValue(municipalities);

    await expect(service.searchCities('São José do Rio Preto')).resolves.toEqual([
      expect.objectContaining({ name: 'São José do Rio Preto', uf: 'SP' }),
    ]);
    await expect(service.searchCities('sao jose do rio preto')).resolves.toEqual([
      expect.objectContaining({ name: 'São José do Rio Preto', uf: 'SP' }),
    ]);
    await expect(service.searchCities('Campinas')).resolves.toEqual([
      expect.objectContaining({ name: 'Campinas', uf: 'SP' }),
    ]);
    await expect(service.searchCities('São Paulo')).resolves.toEqual([
      expect.objectContaining({ name: 'São Paulo', uf: 'SP' }),
    ]);
    const rio = await service.searchCities('Rio de Janeiro');
    expect(rio[0]).toEqual(
      expect.objectContaining({ name: 'Rio de Janeiro', uf: 'RJ' }),
    );
    expect(rio.map((city) => city.name)).not.toContain('Rio Claro');
  });

  it('usa a regiao imediata quando a microrregiao nao vem na resposta', async () => {
    fetchIbgeJsonMock.mockResolvedValue([
      {
        id: 3509502,
        nome: 'Campinas',
        'regiao-imediata': {
          'regiao-intermediaria': { UF: { sigla: 'SP' } },
        },
      },
    ]);

    await expect(service.searchCities('Campinas')).resolves.toEqual([
      { id: 3509502, name: 'Campinas', uf: 'SP' },
    ]);
  });

  it('nao transforma falha do IBGE em lista vazia', async () => {
    fetchIbgeJsonMock.mockRejectedValue(new Error('UNABLE_TO_VERIFY_LEAF_SIGNATURE'));

    await expect(service.searchCities('Campinas')).rejects.toMatchObject({
      message: 'Não foi possível consultar as cidades. Tente novamente.',
    });
  });

  it('consulta valida sem correspondencia continua vazia', async () => {
    fetchIbgeJsonMock.mockResolvedValue(municipalities);

    await expect(service.searchCities('Cidade Inexistente XYZ')).resolves.toEqual(
      [],
    );
  });

  it('nao transforma resposta invalida em lista vazia', async () => {
    fetchIbgeJsonMock.mockResolvedValue({ message: 'erro' });

    await expect(service.searchCities('Campinas')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
