import { HttpException } from '@nestjs/common';
import { StandardProfileStatus, VenueProfileKind } from '@prisma/client';
import {
  assertVenueRegistrationAllowed,
  findVenueRegistrationConflicts,
  normalizeVenueComparableText,
} from './venue-registration-dedupe';
import { AFTER_STANDARD_OWNER_USER_ID } from './venue-standard-profile';

describe('venue-registration-dedupe', () => {
  it('normaliza acentos e caixa no nome', () => {
    expect(normalizeVenueComparableText('Arena Coxits Beach')).toBe(
      'arena coxits beach',
    );
    expect(normalizeVenueComparableText('São José')).toBe('sao jose');
  });

  it('bloqueia cadastro quando existe perfil padrão publicado com mesmo nome', async () => {
    const prisma = {
      venue: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'v-standard',
            name: 'Arena Coxits Beach',
            city: 'Matinhos',
            state: 'PR',
            profileKind: VenueProfileKind.STANDARD,
            standardProfileStatus: StandardProfileStatus.PUBLISHED,
            contacts: { address: 'Rua A, 10' },
            ownerUserId: AFTER_STANDARD_OWNER_USER_ID,
          },
        ]),
      },
    };

    await expect(
      assertVenueRegistrationAllowed(prisma, {
        name: 'Arena Coxits Beach',
        city: 'Matinhos',
        state: 'PR',
      }),
    ).rejects.toBeInstanceOf(HttpException);

    const conflicts = await findVenueRegistrationConflicts(prisma, {
      name: 'Arena Coxits Beach',
      city: 'Matinhos',
      state: 'PR',
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.kind).toBe('claim_standard');
  });

  it('permite outra unidade quando o endereço difere', async () => {
    const prisma = {
      venue: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'v-standard',
            name: 'Rede Burguer',
            city: 'Curitiba',
            state: 'PR',
            profileKind: VenueProfileKind.STANDARD,
            standardProfileStatus: StandardProfileStatus.PUBLISHED,
            contacts: { address: 'Rua A, 100' },
            ownerUserId: AFTER_STANDARD_OWNER_USER_ID,
          },
        ]),
      },
    };

  await expect(
      assertVenueRegistrationAllowed(prisma, {
        name: 'Rede Burguer',
        city: 'Curitiba',
        state: 'PR',
        address: 'Av Brasil 9999',
      }),
    ).resolves.toBeUndefined();
  });
});