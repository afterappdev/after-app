import { AccountLifecycleStatus } from '@prisma/client';
import { isVenuePubliclyVisible, publicVenueWhere } from './audience';

describe('publicVenueWhere', () => {
  it('oculta venues moderados e proprietários pendentes de exclusão', () => {
    expect(publicVenueWhere()).toEqual({
      moderationHiddenAt: null,
      ownerArchivedAt: null,
      owner: { accountStatus: AccountLifecycleStatus.ACTIVE },
    });
  });

  it('adiciona notIn quando há bloqueios', () => {
    expect(publicVenueWhere(['a', 'b'])).toEqual({
      moderationHiddenAt: null,
      ownerArchivedAt: null,
      owner: { accountStatus: AccountLifecycleStatus.ACTIVE },
      id: { notIn: ['a', 'b'] },
    });
  });
});

describe('isVenuePubliclyVisible', () => {
  it('exige moderação limpa e owner ACTIVE', () => {
    expect(
      isVenuePubliclyVisible({
        moderationHiddenAt: null,
        owner: { accountStatus: AccountLifecycleStatus.ACTIVE },
      }),
    ).toBe(true);
    expect(
      isVenuePubliclyVisible({
        moderationHiddenAt: new Date(),
        owner: { accountStatus: AccountLifecycleStatus.ACTIVE },
      }),
    ).toBe(false);
    expect(
      isVenuePubliclyVisible({
        moderationHiddenAt: null,
        owner: { accountStatus: AccountLifecycleStatus.PENDING_DELETION },
      }),
    ).toBe(false);
    expect(
      isVenuePubliclyVisible({
        moderationHiddenAt: null,
        ownerArchivedAt: new Date(),
        owner: { accountStatus: AccountLifecycleStatus.ACTIVE },
      }),
    ).toBe(false);
  });
});
