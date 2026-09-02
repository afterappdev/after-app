import {
  attachOAuthOnboarding,
  attachOAuthToken,
  isAllowedOAuthRedirect,
  parseAllowedRedirectOrigins,
} from './oauth.util';

const APP = 'https://app-after.com.br';
const ALLOWED = [APP];

describe('isAllowedOAuthRedirect', () => {
  const prod = { production: true };
  const dev = { production: false };

  it('permite o origin oficial e rotas/hash do mesmo origin', () => {
    expect(isAllowedOAuthRedirect(`${APP}/`, ALLOWED, prod)).toBe(true);
    expect(isAllowedOAuthRedirect(APP, ALLOWED, prod)).toBe(true);
    expect(isAllowedOAuthRedirect(`${APP}/#/`, ALLOWED, prod)).toBe(true);
    expect(isAllowedOAuthRedirect(`${APP}/#/login`, ALLOWED, prod)).toBe(true);
    expect(
      isAllowedOAuthRedirect(`${APP}/#/oauth?token=abc`, ALLOWED, prod),
    ).toBe(true);
  });

  it('bloqueia domínio arbitrário e lookalike', () => {
    expect(isAllowedOAuthRedirect('https://evil.example/', ALLOWED, prod)).toBe(
      false,
    );
    expect(
      isAllowedOAuthRedirect('https://app-after.com.br.evil.com/', ALLOWED, prod),
    ).toBe(false);
    expect(
      isAllowedOAuthRedirect('https://evil.com/?next=https://app-after.com.br', ALLOWED, prod),
    ).toBe(false);
    expect(isAllowedOAuthRedirect('javascript:alert(1)', ALLOWED, prod)).toBe(
      false,
    );
    expect(isAllowedOAuthRedirect('data:text/html,hi', ALLOWED, prod)).toBe(
      false,
    );
    expect(isAllowedOAuthRedirect('//evil.com', ALLOWED, prod)).toBe(false);
    expect(
      isAllowedOAuthRedirect('https://user:pass@app-after.com.br/', ALLOWED, prod),
    ).toBe(false);
  });

  it('bloqueia http em produção', () => {
    expect(isAllowedOAuthRedirect('http://app-after.com.br/', ALLOWED, prod)).toBe(
      false,
    );
    expect(
      isAllowedOAuthRedirect('http://localhost:8080/', ['http://localhost:8080'], prod),
    ).toBe(false);
  });

  it('bloqueia workers.dev em produção mesmo se listado', () => {
    expect(
      isAllowedOAuthRedirect(
        'https://after.workers.dev/',
        ['https://after.workers.dev'],
        prod,
      ),
    ).toBe(false);
  });

  it('localhost só entra quando está na allowlist e não é produção', () => {
    expect(
      isAllowedOAuthRedirect(
        'http://localhost:8080/',
        ['http://localhost:8080'],
        dev,
      ),
    ).toBe(true);
    expect(isAllowedOAuthRedirect('http://localhost:8080/', [], dev)).toBe(
      false,
    );
    expect(
      isAllowedOAuthRedirect(
        'http://127.0.0.1:8080/',
        ['http://127.0.0.1:8080'],
        dev,
      ),
    ).toBe(true);
  });

  it('permite after:// no app nativo', () => {
    expect(isAllowedOAuthRedirect('after://auth/callback', [], prod)).toBe(true);
  });

  it('parseAllowedRedirectOrigins normaliza PUBLIC_APP_URL e a allowlist', () => {
    expect(
      parseAllowedRedirectOrigins(
        'http://localhost:8080, https://app-after.com.br/',
        'https://app-after.com.br',
      ),
    ).toEqual(
      expect.arrayContaining(['http://localhost:8080', 'https://app-after.com.br']),
    );
  });

  it('attachOAuthToken no web usa hash routing', () => {
    expect(attachOAuthToken(`${APP}/`, 'jwt-token')).toBe(
      `${APP}/#/oauth?token=jwt-token`,
    );
  });

  it('attachOAuthOnboarding não usa o param de sessão', () => {
    expect(attachOAuthOnboarding(`${APP}/`, 'onb-token')).toBe(
      `${APP}/#/register?onboarding=onb-token`,
    );
    expect(attachOAuthOnboarding('after://auth/callback', 'onb-token')).toBe(
      'after://auth/callback?onboarding=onb-token',
    );
    expect(attachOAuthOnboarding(`${APP}/`, 'onb-token')).not.toContain(
      'token=',
    );
  });
});
