import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { UsersService } from '../../users/users.service';
import { AdminAccountsService } from './admin-accounts.service';

describe('AdminAccountsService.remove', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
  };
  const users = {
    purgeAccountPermanently: jest.fn(),
  };
  let service: AdminAccountsService;

  beforeEach(() => {
    prisma.user.findUnique.mockReset();
    users.purgeAccountPermanently.mockReset();
    users.purgeAccountPermanently.mockResolvedValue({
      ok: true,
      outcome: 'hard_deleted',
    });
    service = new AdminAccountsService(prisma as never, users as never);
  });

  it('admin exclui USER com purge imediato', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u-user', role: Role.USER });

    await expect(service.remove('u-user')).resolves.toEqual({
      success: true,
      outcome: 'hard_deleted',
    });
    expect(users.purgeAccountPermanently).toHaveBeenCalledWith('u-user', {
      strategy: 'hard',
      auditSource: 'admin',
    });
  });

  it('admin exclui VENUE com purge imediato', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-venue',
      role: Role.VENUE,
    });

    await expect(service.remove('u-venue')).resolves.toEqual({
      success: true,
      outcome: 'hard_deleted',
    });
    expect(users.purgeAccountPermanently).toHaveBeenCalledWith('u-venue', {
      strategy: 'hard',
      auditSource: 'admin',
    });
  });

  it('conta inexistente → 404 e não chama exclusão', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.remove('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(users.purgeAccountPermanently).not.toHaveBeenCalled();
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
    expect(users.purgeAccountPermanently).not.toHaveBeenCalled();
  });

  it('remove delega ao purge orquestrado do UsersService', async () => {
    const purge = jest.fn().mockResolvedValue({
      ok: true,
      outcome: 'hard_deleted',
    });
    const adminService = new AdminAccountsService(
      { user: { findUnique: jest.fn().mockResolvedValue({ id: 'u-user', role: Role.USER }) } } as never,
      { purgeAccountPermanently: purge } as never,
    );
    await expect(adminService.remove('u-user')).resolves.toEqual({
      success: true,
      outcome: 'hard_deleted',
    });
    expect(purge).toHaveBeenCalledWith('u-user', {
      strategy: 'hard',
      auditSource: 'admin',
    });
  });
});
