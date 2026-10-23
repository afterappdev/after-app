import { matchIbgeMunicipality } from './ibge-city';

const cities = [
  { id: 4302808, name: 'Bom Jesus', uf: 'RS' },
  { id: 2201903, name: 'Bom Jesus', uf: 'PI' },
  { id: 3550308, name: 'São Paulo', uf: 'SP' },
  { id: 3509502, name: 'Campinas', uf: 'SP' },
];

describe('matchIbgeMunicipality', () => {
  it('resolve nome e UF acentuados', () => {
    expect(matchIbgeMunicipality(cities, 'sao paulo', 'sp')).toBe(3550308);
    expect(matchIbgeMunicipality(cities, 'São Paulo', 'SP')).toBe(3550308);
  });

  it('separa municípios homônimos pela UF', () => {
    expect(matchIbgeMunicipality(cities, 'Bom Jesus', 'RS')).toBe(4302808);
    expect(matchIbgeMunicipality(cities, 'Bom Jesus', 'PI')).toBe(2201903);
  });

  it('não casa só pelo nome, mesmo quando ele é único', () => {
    expect(matchIbgeMunicipality(cities, 'Campinas', '')).toBeNull();
    expect(matchIbgeMunicipality(cities, 'Campinas', 'SP')).toBe(3509502);
  });

  it('devolve nulo quando a UF não identifica o nome', () => {
    expect(matchIbgeMunicipality(cities, 'Bom Jesus', 'SP')).toBeNull();
    expect(matchIbgeMunicipality(cities, 'Bom Jesus', 'XX')).toBeNull();
    expect(matchIbgeMunicipality(cities, '', 'SP')).toBeNull();
  });
});
