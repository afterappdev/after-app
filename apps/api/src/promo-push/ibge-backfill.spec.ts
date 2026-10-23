import { planIbgeBackfill } from './ibge-backfill';

const cities = [
  { id: 3550308, name: 'São Paulo', uf: 'SP' },
  { id: 2201903, name: 'Bom Jesus', uf: 'PI' },
  { id: 2502300, name: 'Bom Jesus', uf: 'PB' },
  { id: 3549805, name: 'São José do Rio Preto', uf: 'SP' },
];

describe('planIbgeBackfill', () => {
  it('preenche só o nulo com par nome+UF único e é idempotente', () => {
    const rows = [
      { id: 'u1', city: 'São Paulo', state: 'SP', ibgeCityId: null },
      { id: 'u2', city: 'São Paulo', state: 'SP', ibgeCityId: 3550308 },
      { id: 'u3', city: 'Bom Jesus', state: 'SP', ibgeCityId: null },
      { id: 'u4', city: 'São Paulo', state: '', ibgeCityId: null },
      { id: 'u5', city: 'Cidade Inexistente', state: 'SP', ibgeCityId: null },
    ];
    const planned = planIbgeBackfill(rows, cities);
    expect(planned).toEqual([{ id: 'u1', ibgeCityId: 3550308 }]);
    const again = planIbgeBackfill(
      rows.map((row) =>
        row.id === 'u1' ? { ...row, ibgeCityId: 3550308 } : row,
      ),
      cities,
    );
    expect(again).toEqual([]);
  });
});
