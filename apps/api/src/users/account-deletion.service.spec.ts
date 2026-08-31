import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AccountDeletionService } from './account-deletion.service';
import { AccountDeletionMailer } from './account-deletion.mailer';
import { UsersService } from './users.service';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { DeleteRequestDto } from './account-deletion.dto';
import {
  ACCOUNT_DELETION_INVALID_LINK_MESSAGE,
  ACCOUNT_DELETION_REQUEST_MESSAGE,
  generateDeletionToken,
  hashDeletionToken,
} from './account-deletion.crypto';

const GENERIC = ACCOUNT_DELETION_REQUEST_MESSAGE;

function createPrisma() {
  const prisma: {
    user: { findUnique: jest.Mock; delete: jest.Mock };
    accountDeletionRequest: {
      create: jest.Mock;
      updateMany: jest.Mock;
      findUnique: jest.Mock;
    };
    $transaction: jest.Mock;
  } = {
    user: { findUnique: jest.fn(), delete: jest.fn() },
    accountDeletionRequest: {
      create: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    async (arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: typeof prisma) => unknown)(prisma);
      }
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      return arg;
    },
  );
  return prisma;
}

class CapturingMailer extends AccountDeletionMailer {
  last: { to: string; confirmUrl: string } | null = null;
  configured = true;
  fail = false;

  isConfigured(): boolean {
    return this.configured;
  }

  async sendDeletionLink(mail: { to: string; confirmUrl: string }): Promise<void> {
    if (this.fail) throw new Error('smtp down');
    this.last = mail;
  }
}

function tokenFromUrl(url: string): string {
  const match = /[?&]token=([^&]+)/.exec(url);
  if (!match) throw new Error('token ausente na URL');
  return decodeURIComponent(match[1]);
}

