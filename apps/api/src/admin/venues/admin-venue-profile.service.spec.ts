import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PhotoKind } from '@prisma/client';
import { AdminVenueProfileService } from './admin-venue-profile.service';

describe('AdminVenueProfileService', () => {
  const prisma = {
    venue: { findUnique: jest.fn() },
  };
  const venues = {
    persistPublicProfile: jest.fn(),
    addPhotoForAdmin: jest.fn(),
    removePhotoForAdmin: jest.fn(),
  };
  const service = new AdminVenueProfileService(
    prisma as never,
    venues as never,
  );

  const stored = {
    id: 'v1',
    name: 'Bar',
    city: 'Campinas',
    state: 'SP',
    category: 'Bar',
    logoUrl: null,
    coverUrl: null,
    menuUrl: null,
    contacts: { phone: '119999' },
    hoursJson: null,
    photos: [
      {
        id: 'p1',
        url: 'https://cdn.example/foto.jpg',
        kind: PhotoKind.GALLERY,
        mediaType: 'IMAGE',
        sortOrder: 0,
      },
    ],
  };

  beforeEach(() => {
    prisma.venue.findUnique.mockReset();
    venues.persistPublicProfile.mockReset();
    venues.addPhotoForAdmin.mockReset();
    venues.removePhotoForAdmin.mockReset();
  });

  it('devolve o perfil público e o que ainda falta', async () => {
    prisma.venue.findUnique.mockResolvedValue(stored);

    const profile = await service.get('v1');

    expect(profile.photos).toEqual(stored.photos);
    expect(profile.contacts).toEqual({ phone: '119999' });
    expect(profile.missingForProfile).toEqual(
      expect.arrayContaining([
        'logo cadastrada',
        'foto de capa cadastrada',
        'endereço no perfil (campo address em contacts)',
      ]),
    );
  });

  it('recusa estabelecimento inexistente', async () => {
    prisma.venue.findUnique.mockResolvedValue(null);
    await expect(service.get('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('grava nome, endereço e horários no mesmo perfil do dono', async () => {
    prisma.venue.findUnique
      .mockResolvedValueOnce({ ...stored, ownerUserId: 'u1' })
      .mockResolvedValueOnce({
        ...stored,
        name: 'Bar Central',
        logoUrl: 'https://cdn.example/logo.jpg',
        contacts: { phone: '119999', address: 'Rua A, 10' },
        hoursJson: { mon: { open: '18:00', close: '23:00' } },
      });
    venues.persistPublicProfile.mockResolvedValue({});

    await service.save('v1', {
      name: '  Bar Central  ',
      state: 'sp',
      contacts: { address: 'Rua A, 10', phone: '119999' },
      hoursJson: { mon: { open: '18:00', close: '23:00' } },
      menuUrl: 'https://cardapio.example',
    });

    expect(venues.persistPublicProfile).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'v1' }),
      {
        name: 'Bar Central',
        state: 'SP',
        contacts: { address: 'Rua A, 10', phone: '119999' },
        hoursJson: { mon: { open: '18:00', close: '23:00' } },
        menuUrl: 'https://cardapio.example',
      },
    );
  });

  it('recusa nome curto', async () => {
    prisma.venue.findUnique.mockResolvedValue(stored);
    await expect(service.save('v1', { name: ' A ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(venues.persistPublicProfile).not.toHaveBeenCalled();
  });

  it('inclui e remove foto pelo estabelecimento', async () => {
    venues.addPhotoForAdmin.mockResolvedValue({ id: 'p2' });
    venues.removePhotoForAdmin.mockResolvedValue({ ok: true });

    await service.addPhoto('v1', 'https://cdn.example/menu.jpg', PhotoKind.MENU);
    await service.removePhoto('v1', 'p2');

    expect(venues.addPhotoForAdmin).toHaveBeenCalledWith(
      'v1',
      'https://cdn.example/menu.jpg',
      PhotoKind.MENU,
      undefined,
    );
    expect(venues.removePhotoForAdmin).toHaveBeenCalledWith('v1', 'p2');
  });
});
