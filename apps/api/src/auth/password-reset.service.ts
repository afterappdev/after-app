import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { isProduction } from '../common/env';
import {
  isResendConfigured,
  sanitizeMailerError,
  sendResendEmail,
} from '../common/resend/resend-email';
import { maskEmailForLog, sanitizeConfirmUrlForLog } from '../users/account-deletion.crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  PASSWORD_RESET_INVALID_LINK_MESSAGE,
  PASSWORD_RESET_MAIL_UNAVAILABLE_MESSAGE,
  PASSWORD_RESET_REQUEST_MESSAGE,
  PASSWORD_RESET_TOKEN_TTL_MS,
  buildPasswordResetUrl,
  generatePasswordResetToken,
  hashPasswordResetToken,
} from './password-reset.crypto';
import { PasswordResetConfirmDto } from './password-reset.dto';

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(private readonly prisma: PrismaService) {}

  async requestReset(email: string) {
    if (isProduction() && !isResendConfigured()) {
      throw new ServiceUnavailableException(
        PASSWORD_RESET_MAIL_UNAVAILABLE_MESSAGE,
      );
    }

    const normalized = email.trim().toLowerCase();
    const generic = { message: PASSWORD_RESET_REQUEST_MESSAGE };

    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
      select: { id: true },
    });
    if (!user) {
      hashPasswordResetToken(generatePasswordResetToken());
      return generic;
    }

    const token = generatePasswordResetToken();
    const tokenHash = hashPasswordResetToken(token);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);

    await this.prisma.$transaction([
      this.prisma.passwordResetRequest.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetRequest.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      }),
    ]);

    const resetUrl = buildPasswordResetUrl(
      process.env.PUBLIC_APP_URL || 'http://localhost:8080',
      token,
    );

    if (!isResendConfigured()) {
      this.logger.log(
        `Resend ausente; link de redefinição não enviado (${sanitizeConfirmUrlForLog(resetUrl)})`,
      );
      return generic;
    }

    try {
      await sendResendEmail({
        to: normalized,
        subject: 'Redefinição de senha — After',
        text: [
          'Recebemos um pedido para redefinir a senha da sua conta After.',
          '',
          'Se foi você, abra o link abaixo e escolha uma nova senha. O link expira em 60 minutos e só pode ser usado uma vez.',
          '',
          resetUrl,
          '',
          'Se você não pediu isso, ignore este e-mail. Nenhuma senha será alterada sem essa confirmação.',
        ].join('\n'),
        userAgent: 'after-api/password-reset',
      });
    } catch (err) {
      await this.prisma.passwordResetRequest.updateMany({
        where: { tokenHash, usedAt: null },
        data: { usedAt: new Date() },
      });
      this.logger.warn(
        `Falha ao enviar redefinição de senha ${JSON.stringify(sanitizeMailerError(err))}`,
      );
      return generic;
    }

    if (!isProduction()) {
      this.logger.log(
        `Instruções de redefinição enviadas para ${maskEmailForLog(normalized)}`,
      );
    }

    return generic;
  }

  async confirmReset(dto: PasswordResetConfirmDto) {
    const password = dto.password ?? '';
    const confirmation = dto.passwordConfirmation ?? '';
    if (password !== confirmation) {
      throw new BadRequestException('As senhas não coincidem.');
    }
    if (password.length < 6) {
      throw new BadRequestException(
        'A senha deverá conter no mínimo 6 caracteres.',
      );
    }

    const raw = dto.token?.trim() ?? '';
    if (!raw) {
      throw new BadRequestException(PASSWORD_RESET_INVALID_LINK_MESSAGE);
    }

    const tokenHash = hashPasswordResetToken(raw);

    await this.prisma.$transaction(async (tx) => {
      const used = await tx.passwordResetRequest.updateMany({
        where: {
          tokenHash,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
      });
      if (used.count !== 1) {
        throw new BadRequestException(PASSWORD_RESET_INVALID_LINK_MESSAGE);
      }
      const row = await tx.passwordResetRequest.findUnique({
        where: { tokenHash },
        select: { userId: true },
      });
      if (!row) {
        throw new BadRequestException(PASSWORD_RESET_INVALID_LINK_MESSAGE);
      }
      const passwordHash = await bcrypt.hash(password, 10);
      await tx.user.update({
        where: { id: row.userId },
        data: { passwordHash },
      });
    });

    return { ok: true, message: 'Sua senha foi redefinida.' };
  }
}
