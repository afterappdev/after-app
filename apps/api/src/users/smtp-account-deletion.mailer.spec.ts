import * as nodemailer from 'nodemailer';
import {
  buildSmtpTransportOptions,
  sanitizeSmtpError,
  sanitizeSmtpLogText,
  smtpUsesImplicitTls,
  SmtpAccountDeletionMailer,
} from './smtp-account-deletion.mailer';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

describe('SMTP account deletion mailer', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  it('porta 465 usa SMTPS (secure: true), 587 usa STARTTLS (secure: false)', () => {
    expect(smtpUsesImplicitTls(465)).toBe(true);
    expect(smtpUsesImplicitTls(2465)).toBe(true);
    expect(smtpUsesImplicitTls(587)).toBe(false);
    expect(smtpUsesImplicitTls(2587)).toBe(false);
  });

  it('transporter da porta 465 nasce com secure: true', () => {
    process.env.SMTP_HOST = 'smtp.resend.com';
    process.env.SMTP_PORT = '465';
    process.env.SMTP_USER = 'resend';
    process.env.SMTP_PASSWORD = 're_testkey';
    const options = buildSmtpTransportOptions();
    expect(options.host).toBe('smtp.resend.com');
    expect(options.port).toBe(465);
    expect(options.secure).toBe(true);
    expect(options.requireTLS).toBe(false);
    expect(options.auth).toEqual({ user: 'resend', pass: 're_testkey' });
  });

  it('transporter da porta 587 nasce com secure: false e requireTLS', () => {
    process.env.SMTP_HOST = 'smtp.resend.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'resend';
    process.env.SMTP_PASSWORD = 're_testkey';
    const options = buildSmtpTransportOptions();
    expect(options.port).toBe(587);
    expect(options.secure).toBe(false);
    expect(options.requireTLS).toBe(true);
  });

  it('sanitiza senha, API key, e-mail e token', () => {
    process.env.SMTP_PASSWORD = 'super-secret-pass';
    const raw =
      'AUTH failed super-secret-pass re_abc123XYZ to user@after.local token=abc_token https://app-after.com.br/#/confirmar-exclusao?token=abc_token';
    const sanitized = sanitizeSmtpLogText(raw);
    expect(sanitized).not.toContain('super-secret-pass');
    expect(sanitized).not.toContain('re_abc123XYZ');
    expect(sanitized).not.toContain('user@after.local');
    expect(sanitized).not.toContain('abc_token');
    expect(sanitized).toContain('[redacted]');
    expect(sanitized).toContain('u***@after.local');
    expect(sanitized).toContain('token=***');
  });

  it('sanitiza erro SMTP no formato Nodemailer sem vazar segredos', () => {
    process.env.SMTP_PASSWORD = 're_livekey';
    const err = {
      code: 'EAUTH',
      command: 'AUTH PLAIN',
      responseCode: 535,
      response: '535 Invalid user re_livekey user@after.local',
      message: 'Invalid login: 535 Invalid user re_livekey',
    };
    const sanitized = sanitizeSmtpError(err);
    expect(sanitized).toEqual({
      code: 'EAUTH',
      command: 'AUTH PLAIN',
      responseCode: 535,
      response: expect.stringContaining('535 Invalid user [redacted]'),
      message: expect.stringContaining('[redacted]'),
    });
    expect(JSON.stringify(sanitized)).not.toContain('re_livekey');
    expect(JSON.stringify(sanitized)).not.toContain('user@after.local');
  });

  it('envia From no formato display-name <email> sem alterar o fluxo', async () => {
    process.env.SMTP_HOST = 'smtp.resend.com';
    process.env.SMTP_PORT = '465';
    process.env.SMTP_USER = 'resend';
    process.env.SMTP_PASSWORD = 're_testkey';
    process.env.SMTP_FROM = 'After <nao-responda@app-after.com.br>';
    const sendMail = jest.fn().mockResolvedValue({ messageId: '1' });
    const close = jest.fn();
    (nodemailer.createTransport as jest.Mock).mockReturnValue({
      sendMail,
      close,
    });

    const mailer = new SmtpAccountDeletionMailer();
    await mailer.sendDeletionLink({
      to: 'user@after.local',
      confirmUrl: 'https://app-after.com.br/#/confirmar-exclusao?token=secret',
    });

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.resend.com', port: 465, secure: true }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'After <nao-responda@app-after.com.br>',
        to: 'user@after.local',
      }),
    );
    const sent = sendMail.mock.calls[0][0];
    expect(JSON.stringify(sent)).not.toContain('re_testkey');
    expect(close).toHaveBeenCalled();
  });
});
