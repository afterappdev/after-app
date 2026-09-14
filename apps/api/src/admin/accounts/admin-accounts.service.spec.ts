import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { UsersService } from '../../users/users.service';
import { AdminAccountsService } from './admin-accounts.service';

describe('AdminAccountsService.remove', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
  };
  const users = {
    deleteAccount: jest.fn(),
  };
  let service: AdminAccountsService;

  beforeEach(() => {
    prisma.user.findUnique.mockReset();
    users.deleteAccount.mockReset();
    users.deleteAccount.mockResolvedValue({ ok: true });
    service = new AdminAccountsService(prisma as never, users as never);
  });

  it('admin exclui USER reutilizando UsersService.deleteAccount', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u-user', role: Role.USER });

    await expect(service.remove('u-user')).resolves.toEqual({ success: true });
    expect(users.deleteAccount).toHaveBeenCalledWith('u-user');
  });

  it('admin exclui VENUE reutilizando deleteAccount', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-venue',
      role: Role.VENUE,
    });

    await expect(service.remove('u-venue')).resolves.toEqual({ success: true });
    expect(users.deleteAccount).toHaveBeenCalledWith('u-venue');
  });

  it('conta inexistente → 404 e não chama exclusão', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.remove('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(users.deleteAccount).not.toHaveBeenCalled();
  });

  it('tentativa de excluir ADMIN é bloqueada', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-admin',
      role: Role.ADMIN,
    });

    await expect(service.remove('u-admin')).rejects.toMatchObject({
      message: 'Conta administrativa não pode ser excluída.',
    });
    await expect(service.remove('u-admin')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(users.deleteAccount).not.toHaveBeenCalled();
  });

  it('reutiliza deleteUserRecord e o MediaCleanupService existente', async () => {
    const prismaClient = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ id: 'u-user', role: Role.USER })
          .mockResolvedValueOnce({
            id: 'u-user',
            role: 'USER',
            avatarUrl: 'https://cdn.example/avatar.jpg',
            venue: null,
          }),
        delete: jest.fn().mockResolvedValue({ id: 'u-user' }),
      },
    };
    const mediaCleanup = {
      deleteStoredUploads: jest.fn().mockResolvedValue(undefined),
    };
    const usersService = new UsersService(
      prismaClient as never,
      mediaCleanup as never,
    );
    const deleteUserRecord = jest.spyOn(usersService, 'deleteUserRecord');
    const adminService = new AdminAccountsService(
      prismaClient as never,
      usersService,
    );

    await expect(adminService.remove('u-user')).resolves.toEqual({
      success: true,
    });
    expect(deleteUserRecord).toHaveBeenCalledWith(prismaClient, 'u-user');
    expect(prismaClient.user.delete).toHaveBeenCalledWith({
      where: { id: 'u-user' },
    });
    expect(mediaCleanup.deleteStoredUploads).toHaveBeenCalledWith([
      'https://cdn.example/avatar.jpg',
    ]);
  });
});
