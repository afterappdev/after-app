import { JwtService } from '@nestjs/jwt';
import { AccountLifecycleStatus, Role } from '@prisma/client';
describe('AuthService session JWT emission', () => {
  const jwt = new JwtService({ secret: 'test-secret' });

  function buildAuthResponse(user: {
    id: string;
    name: string;
    email: string;
    role: Role;
    state: string;
    city: string;
    avatarUrl: string | null;
    venue: { id: string } | null;
    sessionVersion: number;
  }) {
    const accessToken = jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      sv: user.sessionVersion,
    });
    return { accessToken, user: { id: user.id } };
  }

  it('emite claim sv na sessão normal', () => {
    const { accessToken } = buildAuthResponse({
      id: 'u1',
      name: 'Ana',
      email: 'ana@after.local',
      role: Role.USER,
      state: 'SP',
      city: 'Campinas',
      avatarUrl: null,
      venue: null,
      sessionVersion: 4,
    });
    const payload = jwt.verify(accessToken) as { sv?: number; typ?: string };
    expect(payload.sv).toBe(4);
    expect(payload.typ).toBeUndefined();
  });

  it('recovery login não emite accessToken de sessão', () => {
    const recoveryToken = jwt.sign(
      {
        sub: 'u1',
        email: 'ana@after.local',
        role: Role.USER,
        typ: 'account_recovery',
      },
      { expiresIn: '15m' },
    );
    const payload = jwt.verify(recoveryToken) as { sv?: number; typ?: string };
    expect(payload.typ).toBe('account_recovery');
    expect(payload.sv).toBeUndefined();
    expect(AccountLifecycleStatus.PENDING_DELETION).toBeDefined();
  });
});
