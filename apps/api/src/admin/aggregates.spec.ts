import { Role } from '@prisma/client';
import { consumerTotals } from './aggregates';

describe('consumerTotals', () => {
  it('venues soma registros Venue; accounts soma usuários + locais', async () => {
    const prisma = {
      user: {
        groupBy: jest.fn().mockResolvedValue([
          { role: Role.USER, _count: { _all: 10 } },
          { role: Role.VENUE, _count: { _all: 2 } },
        ]),
      },
      venue: {
        count: jest.fn().mockResolvedValue(7),
      },
    };

    await expect(consumerTotals(prisma as never)).resolves.toEqual({
      users: 10,
      venues: 7,
      accounts: 17,
    });
  });
});
