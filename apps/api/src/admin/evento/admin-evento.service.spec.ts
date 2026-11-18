import { AccountLifecycleStatus, Role } from '@prisma/client';
import { AdminEventoService } from './admin-evento.service';

describe('AdminEventoService', () => {
  const prisma = {
    $transaction: jest.fn(),
    user: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    eventoUserCheck: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
  };

  const service = new AdminEventoService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('snapshot agrega usuários USER ativos e checks', async () => {
    prisma.$transaction.mockImplementation(async (ops: Promise<unknown>[]) =>
      Promise.all(ops),
    );
    prisma.user.count.mockResolvedValue(1);
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'u1',
        name: 'Ana',
        email: 'ana@t.com',
        city: 'SP',
        state: 'SP',
        createdAt: new Date('2026-11-01T00:00:00.000Z'),
      },
    ]);
    prisma.eventoUserCheck.findMany.mockResolvedValue([
      { userId: 'u1', checked: true, updatedAt: new Date('2026-11-02T00:00:00.000Z') },
    ]);

    const out = await service.snapshot();
    expect(out.total).toBe(1);
    expect(out.items[0].id).toBe('u1');
    expect(out.checks.u1.checked).toBe(true);
  });

  it('setChecked faz upsert', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      role: Role.USER,
      accountStatus: AccountLifecycleStatus.ACTIVE,
    });
    prisma.eventoUserCheck.upsert.mockResolvedValue({
      userId: 'u1',
      sectionKey: 'after-day-1',
      checked: true,
      updatedAt: new Date('2026-11-03T00:00:00.000Z'),
    });
    const out = await service.setChecked('u1', true, 'after-day-1');
    expect(out.checked).toBe(true);
    expect(prisma.eventoUserCheck.upsert).toHaveBeenCalled();
  });
});