describe('AccountDeletionService', () => {
  const originalEnv = { ...process.env };
  let prisma: ReturnType<typeof createPrisma>;
  let mailer: CapturingMailer;
  let users: { deleteUserRecord: jest.Mock };
  let service: AccountDeletionService;
  const logs: string[] = [];

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.PUBLIC_APP_URL = 'https://app-after.com.br';
    delete process.env.RESEND_API_KEY;
    prisma = createPrisma();
    mailer = new CapturingMailer();
    users = {
      deleteUserRecord: jest.fn().mockResolvedValue(['/uploads/a.jpg']),
    };
    logs.length = 0;
    service = new AccountDeletionService(
      prisma as never,
      users as unknown as UsersService,
      mailer,
    );
    jest.spyOn(service['logger'], 'log').mockImplementation((m) => {
      logs.push(String(m));
    });
    jest.spyOn(service['logger'], 'warn').mockImplementation((m) => {
      logs.push(String(m));
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('request com e-mail inválido é rejeitado', async () => {
    const dto = plainToInstance(DeleteRequestDto, { email: 'nao-e-email' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(errors)).not.toMatch(/user-|existe/i);
  });

  it('e-mail inexistente retorna mensagem genérica', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const result = await service.requestDeletion('naoexiste@after.local');
    expect(result).toEqual({ message: GENERIC });
    expect(prisma.accountDeletionRequest.create).not.toHaveBeenCalled();
    expect(mailer.last).toBeNull();
  });

  it('e-mail existente retorna a mesma mensagem genérica', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prisma.accountDeletionRequest.updateMany.mockResolvedValue({ count: 0 });
    prisma.accountDeletionRequest.create.mockResolvedValue({ id: 'req-1' });

    const result = await service.requestDeletion('  User@After.LOCAL  ');
    expect(result).toEqual({ message: GENERIC });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'user@after.local' },
      select: { id: true },
    });
  });

  it('token é armazenado somente como hash', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prisma.accountDeletionRequest.updateMany.mockResolvedValue({ count: 0 });
    prisma.accountDeletionRequest.create.mockResolvedValue({ id: 'req-1' });

    await service.requestDeletion('user@after.local');
    const created = prisma.accountDeletionRequest.create.mock.calls[0][0];
    const token = tokenFromUrl(mailer.last!.confirmUrl);
    expect(created.data.tokenHash).toBe(hashDeletionToken(token));
    expect(created.data.tokenHash).not.toBe(token);
    expect(JSON.stringify(created)).not.toContain(token);
  });

  it('token válido permite confirmação e exclui a conta', async () => {
    const token = generateDeletionToken();
    const tokenHash = hashDeletionToken(token);
    prisma.accountDeletionRequest.updateMany.mockResolvedValue({ count: 1 });
    prisma.accountDeletionRequest.findUnique.mockResolvedValue({
      userId: 'user-1',
    });

    const result = await service.confirmDeletion(token);
    expect(result.ok).toBe(true);
    expect(result.message).toBe('Sua conta foi excluída.');
    expect(JSON.stringify(result)).not.toContain(token);
    expect(prisma.accountDeletionRequest.updateMany).toHaveBeenCalledWith({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      data: { usedAt: expect.any(Date) },
    });
    expect(users.deleteUserRecord).toHaveBeenCalledWith(prisma, 'user-1');
  });

  it('token expirado ou inexistente é rejeitado', async () => {
    prisma.accountDeletionRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.confirmDeletion(generateDeletionToken())).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(users.deleteUserRecord).not.toHaveBeenCalled();
  });

  it('token usado é rejeitado e não exclui de novo', async () => {
    prisma.accountDeletionRequest.updateMany.mockResolvedValue({ count: 0 });
    const token = generateDeletionToken();
    await expect(service.confirmDeletion(token)).rejects.toThrow(
      ACCOUNT_DELETION_INVALID_LINK_MESSAGE,
    );
    expect(users.deleteUserRecord).not.toHaveBeenCalled();
  });

  it('token inválido é rejeitado', async () => {
    prisma.accountDeletionRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.confirmDeletion('token-invalido-sem-pedido')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('conta só é excluída após confirmação', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prisma.accountDeletionRequest.updateMany.mockResolvedValue({ count: 0 });
    prisma.accountDeletionRequest.create.mockResolvedValue({ id: 'req-1' });
    await service.requestDeletion('user@after.local');
    expect(users.deleteUserRecord).not.toHaveBeenCalled();
  });

  it('segunda confirmação não executa exclusão novamente', async () => {
    const token = generateDeletionToken();
    prisma.accountDeletionRequest.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    prisma.accountDeletionRequest.findUnique.mockResolvedValue({
      userId: 'user-1',
    });

    await service.confirmDeletion(token);
    await expect(service.confirmDeletion(token)).rejects.toThrow(
      ACCOUNT_DELETION_INVALID_LINK_MESSAGE,
    );
    expect(users.deleteUserRecord).toHaveBeenCalledTimes(1);
  });

  it('response não permite inferir se o e-mail existe', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);
    const missing = await service.requestDeletion('a@after.local');
    prisma.user.findUnique.mockResolvedValueOnce({ id: 'user-1' });
    prisma.accountDeletionRequest.updateMany.mockResolvedValue({ count: 0 });
    prisma.accountDeletionRequest.create.mockResolvedValue({ id: 'req-1' });
    const existing = await service.requestDeletion('b@after.local');
    expect(missing).toEqual(existing);
    expect(JSON.stringify(missing)).not.toMatch(/user-1|existe|não encontrado/i);
  });

  it('nenhum token aparece nos logs ou na response do request', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prisma.accountDeletionRequest.updateMany.mockResolvedValue({ count: 0 });
    prisma.accountDeletionRequest.create.mockResolvedValue({ id: 'req-1' });
    const result = await service.requestDeletion('user@after.local');
    const token = tokenFromUrl(mailer.last!.confirmUrl);
    expect(JSON.stringify(result)).not.toContain(token);
    expect(logs.join('\n')).not.toContain(token);
  });

  it('em production sem Resend configurado não cria falsa expectativa', async () => {
    process.env.NODE_ENV = 'production';
    mailer.configured = false;
    await expect(service.requestDeletion('user@after.local')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.accountDeletionRequest.create).not.toHaveBeenCalled();
  });

  it('falha de e-mail após criar pedido não revela se a conta existe', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prisma.accountDeletionRequest.updateMany.mockResolvedValue({ count: 0 });
    prisma.accountDeletionRequest.create.mockResolvedValue({ id: 'req-1' });
    mailer.fail = true;
    const result = await service.requestDeletion('user@after.local');
    expect(result).toEqual({ message: GENERIC });
    expect(users.deleteUserRecord).not.toHaveBeenCalled();
  });
});
