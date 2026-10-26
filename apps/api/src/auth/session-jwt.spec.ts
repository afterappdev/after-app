import { UnauthorizedException } from '@nestjs/common';
import {
  assertNormalSessionJwt,
  assertSessionNotInvalidated,
} from './session-jwt';

describe('session-jwt', () => {
  describe('assertNormalSessionJwt', () => {
    it('aceita sv igual à sessionVersion', () => {
      expect(() =>
        assertNormalSessionJwt(
          { sub: 'u1', sv: 3, iat: 1 },
          { sessionVersion: 3, sessionInvalidatedAt: new Date() },
        ),
      ).not.toThrow();
    });

    it('rejeita sv desatualizado', () => {
      expect(() =>
        assertNormalSessionJwt(
          { sv: 1, iat: Math.floor(Date.now() / 1000) },
          { sessionVersion: 2, sessionInvalidatedAt: null },
        ),
      ).toThrow(UnauthorizedException);
    });

    it('legacy sem sv exige sessionVersion 0 e respeita sessionInvalidatedAt', () => {
      const invalidated = new Date('2026-10-26T15:00:00.000Z');
      expect(() =>
        assertNormalSessionJwt(
          {
            iat: Math.floor(new Date('2026-10-26T14:00:00.000Z').getTime() / 1000),
          },
          { sessionVersion: 0, sessionInvalidatedAt: invalidated },
        ),
      ).toThrow(UnauthorizedException);

      expect(() =>
        assertNormalSessionJwt(
          {
            iat: Math.floor(new Date('2026-10-26T16:00:00.000Z').getTime() / 1000),
          },
          { sessionVersion: 0, sessionInvalidatedAt: invalidated },
        ),
      ).not.toThrow();
    });

    it('rejeita legacy sem sv quando sessionVersion > 0', () => {
      expect(() =>
        assertNormalSessionJwt(
          { iat: Math.floor(Date.now() / 1000) },
          { sessionVersion: 1, sessionInvalidatedAt: null },
        ),
      ).toThrow(UnauthorizedException);
    });

    it('sv correto ignora iat no mesmo segundo da invalidação', () => {
      const invalidated = new Date('2026-10-26T15:00:00.900Z');
      expect(() =>
        assertNormalSessionJwt(
          {
            sv: 2,
            iat: Math.floor(invalidated.getTime() / 1000),
          },
          { sessionVersion: 2, sessionInvalidatedAt: invalidated },
        ),
      ).not.toThrow();
    });
  });

  describe('assertSessionNotInvalidated (recovery)', () => {
    it('rejeita recovery emitido no mesmo segundo da invalidação', () => {
      const invalidated = new Date('2026-10-26T15:00:00.900Z');
      expect(() =>
        assertSessionNotInvalidated(
          { iat: Math.floor(invalidated.getTime() / 1000) },
          invalidated,
        ),
      ).toThrow(UnauthorizedException);
    });
  });
});
