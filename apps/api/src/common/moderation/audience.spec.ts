import { publicVenueWhere } from './audience';

describe('publicVenueWhere', () => {
  it('sempre oculta venues moderados', () => {
    expect(publicVenueWhere()).toEqual({ moderationHiddenAt: null });
  });

  it('adiciona notIn quando há bloqueios', () => {
    expect(publicVenueWhere(['a', 'b'])).toEqual({
      moderationHiddenAt: null,
      id: { notIn: ['a', 'b'] },
    });
  });
});
