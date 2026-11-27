import { StandardProfileStatus, VenueProfileKind } from '@prisma/client';
import {
  filterVenuesForNearbyDiscovery,
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
        publicacaoAutorizada: true,
        logoUrl: 'https://cdn/logo.png',
        coverUrl: 'https://cdn/cover.png',
      }),
    ).toBe(true);
  });

  it('perfil padrão publicado aparece sem capa nem logo', () => {
    const standard = {
      ...baseVenue,
      profileKind: VenueProfileKind.STANDARD,
      standardProfileStatus: StandardProfileStatus.PUBLISHED,
      category: 'Bar',
      city: 'Goiânia',
      state: 'GO',
      publicacaoAutorizada: false,
    };
    expect(venueVisibleToStrangerDiscovery(standard)).toBe(true);
    expect(listVenuePublicationProfileGaps(standard).length).toBeGreaterThan(0);
  });

  it('perfil padrão em rascunho fica oculto', () => {
    expect(
      venueVisibleToStrangerDiscovery({
        ...baseVenue,
        profileKind: VenueProfileKind.STANDARD,
        standardProfileStatus: StandardProfileStatus.DRAFT,
        category: 'Bar',
        city: 'Goiânia',
        state: 'GO',
      }),
    ).toBe(false);
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

  it('filterVenuesForNearbyDiscovery inclui padrão publicado e exclui rascunho', () => {
    const publishedStandard = {
      ...baseVenue,
      profileKind: VenueProfileKind.STANDARD,
      standardProfileStatus: StandardProfileStatus.PUBLISHED,
      category: 'Bar',
      city: 'Goiânia',
      state: 'GO',
      publicacaoAutorizada: false,
    };
    const draftStandard = {
      ...publishedStandard,
      standardProfileStatus: StandardProfileStatus.DRAFT,
    };
    const complete = {
      ...baseVenue,
      publicacaoAutorizada: true,
      logoUrl: 'https://cdn/logo.png',
      coverUrl: 'https://cdn/cover.png',
    };
    expect(
      filterVenuesForNearbyDiscovery([
        publishedStandard,
        draftStandard,
        complete,
      ]),
    ).toEqual([publishedStandard, complete]);
  });

  it('Divulgador de Eventos ignora checklist de perfil', () => {
    expect(
      venueVisibleToStrangerDiscovery({
        ...baseVenue,
        category: '🎭 Entretenimento e Eventos',
      }),
    ).toBe(true);
    expect(
      venueVisibleToStrangerDiscovery({
        ...baseVenue,
        category: '🎭 Divulgador de Eventos',
        moderationHiddenAt: new Date(),
      }),
    ).toBe(false);
  });
});