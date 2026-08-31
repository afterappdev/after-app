import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PasswordResetService } from './password-reset.service';
import { PasswordResetRequestDto } from './password-reset.dto';
import {
  PASSWORD_RESET_INVALID_LINK_MESSAGE,
  PASSWORD_RESET_REQUEST_MESSAGE,
  generatePasswordResetToken,
  hashPasswordResetToken,
} from './password-reset.crypto';

const GENERIC = PASSWORD_RESET_REQUEST_MESSAGE;

function createPrisma() {
  const prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    passwordResetRequest: {
      create: jest.Mock;
      updateMany: jest.Mock;
      findUnique: jest.Mock;
    };
    $transaction: jest.Mock;
  } = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    passwordResetRequest: {
      create: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: typeof prisma) => unknown)(prisma);
    }
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    return arg;
  });
  return prisma;
}

function tokenFromUrl(url: string): string {
  const match = /[?&]token=([A-Za-z0-9_-]+)/.exec(url);
  if (!match) throw new Error('token ausente na URL');
  return decodeURIComponent(match[1]);
}

describe('PasswordResetService', () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let prisma: ReturnType<typeof createPrisma>;
  let service: PasswordResetService;
  const logs: string[] = [];

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.PUBLIC_APP_URL = 'https://app-after.com.br';
    process.env.RESEND_API_KEY = 're_test_live_key';
    prisma = createPrisma();
    logs.length = 0;
    service = new PasswordResetService(prisma as never);
    jest.spyOn(service['logger'], 'log').mockImplementation((m) => {
      logs.push(String(m));
    });
    jest.spyOn(service['logger'], 'warn').mockImplementation((m) => {
      logs.push(String(m));
    });
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'email_1' }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
  });

  it('request com e-mail inválido é rejeitado', async () => {
    const dto = plainToInstance(PasswordResetRequestDto, { email: 'nao-e-email' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('e-mail inexistente retorna mensagem genérica', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const result = await service.requestReset('naoexiste@after.local');
    expect(result).toEqual({ message: GENERIC });
    expect(prisma.passwordResetRequest.create).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('e-mail existente retorna a mesma mensagem e chama o Resend', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prisma.passwordResetRequest.updateMany.mockResolvedValue({ count: 0 });
    prisma.passwordResetRequest.create.mockResolvedValue({ id: 'req-1' });

    const result = await service.requestReset('  User@After.LOCAL  ');
    expect(result).toEqual({ message: GENERIC });

    const [url, init] = (globalThis.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://api.resend.com/emails');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer re_test_live_key');
    const body = JSON.parse(String(init.body)) as {
      from: string;
      to: string[];
      subject: string;
      text: string;
    };
    expect(body.from).toBe('After <nao-responda@app-after.com.br>');
    expect(body.to).toEqual(['user@after.local']);
    expect(body.subject).toBe('Redefinição de senha — After');
    const token = tokenFromUrl(body.text);
    const created = prisma.passwordResetRequest.create.mock.calls[0][0];
    expect(created.data.tokenHash).toBe(hashPasswordResetToken(token));
    expect(created.data.tokenHash).not.toBe(token);
    expect(JSON.stringify(result)).not.toContain(token);
    expect(logs.join('\n')).not.toContain(token);
    expect(logs.join('\n')).not.toContain('re_test_live_key');
    expect(body.text).toContain(
      'https://app-after.com.br/#/redefinir-senha?token=',
    );
  });

  it('conta social retorna a mesma mensagem genérica', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'google-user' });
    prisma.passwordResetRequest.updateMany.mockResolvedValue({ count: 0 });
    prisma.passwordResetRequest.create.mockResolvedValue({ id: 'req-2' });
    const social = await service.requestReset('google.user@after.local');
    prisma.user.findUnique.mockResolvedValue(null);
    const missing = await service.requestReset('missing@after.local');
    expect(social).toEqual(missing);
    expect(JSON.stringify(social)).not.toMatch(/google|apple|social/i);
  });

  it('token válido altera o passwordHash e é de uso único', async () => {
    const token = generatePasswordResetToken();
    const tokenHash = hashPasswordResetToken(token);
    prisma.passwordResetRequest.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.passwordResetRequest.findUnique.mockResolvedValue({
      userId: 'user-1',
    });
    prisma.user.update.mockResolvedValue({ id: 'user-1' });

    const result = await service.confirmReset({
      token,
      password: 'novaSenha',
      passwordConfirmation: 'novaSenha',
    });
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain(token);
    expect(JSON.stringify(result)).not.toContain('user-1');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { passwordHash: expect.any(String) },
    });
    const storedHash = prisma.user.update.mock.calls[0][0].data.passwordHash;
    expect(storedHash).not.toBe('novaSenha');
    expect(await bcrypt.compare('novaSenha', storedHash)).toBe(true);

    prisma.passwordResetRequest.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      service.confirmReset({
        token,
        password: 'outraSenha',
        passwordConfirmation: 'outraSenha',
      }),
    ).rejects.toThrow(PASSWORD_RESET_INVALID_LINK_MESSAGE);
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
  });

  it('token expirado, usado ou inválido é rejeitado', async () => {
    prisma.passwordResetRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.confirmReset({
        token: generatePasswordResetToken(),
        password: 'novaSenha',
        passwordConfirmation: 'novaSenha',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.confirmReset({
        token: 'token-invalido-sem-pedido',
        password: 'novaSenha',
        passwordConfirmation: 'novaSenha',
      }),
    ).rejects.toThrow(PASSWORD_RESET_INVALID_LINK_MESSAGE);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('senhas diferentes são rejeitadas', async () => {
    await expect(
      service.confirmReset({
        token: generatePasswordResetToken(),
        password: 'novaSenha',
        passwordConfirmation: 'outraSenha',
      }),
    ).rejects.toThrow('As senhas não coincidem.');
    expect(prisma.passwordResetRequest.updateMany).not.toHaveBeenCalled();
  });

  it('em production sem Resend não cria falsa expectativa', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.RESEND_API_KEY;
    await expect(service.requestReset('user@after.local')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
