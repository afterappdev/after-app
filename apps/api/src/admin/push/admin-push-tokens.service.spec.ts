import { AdminPushTokensService } from './admin-push-tokens.service';

describe('AdminPushTokensService', () => {
  const prisma = {
    adminDeviceToken: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const service = new AdminPushTokensService(prisma as never);

  beforeEach(() => {
    prisma.adminDeviceToken.upsert.mockReset();
    prisma.adminDeviceToken.deleteMany.mockReset();
  });

  it('upsert do mesmo token não cria duplicata', async () => {
    prisma.adminDeviceToken.upsert.mockResolvedValue({
      id: 'tok-1',
      platform: 'android',
      updatedAt: new Date(),
    });
    await service.register('admin-1', 'fcm-token-abcdefgh', 'android');
    await service.register('admin-1', 'fcm-token-abcdefgh', 'android');
    expect(prisma.adminDeviceToken.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.adminDeviceToken.upsert).toHaveBeenCalledWith({
      where: { token: 'fcm-token-abcdefgh' },
      create: {
        userId: 'admin-1',
        token: 'fcm-token-abcdefgh',
        platform: 'android',
      },
      update: { userId: 'admin-1', platform: 'android' },
    });
  });

  it('remove somente o token do admin autenticado', async () => {
    prisma.adminDeviceToken.deleteMany.mockResolvedValue({ count: 1 });
    await expect(
      service.unregister('admin-1', 'fcm-token-abcdefgh'),
    ).resolves.toEqual({ removed: true });
    expect(prisma.adminDeviceToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'admin-1', token: 'fcm-token-abcdefgh' },
    });
  });
});
