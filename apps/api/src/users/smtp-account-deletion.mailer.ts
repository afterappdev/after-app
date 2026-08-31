import { Injectable, Logger } from '@nestjs/common';
import { connect as tlsConnect } from 'node:tls';
import { Socket, createConnection } from 'node:net';
import { AccountDeletionMail, AccountDeletionMailer } from './account-deletion.mailer';
import { isProduction } from '../common/env';
import { maskEmailForLog, sanitizeConfirmUrlForLog } from './account-deletion.crypto';

function env(name: string): string {
  return process.env[name]?.trim() ?? '';
}

function smtpPort(): number {
  const raw = Number(env('SMTP_PORT'));
  return Number.isFinite(raw) && raw > 0 ? raw : 587;
}

@Injectable()
export class SmtpAccountDeletionMailer extends AccountDeletionMailer {
  private readonly logger = new Logger(SmtpAccountDeletionMailer.name);

  isConfigured(): boolean {
    return Boolean(env('SMTP_HOST') && env('SMTP_FROM'));
  }

  async sendDeletionLink(mail: AccountDeletionMail): Promise<void> {
    if (!this.isConfigured()) {
      if (!isProduction()) {
        this.logger.log(
          `SMTP ausente; link de exclusão não enviado (${sanitizeConfirmUrlForLog(mail.confirmUrl)})`,
        );
      }
      return;
    }

    const host = env('SMTP_HOST');
    const port = smtpPort();
    const user = env('SMTP_USER');
    const password = env('SMTP_PASSWORD');
    const from = env('SMTP_FROM');
    const subject = 'Exclusão da sua conta After';
    const text = [
      'Recebemos um pedido para excluir a conta After deste e-mail.',
      '',
      'Se foi você, abra o link abaixo e confirme a exclusão. O link expira em 60 minutos e só pode ser usado uma vez.',
      '',
      mail.confirmUrl,
      '',
      'Se você não pediu isso, ignore este e-mail. Nenhuma conta será excluída sem essa confirmação.',
    ].join('\n');

    await sendSmtp({
      host,
      port,
      user,
      password,
      from,
      to: mail.to,
      subject,
      text,
    });

    if (!isProduction()) {
      this.logger.log(`Instruções de exclusão enviadas para ${maskEmailForLog(mail.to)}`);
    }
  }
}

type SmtpSendInput = {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  to: string;
  subject: string;
  text: string;
};

async function sendSmtp(input: SmtpSendInput): Promise<void> {
  const implicitTls = input.port === 465;
  const socket = implicitTls
    ? tlsConnect({ host: input.host, port: input.port, servername: input.host })
    : createConnection({ host: input.host, port: input.port });

  const timeout = setTimeout(() => socket.destroy(new Error('SMTP timeout')), 15_000);

  try {
    const session = new SmtpSession(socket);
    await session.greeting();
    await session.ehlo(input.host);
    if (!implicitTls) {
      const started = await session.startTls(input.host, input.port);
      if (started) {
        await session.ehlo(input.host);
      }
    }
    if (input.user) {
      await session.authLogin(input.user, input.password);
    }
    await session.mailFrom(input.from);
    await session.rcptTo(input.to);
    await session.data(buildMime(input));
    await session.quit();
  } finally {
    clearTimeout(timeout);
    socket.destroy();
  }
}

function buildMime(input: SmtpSendInput): string {
  const encodedSubject = `=?UTF-8?B?${Buffer.from(input.subject, 'utf8').toString('base64')}?=`;
  return [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    input.text,
    '',
  ].join('\r\n');
}

class SmtpSession {
  private buffer = '';
  private socket: Socket;

  constructor(socket: Socket) {
    this.socket = socket;
    this.socket.on('data', (chunk: Buffer | string) => {
      this.buffer += chunk.toString('utf8');
    });
  }

  async greeting(): Promise<void> {
    await this.readCode(220);
  }

  async ehlo(host: string): Promise<string> {
    return this.command(`EHLO ${host}`, 250);
  }

  async startTls(host: string, port: number): Promise<boolean> {
    try {
      await this.command('STARTTLS', 220);
    } catch {
      return false;
    }
    const upgraded = tlsConnect({
      socket: this.socket,
      host,
      port,
      servername: host,
    });
    this.buffer = '';
    this.socket = upgraded;
    upgraded.on('data', (chunk: Buffer | string) => {
      this.buffer += chunk.toString('utf8');
    });
    await new Promise<void>((resolve, reject) => {
      upgraded.once('secureConnect', () => resolve());
      upgraded.once('error', reject);
    });
    return true;
  }

  async authLogin(user: string, password: string): Promise<void> {
    await this.command('AUTH LOGIN', 334);
    await this.command(Buffer.from(user, 'utf8').toString('base64'), 334);
    await this.command(Buffer.from(password, 'utf8').toString('base64'), 235);
  }

  async mailFrom(from: string): Promise<void> {
    const addr = extractAddress(from);
    await this.command(`MAIL FROM:<${addr}>`, 250);
  }

  async rcptTo(to: string): Promise<void> {
    const addr = extractAddress(to);
    await this.command(`RCPT TO:<${addr}>`, 250);
  }

  async data(mime: string): Promise<void> {
    await this.command('DATA', 354);
    await this.command(`${mime.replace(/\n\./g, '\n..')}\r\n.`, 250);
  }

  async quit(): Promise<void> {
    try {
      await this.command('QUIT', 221);
    } catch {
      // conexão pode fechar após QUIT
    }
  }

  private async command(line: string, expected: number): Promise<string> {
    this.socket.write(`${line}\r\n`, 'utf8');
    return this.readCode(expected);
  }

  private async readCode(expected: number): Promise<string> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const lines = this.buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1];
      const code = last ? Number(last.slice(0, 3)) : 0;
      if (code && !last.startsWith(`${code}-`)) {
        const text = this.buffer;
        this.buffer = '';
        if (code !== expected) {
          throw new Error(`SMTP ${code || 'erro'}`);
        }
        return text;
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('SMTP sem resposta');
  }
}

function extractAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim();
}
