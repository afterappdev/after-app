import {
  ACCOUNT_DELETION_FROM,
  RESEND_EMAILS_URL,
  ResendAccountDeletionMailer,
  ResendHttpError,
  sanitizeMailerError,
  sanitizeMailerLogText,
} from './resend-account-deletion.mailer';

describe('Resend account deletion mailer', () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  const logs: string[] = [];

  beforeEach(() => {
    logs.length = 0;
    process.env.RESEND_API_KEY = 're_test_live_key';
    delete process.env.RESEND_FROM;
    delete process.env.SMTP_PASSWORD;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
  });

  function spyLogger(mailer: ResendAccountDeletionMailer) {
    jest.spyOn(mailer['logger'], 'log').mockImplementation((m) => {
      logs.push(String(m));
    });
    jest.spyOn(mailer['logger'], 'warn').mockImplementation((m) => {
      logs.push(String(m));
    });
  }

  it('envia POST para a API HTTPS do Resend com remetente, destinatário, link e Bearer', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'email_1' }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const mailer = new ResendAccountDeletionMailer();
    spyLogger(mailer);
    const confirmUrl =
      'https://app-after.com.br/#/confirmar-exclusao?token=abc_token';
    await mailer.sendDeletionLink({
      to: 'user@after.local',
      confirmUrl,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(RESEND_EMAILS_URL);
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer re_test_live_key');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['User-Agent']).toBe('after-api/account-deletion');

    const body = JSON.parse(String(init.body)) as {
      from: string;
      to: string[];
      subject: string;
      text: string;
    };
    expect(body.from).toBe(ACCOUNT_DELETION_FROM);
    expect(body.from).toBe('After <nao-responda@app-after.com.br>');
    expect(body.to).toEqual(['user@after.local']);
    expect(body.subject).toBe('Exclusão da sua conta After');
    expect(body.text).toContain(confirmUrl);
    expect(logs.join('\n')).not.toContain('re_test_live_key');
    expect(logs.join('\n')).not.toContain('abc_token');
  });

  it('propaga erro da API do Resend e loga só dados sanitizados', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        name: 'restricted_api_key',
        message:
          'Invalid API key re_test_live_key for user@after.local token=abc_token',
      }),
    }) as unknown as typeof fetch;

    const mailer = new ResendAccountDeletionMailer();
    spyLogger(mailer);
    await expect(
      mailer.sendDeletionLink({
        to: 'user@after.local',
        confirmUrl:
          'https://app-after.com.br/#/confirmar-exclusao?token=abc_token',
      }),
    ).rejects.toBeInstanceOf(ResendHttpError);

    const dumped = logs.join('\n');
    expect(dumped).toContain('"status":403');
    expect(dumped).toContain('restricted_api_key');
    expect(dumped).not.toContain('re_test_live_key');
    expect(dumped).not.toContain('user@after.local');
    expect(dumped).not.toContain('abc_token');
    expect(dumped).toContain('[redacted]');
    expect(dumped).toContain('u***@after.local');
    expect(dumped).toContain('token=***');
  });

  it('sanitiza senha, API key, e-mail e token', () => {
    process.env.RESEND_API_KEY = 'super-secret-pass';
    const raw =
      'failed super-secret-pass re_abc123XYZ to user@after.local token=abc_token https://app-after.com.br/#/confirmar-exclusao?token=abc_token';
    const sanitized = sanitizeMailerLogText(raw);
    expect(sanitized).not.toContain('super-secret-pass');
    expect(sanitized).not.toContain('re_abc123XYZ');
    expect(sanitized).not.toContain('user@after.local');
    expect(sanitized).not.toContain('abc_token');
    expect(sanitized).toContain('[redacted]');
    expect(sanitized).toContain('u***@after.local');
    expect(sanitized).toContain('token=***');
  });

  it('sanitiza erro HTTP do Resend sem vazar segredos', () => {
    process.env.RESEND_API_KEY = 're_livekey';
    const err = new ResendHttpError(422, {
      name: 'validation_error',
      message: 'Invalid `from` re_livekey user@after.local',
    });
    const sanitized = sanitizeMailerError(err);
    expect(sanitized.status).toBe(422);
    expect(sanitized.name).toBe('validation_error');
    expect(sanitized.code).toBe('validation_error');
    expect(JSON.stringify(sanitized)).not.toContain('re_livekey');
    expect(JSON.stringify(sanitized)).not.toContain('user@after.local');
    expect(sanitized.message).toContain('[redacted]');
  });
});
