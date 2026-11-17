import {
  listVenuePublicationProfileGaps,
  venueVisibleToStrangerDiscovery,
} from './venue-publication';

const baseVenue = {
  ownerUserId: 'o1',
  moderationHiddenAt: null,
  name: 'Mineiro Bar e Grill',
  logoUrl: null,
  coverUrl: null,
  contacts: { address: 'Rua 1' },
  hoursJson: { mon: { open: '10:00', close: '22:00' } },
};

describe('venueVisibleToStrangerDiscovery', () => {
  it('oculta sem logo e capa', () => {
    expect(venueVisibleToStrangerDiscovery(baseVenue)).toBe(false);
    const gaps = listVenuePublicationProfileGaps(baseVenue);
    expect(gaps).toContain('logo cadastrada');
    expect(gaps).toContain('foto de capa cadastrada');
  });

  it('exibe com perfil completo', () => {
    expect(
      venueVisibleToStrangerDiscovery({
        ...baseVenue,
        logoUrl: 'https://cdn/logo.png',
        coverUrl: 'https://cdn/cover.png',
      }),
    ).toBe(true);
  });

  it('oculta quando moderado', () => {
    expect(
      venueVisibleToStrangerDiscovery({
        ...baseVenue,
        moderationHiddenAt: new Date(),
        logoUrl: 'https://cdn/logo.png',
        coverUrl: 'https://cdn/cover.png',
      }),
    ).toBe(false);
  });
});