import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RegisterDto } from './register.dto';

function dto(overrides: Record<string, unknown> = {}) {
  return plainToInstance(RegisterDto, {
    name: 'Ana',
    email: 'ana@after.local',
    password: 'senha123',
    state: 'SP',
    city: 'São Paulo',
    role: 'USER',
    ...overrides,
  });
}

describe('RegisterDto public roles', () => {
  it('aceita USER', async () => {
    const errors = await validate(dto({ role: 'USER' }));
    expect(errors).toHaveLength(0);
  });

  it('aceita VENUE', async () => {
    const errors = await validate(dto({ role: 'VENUE' }));
    expect(errors).toHaveLength(0);
  });

  it('rejeita ADMIN no cadastro público', async () => {
    const errors = await validate(dto({ role: 'ADMIN' }));
    expect(errors.some((error) => error.property === 'role')).toBe(true);
  });
});
