import { venueMatchesSearchWords } from './venue-search-keywords';

describe('venueMatchesSearchWords', () => {
  const asian = {
    name: 'Izakaya',
    description: null,
    category: '🍣 Culinária Asiática',
    musicStyle: null,
    contacts: {},
  };
  const pagode = {
    name: 'Boteco',
    description: null,
    category: '🍻 Bares e Botecos',
    musicStyle: 'Pagode',
    contacts: {},
  };
  const kids = {
    name: 'Cantina',
    description: 'Almoço em família',
    category: '🍽️ Restaurantes',
    musicStyle: null,
    contacts: { hasKidsSpace: true },
  };

  it('casa sushi com culinária asiática', () => {
    expect(venueMatchesSearchWords(asian, 'sushi')).toBe(true);
    expect(venueMatchesSearchWords(asian, 'pagode')).toBe(false);
  });

  it('casa pagode com o estilo musical', () => {
    expect(venueMatchesSearchWords(pagode, 'pagode')).toBe(true);
    expect(venueMatchesSearchWords(pagode, 'Pagode')).toBe(true);
  });

  it('casa área kids com espaço kids, em qualquer ordem', () => {
    expect(venueMatchesSearchWords(kids, 'area kids')).toBe(true);
    expect(venueMatchesSearchWords(kids, 'Área kids')).toBe(true);
    expect(venueMatchesSearchWords(kids, 'kids area')).toBe(true);
    expect(venueMatchesSearchWords(pagode, 'area kids')).toBe(false);
  });

  it('casa palavra na descrição', () => {
    expect(
      venueMatchesSearchWords(
        { ...asian, category: '🍽️ Restaurantes', description: 'Rodízio de sushi' },
        'sushi',
      ),
    ).toBe(true);
  });
});
