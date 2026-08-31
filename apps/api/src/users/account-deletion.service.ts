import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isProduction } from '../common/env';
import { PrismaService } from '../prisma/prisma.service';
import { deleteLocalUploads } from '../common/utils/local-uploads';
import { UsersService } from './users.service';
import { AccountDeletionMailer } from './account-deletion.mailer';
import { sanitizeMailerError } from './resend-account-deletion.mailer';
import {
  ACCOUNT_DELETION_INVALID_LINK_MESSAGE,
  ACCOUNT_DELETION_MAIL_UNAVAILABLE_MESSAGE,
  ACCOUNT_DELETION_REQUEST_MESSAGE,
  ACCOUNT_DELETION_TOKEN_TTL_MS,
  buildDeletionConfirmUrl,
  generateDeletionToken,
  hashDeletionToken,
  maskEmailForLog,
  normalizeAccountEmail,
} from './account-deletion.crypto';

@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly mailer: AccountDeletionMailer,
  ) {}

  async requestDeletion(email: string) {
    if (isProduction() && !this.mailer.isConfigured()) {
      throw new ServiceUnavailableException(
        ACCOUNT_DELETION_MAIL_UNAVAILABLE_MESSAGE,
      );
    }

    const normalized = normalizeAccountEmail(email);
    const generic = { message: ACCOUNT_DELETION_REQUEST_MESSAGE };

    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
      select: { id: true },
    });
    if (!user) {
      hashDeletionToken(generateDeletionToken());
      return generic;
    }

    const token = generateDeletionToken();
    const tokenHash = hashDeletionToken(token);
    const expiresAt = new Date(Date.now() + ACCOUNT_DELETION_TOKEN_TTL_MS);

    await this.prisma.$transaction([
      this.prisma.accountDeletionRequest.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.accountDeletionRequest.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      }),
    ]);

    const confirmUrl = buildDeletionConfirmUrl(
      process.env.PUBLIC_APP_URL || 'http://localhost:8080',
      token,
    );

    try {
      await this.mailer.sendDeletionLink({ to: normalized, confirmUrl });
    } catch (err) {
      await this.prisma.accountDeletionRequest.updateMany({
        where: { tokenHash, usedAt: null },
        data: { usedAt: new Date() },
      });
      const mailerErr = JSON.stringify(sanitizeMailerError(err));
      if (!isProduction()) {
        this.logger.warn(
          `Falha ao enviar instruções de exclusão para ${maskEmailForLog(normalized)} ${mailerErr}`,
        );
      } else {
        this.logger.warn(`Falha ao enviar instruções de exclusão de conta ${mailerErr}`);
      }
      return generic;
    }

    return generic;
  }

  async confirmDeletion(token: string) {
    const raw = token?.trim() ?? '';
    if (!raw) {
      throw new BadRequestException(ACCOUNT_DELETION_INVALID_LINK_MESSAGE);
    }

    const tokenHash = hashDeletionToken(raw);

    let urls: Array<string | null | undefined>;
    try {
      urls = await this.prisma.$transaction(async (tx) => {
        const marked = await tx.accountDeletionRequest.updateMany({
          where: {
            tokenHash,
            usedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { usedAt: new Date() },
        });
        if (marked.count !== 1) {
          throw new BadRequestException(ACCOUNT_DELETION_INVALID_LINK_MESSAGE);
        }
        const row = await tx.accountDeletionRequest.findUnique({
          where: { tokenHash },
          select: { userId: true },
        });
        if (!row) {
          throw new BadRequestException(ACCOUNT_DELETION_INVALID_LINK_MESSAGE);
        }
        return this.users.deleteUserRecord(tx, row.userId);
      });
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      if (err instanceof NotFoundException) {
        throw new BadRequestException(ACCOUNT_DELETION_INVALID_LINK_MESSAGE);
      }
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new BadRequestException(ACCOUNT_DELETION_INVALID_LINK_MESSAGE);
      }
      throw err;
    }

    await deleteLocalUploads(urls);
    return { ok: true, message: 'Sua conta foi excluída.' };
  }
}
